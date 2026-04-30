// ═══════════════════════════════════════════════════════════════
// ANVIL™ WORKER — /api/morning-brief
// Jutarnji brifing: Firestore DocCenter → Claude AI → Email
// Cron: 0 6 * * * (07:00 svaki dan, lokalno CET = 06:00 UTC)
// Deploy: molty-worker (Vercel) → api/morning-brief.js
// ═══════════════════════════════════════════════════════════════

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { google } from "googleapis";

// ── Firebase init (lazy — ne crashuj cold start ako env fali) ──
function initAdmin() {
  if (getApps().length > 0) return;
  // Konzistentno sa ostalim endpointima (gmail-sync, agent-orchestrator, ...).
  // Stari kod je koristio FIREBASE_SERVICE_ACCOUNT (JSON.parse na undefined →
  // module-level crash → 500 FUNCTION_INVOCATION_FAILED pre handler-a).
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID || 'molty-portal',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}
let _db = null;
function getDb() {
  if (!_db) { initAdmin(); _db = getFirestore(); }
  return _db;
}

// ── Anthropic (raw fetch — paket @anthropic-ai/sdk nije u deps) ──
async function callClaude({ model, max_tokens, messages, system }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens, messages, ...(system && { system }) }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data;
}

// ── Gmail OAuth2 ───────────────────────────────────────────────
function getGmailClient() {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
  );
  oAuth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: "v1", auth: oAuth2Client });
}

// ── Konstante ──────────────────────────────────────────────────
const RECIPIENT = "paunov@calderyserbia.com";
const SENDER    = "paunov@calderyserbia.com";

// ── Čitaj DocCenter emailove iz Firestore ─────────────────────
async function getRecentDocs(days = 7) {
  const cutoff = new Date(Date.now() - days * 86400000);
  const snap = await getDb().collection("docworker")
    .where("processedAt", ">=", cutoff)
    .orderBy("processedAt", "desc")
    .limit(50)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Čitaj pipeline iz Firestore ───────────────────────────────
async function getPipelines() {
  try {
    const snap = await getDb().collection("pipelines")
      .orderBy("updatedAt", "desc")
      .limit(30)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

// ── Čitaj install jobs ────────────────────────────────────────
async function getActiveJobs() {
  // Single-field orderBy + JS filter — izbegava composite index na (status, _updatedAt)
  // Ranije je bio .where("status","in",[...]).orderBy("_updatedAt") koji je pucao i try/catch
  // ga je gutao → install jobs su uvek bili prazni u briefingu.
  try {
    const snap = await getDb().collection("install_workflows")
      .orderBy("_updatedAt", "desc")
      .limit(60)
      .get();
    const ACTIVE = new Set(["active", "in_progress", "pending"]);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(d => ACTIVE.has(d.status))
      .slice(0, 20);
  } catch { return []; }
}

// ── Generiši brifing sa Claude ────────────────────────────────
async function generateBriefing({ docs, pipelines, jobs, date }) {
  const docsText = docs.map(d => {
    const ts = d.processedAt?.toDate?.()?.toISOString?.()?.slice(0,10) || "";
    return `[${ts}] ${d.docType?.toUpperCase() || "DOC"} | ${d.customer || "?"} | ${d.subject || d.fileName || ""} | ${d.summary || ""} | Iznos: ${d.amount ? `€${d.amount}` : "—"} | Status: ${d.status || "—"}`;
  }).join("\n");

  const pipeText = pipelines.slice(0, 15).map(p => {
    const days = p.updatedAt ? Math.floor((Date.now() - new Date(p.updatedAt).getTime()) / 86400000) : "?";
    return `${p.customer || "?"} | Faza: ${p.status || "?"} | ${p.totalAmount ? `€${p.totalAmount}` : ""} | Zadnje ažuriranje: ${days}d ago`;
  }).join("\n");

  const jobsText = jobs.map(j =>
    `${j.jobName || j._id} | Kupac: ${j.customerName || "?"} | Status: ${j.status || "?"}`
  ).join("\n");

  const prompt = `Ti si ANVIL AGENT AIv4 — ekspert za vatrostalne materijale i B2B prodaju u industriji čelika i livnica na Balkanu.

Generiši JUTARNJI OPERATIVNI BRIFING za ${date} na osnovu sledećih podataka.

DOKUMENTI IZ POSLEDNJIH 7 DANA (DocCenter/Gmail):
${docsText || "(nema novih dokumenata)"}

PIPELINE STATUS:
${pipeText || "(nema podataka)"}

AKTIVNI INSTALL JOBOVI:
${jobsText || "(nema aktivnih jobova)"}

PRAVILA ZA BRIFING:
1. Koristi TAČNE nazive kupaca, tačne iznose i datume iz podataka
2. Kategorišuj: KRITIČNO (plaćanja, sudski, kašnjenja >7d) → DANAS → PREDIKCIJE
3. Preporuke moraju biti konkretne: šta, ko, do kada
4. Koristi srpski jezik, stručnu terminologiju (nalog, faktura, OC, PO, otpremnica)
5. Format tabela za "Danas" i "Predikcije"
6. Budi kratak ali precizan — ovo je operativni alat, ne marketinški tekst
7. Na kraju: "Preporuke agenta" — šta AI može automatski uraditi

FORMAT (Markdown):
# ☀️ JUTARNJI BRIFING — [datum] ([dan u nedelji])
**ANVIL AI | Vatrostalni materijali | Teritorijalni menadžment**

## 🔴 KRITIČNO
[samo zaista hitne stvari]

## 🟠 DANAS
[tabela zadataka]

## 🔮 PREDIKCIJE
[tabela rizika i šansi]

## 📊 STATISTIKA
[ključne metrike]

## 💡 PREPORUKE AGENTA
[konkretne akcije]

*Generisano: [datum vreme] | ANVIL AI Agent v4 | Sledeći brifing: [sutra]*`;

  const msg = await callClaude({
    model: "claude-opus-4-6",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  return msg.content?.[0]?.text || "";
}

// ── Konvertuj Markdown → HTML ──────────────────────────────────
function mdToHtml(md) {
  return md
    .replace(/^# (.+)$/gm, '<h1 style="color:#E8511A;font-family:monospace;border-bottom:2px solid #E8511A;padding-bottom:8px;">$1</h1>')
    .replace(/^## 🔴 (.+)$/gm, '<h2 style="color:#EF4444;margin-top:24px;">🔴 $1</h2>')
    .replace(/^## 🟠 (.+)$/gm, '<h2 style="color:#F97316;margin-top:24px;">🟠 $1</h2>')
    .replace(/^## 🔮 (.+)$/gm, '<h2 style="color:#A78BFA;margin-top:24px;">🔮 $1</h2>')
    .replace(/^## 📊 (.+)$/gm, '<h2 style="color:#3B82F6;margin-top:24px;">📊 $1</h2>')
    .replace(/^## 💡 (.+)$/gm, '<h2 style="color:#22C55E;margin-top:24px;">💡 $1</h2>')
    .replace(/^## (.+)$/gm, '<h2 style="color:#E8511A;margin-top:24px;">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^(\|.+\|)$/gm, (row) => {
      if (row.includes('---')) return '';
      const cells = row.split('|').filter(c => c.trim());
      const isHeader = cells.some(c => c.includes('**') || /^[A-Z#]/.test(c.trim()));
      const tag = isHeader ? 'th' : 'td';
      return '<tr>' + cells.map(c => `<${tag} style="padding:6px 12px;border:1px solid #1E3050;text-align:left;">${c.trim()}</${tag}>`).join('') + '</tr>';
    })
    .replace(/(<tr>.*<\/tr>\n?)+/gs, m => `<table style="border-collapse:collapse;width:100%;margin:12px 0;">${m}</table>`)
    .replace(/^\d+\. \*\*(.+?)\*\* — (.+)$/gm, '<li style="margin:8px 0;"><strong>$1</strong> — $2</li>')
    .replace(/^\d+\. (.+)$/gm, '<li style="margin:8px 0;">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/gs, m => `<ol style="padding-left:20px;">${m}</ol>`)
    .replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid #E8511A;padding-left:12px;color:#8BA0BC;font-style:italic;">$1</blockquote>')
    .replace(/\n\n/g, '</p><p style="margin:8px 0;">')
    .replace(/^(?!<[holtbu])/gm, '')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:#0F1929;padding:2px 6px;border-radius:3px;font-family:monospace;color:#06B6D4;">$1</code>');
}

// ── Pošalji email ─────────────────────────────────────────────
async function sendEmail(subject, bodyMd) {
  const gmail = getGmailClient();
  const bodyHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#0B1220;color:#E8EDF6;font-family:'Segoe UI',Arial,sans-serif;max-width:800px;margin:0 auto;padding:24px;">
  <div style="background:#0F1929;border:1px solid #1E3050;border-radius:12px;padding:24px;">
    <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #1E3050;">
      <div style="font-size:11px;color:#E8511A;letter-spacing:3px;font-weight:800;font-family:monospace;">ANVIL™ AI AGENT v4</div>
      <div style="font-size:9px;color:#4E6480;margin-top:4px;letter-spacing:2px;">VATROSTALNI MATERIJALI · BALKANS TSR · CALDERYS</div>
    </div>
    ${mdToHtml(bodyMd)}
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #1E3050;font-size:10px;color:#4E6480;text-align:center;">
      ANVIL™ by SIAL Consulting d.o.o. · paunov@calderyserbia.com<br>
      Ovaj brifing je automatski generisan. Ne odgovarajte na ovaj email.
    </div>
  </div>
</body>
</html>`;

  const raw = Buffer.from(
    `From: ANVIL AI <${SENDER}>\r\n` +
    `To: ${RECIPIENT}\r\n` +
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: text/html; charset=utf-8\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    Buffer.from(bodyHtml).toString("base64")
  ).toString("base64url");

  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
}

// ── Sačuvaj u Firestore ───────────────────────────────────────
async function saveBriefing(text, date) {
  await getDb().collection("morning_brief").doc("latest").set({
    text,
    date,
    generatedAt: new Date(),
    sentTo: RECIPIENT,
  });
}

// ── MAIN HANDLER ──────────────────────────────────────────────
export default async function handler(req, res) {
  // Autorizacija
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (secret && token !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const today = new Date();
    const dateStr = today.toLocaleDateString("sr-Latn", {
      day: "numeric", month: "long", year: "numeric", weekday: "long"
    });

    // 1. Prikupi podatke
    const [docs, pipelines, jobs] = await Promise.all([
      getRecentDocs(7),
      getPipelines(),
      getActiveJobs(),
    ]);

    // 2. Generiši AI brifing
    const briefText = await generateBriefing({ docs, pipelines, jobs, date: dateStr });

    // 3. Pošalji email
    const subject = `☀️ ANVIL Jutarnji Brifing — ${today.toLocaleDateString("sr-Latn", { day: "numeric", month: "short", year: "numeric" })}`;
    await sendEmail(subject, briefText);

    // 4. Sačuvaj u Firestore (da se prikazuje u CommHub)
    await saveBriefing(briefText, today.toISOString());

    return res.status(200).json({
      ok: true,
      sentTo: RECIPIENT,
      date: dateStr,
      docsAnalyzed: docs.length,
      pipelinesChecked: pipelines.length,
    });

  } catch (err) {
    console.error("[morning-brief] Error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
