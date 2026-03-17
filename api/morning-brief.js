// api/morning-brief.js — ANVIL™ AI Jutarnji Brifing v2
// Format: Agent AI brifing sa dokumentima, predikcijama, statistikama
// Cron: 0 6 * * * (07:00 CET)

import { google } from "googleapis";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export default async function handler(req, res) {
  if (req.headers["authorization"] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // ── Firebase init ────────────────────────────────────────────
    if (!getApps().length) {
      initializeApp({ credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID || "molty-portal",
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      })});
    }
    const db = getFirestore();

    // ── Gmail init ───────────────────────────────────────────────
    const oauth2 = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
    );
    oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
    const gmail = google.gmail({ version: "v1", auth: oauth2 });

    const today = new Date().toLocaleDateString("sr-Latn", {
      weekday: "long", day: "numeric", month: "long", year: "numeric"
    });
    const dateStr = new Date().toISOString().slice(0, 10);

    // ── Čitaj Gmail poslednjih 7 dana ────────────────────────────
    let gmailSummary = "";
    try {
      const msgs = await gmail.users.messages.list({
        userId: "me",
        maxResults: 50,
        q: `after:${new Date(Date.now()-7*86400000).toISOString().slice(0,10)} -in:sent`
      });
      const ids = msgs.data.messages?.slice(0, 30) || [];
      const subjects = [];
      for (const m of ids.slice(0, 15)) {
        const msg = await gmail.users.messages.get({
          userId: "me", id: m.id,
          format: "metadata",
          metadataHeaders: ["Subject", "From", "Date"]
        });
        const h = msg.data.payload?.headers || [];
        const subj = h.find(x => x.name === "Subject")?.value || "";
        const from = h.find(x => x.name === "From")?.value || "";
        subjects.push(`- Od: ${from.slice(0,50)} | ${subj.slice(0,80)}`);
      }
      gmailSummary = subjects.join("\n");
    } catch(e) {
      gmailSummary = "Gmail nije dostupan: " + e.message;
    }

    // ── Čitaj Firestore — pipelines, auto_followups ──────────────
    let firestoreContext = "";
    try {
      const pipes = await db.collection("pipelines")
        .orderBy("updatedAt", "desc").limit(30).get();
      const pipeData = pipes.docs.map(d => {
        const x = d.data();
        return `${x.customer || "?"} | ${x.status || "?"} | ${x.value ? x.value+"EUR" : ""} | ${x.docType || ""}`;
      }).join("\n");

      const followups = await db.collection("auto_followups")
        .where("status", "==", "pending").limit(20).get();
      const fuData = followups.docs.map(d => {
        const x = d.data();
        return `${x.customer || "?"} — ${x.reason || "?"} (${x.daysSince || "?"}d)`;
      }).join("\n");

      firestoreContext = `PIPELINES:\n${pipeData}\n\nFOLLOWUPS:\n${fuData}`;
    } catch(e) {
      firestoreContext = "Firestore: " + e.message;
    }

    // ── Claude generiše brifing ──────────────────────────────────
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: `Ti si ANVIL™ AI jutarnji brifing agent za Miroslava Paunova.
TSR – Calderys South-East Europe | SIAL Consulting d.o.o.
Klijenti: HBIS, ArcelorMittal, Lafarge, Makstil, Metalfer, INA, Talum, Livarni, TKS Group i drugi.

Generiši KOMPLETAN jutarnji brifing u TAČNO ovom formatu (Markdown):

# ☀️ JUTARNJI BRIFING — ${today}
### ANVIL AI | Vatrostalni materijali

---

## 🔴 KRITIČNO
[lista kritičnih stavki sa numeracijom]

---

## 🟠 DANAS
[checkbox lista zadataka za danas]

---

## 🔮 PREDIKCIJE
[tabela sa prioritetom, kupcem, očekivanjem]

---

## 📊 STATISTIKA DANA
[tabela sa metrikama]

---

## 💡 PREPORUKE ANVIL AGENTA
[numerisana lista automatskih akcija koje čekaju odobrenje]

---

> Sledeći brifing: sutra, ${new Date(Date.now()+86400000).toLocaleDateString("sr-Latn")} u 07:00

Budi koncizan, konkretan i akciono orijentisan. Fokus na novac i rokove.
Sve u EUR. Sve na srpskom.`,
        messages: [{
          role: "user",
          content: `Danas je ${today}.\n\nGMAIL (poslednjih 7 dana):\n${gmailSummary}\n\n${firestoreContext}\n\nGeneriši kompletan jutarnji brifing.`
        }]
      })
    });

    const claudeData = await claudeRes.json();
    if (claudeData.error) throw new Error("Claude: " + claudeData.error.message);
    const markdown = claudeData.content?.find(b => b.type === "text")?.text || "";

    // ── Markdown → HTML email ────────────────────────────────────
    const OR = "#E8511A";
    const html = markdownToHtml(markdown, today, OR);

    // ── Pošalji email ────────────────────────────────────────────
    const to = process.env.GMAIL_USER_EMAIL || "paunov@calderyserbia.com";
    const subject = `🤖 ANVIL Brifing · ${today}`;
    const rawMsg = [
      `From: ANVIL AI <${to}>`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      html,
    ].join("\r\n");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: Buffer.from(rawMsg).toString("base64url") }
    });

    // ── Sačuvaj u Firestore ──────────────────────────────────────
    await db.collection("brain_insights").add({
      type: "morning_brief",
      date: dateStr,
      content: markdown,
      generatedAt: Date.now(),
    });

    console.log(`[ANVIL Brifing v2] OK · ${today}`);
    return res.status(200).json({ ok: true, date: today });

  } catch(err) {
    console.error("[ANVIL Brifing v2]", err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ── Markdown → HTML konverter ────────────────────────────────────
function markdownToHtml(md, today, OR) {
  // Konvertuj Markdown u HTML
  let html = md
    // Headings
    .replace(/^# (.+)$/mg, `<h1 style="font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px;margin:0 0 4px">$1</h1>`)
    .replace(/^### (.+)$/mg, `<div style="font-size:11px;color:#5a6580;margin-bottom:20px">$1</div>`)
    .replace(/^## (.+)$/mg, (_, t) => {
      const color = t.includes("KRITIČNO") ? "#ef4444" :
                    t.includes("DANAS") ? OR :
                    t.includes("PREDIKCIJE") ? "#8b5cf6" :
                    t.includes("STATISTIKA") ? "#22c55e" :
                    t.includes("PREPORUKE") ? "#3b82f6" : "#e2e6ef";
      return `<div style="font-size:9px;color:${color};letter-spacing:3px;font-weight:800;margin:24px 0 10px;text-transform:uppercase">${t}</div>`;
    })
    // Bold
    .replace(/\*\*(.+?)\*\*/g, `<strong style="color:#e2e6ef">$1</strong>`)
    // Checkboxes
    .replace(/^- \[ \] (.+)$/mg, `<div style="padding:6px 0;border-bottom:1px solid #1e2535;font-size:13px;color:#c8d0e0">☐ $1</div>`)
    // Bullet points
    .replace(/^- (.+)$/mg, `<div style="padding:4px 0 4px 12px;font-size:13px;color:#c8d0e0;border-left:2px solid #1e2535">$1</div>`)
    // Tables — osnovna konverzija
    .replace(/^\|(.+)\|$/mg, (line) => {
      if (line.includes("---")) return "";
      const cells = line.split("|").filter(c => c.trim());
      const isHeader = cells.some(c => c.includes("**") || ["#","Prioritet","Metrika","Kupac"].some(h => c.trim().startsWith(h)));
      const tdStyle = `style="padding:6px 12px;border:1px solid #1e2535;font-size:12px;color:#c8d0e0"`;
      const thStyle = `style="padding:6px 12px;border:1px solid #2a3548;font-size:9px;letter-spacing:2px;color:#5a6580;background:#0c1018"`;
      const tag = isHeader ? "th" : "td";
      return `<tr>${cells.map(c => `<${tag} ${isHeader?thStyle:tdStyle}>${c.trim()}</${tag}>`).join("")}</tr>`;
    })
    // Numbered items
    .replace(/^(\d+)\. (.+)$/mg, `<div style="padding:8px 0;border-bottom:1px solid #1e2535;font-size:13px;color:#c8d0e0"><span style="color:${OR};font-weight:800;margin-right:8px">$1.</span>$2</div>`)
    // Blockquote
    .replace(/^> (.+)$/mg, `<div style="padding:10px 14px;background:#0c1018;border-left:3px solid ${OR};font-size:11px;color:#5a6580;margin:16px 0">$1</div>`)
    // HR
    .replace(/^---$/mg, `<div style="height:1px;background:#1e2535;margin:16px 0"></div>`)
    // Newlines
    .replace(/\n/g, "<br>");

  // Wrap tabele
  html = html.replace(/(<tr>.*?<\/tr>(<br>)*)+/gs, (m) =>
    `<table style="width:100%;border-collapse:collapse;margin:10px 0">${m.replace(/<br>/g,"")}</table>`
  );

  return `<!DOCTYPE html>
<html lang="sr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0ede8;font-family:'Courier New',monospace">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#f0ede8">
<tr><td align="center">
<table width="680" cellpadding="0" cellspacing="0" style="background:#060a12;border-radius:12px;overflow:hidden;max-width:680px">

  <tr><td style="background:#060a12;padding:28px 32px 20px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="font-size:9px;color:${OR};letter-spacing:4px;font-weight:bold;margin-bottom:8px">🤖 ANVIL™ AI AGENT · JUTARNJI BRIFING</div>
      </div>
    </div>
    <div style="height:2px;background:${OR};margin-top:16px;border-radius:1px"></div>
  </td></tr>

  <tr><td style="padding:24px 32px 32px">
    ${html}
  </td></tr>

  <tr><td style="background:#03050a;padding:16px 32px">
    <table width="100%"><tr>
      <td style="font-size:9px;color:#2a3548;font-family:'Courier New',monospace">ANVIL™ by SIAL Consulting d.o.o.</td>
      <td align="right" style="font-size:9px;color:#2a3548;font-family:'Courier New',monospace">Calderys Serbia · SEE · ${new Date().toLocaleTimeString("sr-Latn",{hour:"2-digit",minute:"2-digit"})}</td>
    </tr></table>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}
