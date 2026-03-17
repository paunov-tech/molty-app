// api/morning-brief.js — ANVIL™ Jutarnji Brifing
// Cron: 0 6 * * * (07:00 CET)
// Env potrebni: ANTHROPIC_API_KEY, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN

import { google } from "googleapis";

export default async function handler(req, res) {
  if (req.headers["authorization"] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const today = new Date().toLocaleDateString("sr-Latn", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
    const timeStr = new Date().toLocaleTimeString("sr-Latn", { hour: "2-digit", minute: "2-digit" });
    const dayOfWeek = new Date().getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // ── 1. Claude generiše brifing ─────────────────────────────────────────
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: `Ti si ANVIL™ AI jutarnji brifing agent za Miroslava Paunova.
TSR – Technical Service Representative, Calderys South-East Europe.
Firma: SIAL Consulting d.o.o. | Region: Srbija, Bosna, Makedonija, Bugarska, Hrvatska, Crna Gora.
Klijenti: HBIS (Smederevo), ArcelorMittal (Zenica), Lafarge, Makstil (Skoplje), Metalfer.
Specijalnost: ugradnja i servisiranje vatrostalnih materijala u metalurgiji i industriji cementa.

Danas je: ${today}, ${timeStr}. ${isWeekend ? "Vikend je." : "Radni dan."}

Napiši koncizan, koristan jutarnji brifing. Vrati SAMO validan JSON bez backtick-ova i bez teksta pre/posle:
{
  "greeting": "personalizovan pozdrav, 1 rečenica, pomeni dan u sedmici",
  "fokus": "2-3 konkretne rečenice o tome šta TSR treba da prioritizuje danas — terenska poseta, praćenje klijenata, dokumentacija, itd.",
  "podsetnici": [
    "konkretan podsetnik 1 vezan za Calderys SEE operacije",
    "konkretan podsetnik 2",
    "konkretan podsetnik 3"
  ],
  "savjet": "1 praktični savjet za efikasan rad na terenu ili sa klijentima danas",
  "misao": "kratka motivaciona rečenica na srpskom, originalna, nije kliše"
}`,
        messages: [{ role: "user", content: "Jutarnji brifing za danas." }],
      }),
    });

    const claudeData = await claudeRes.json();
    if (claudeData.error) throw new Error("Claude: " + claudeData.error.message);

    const textBlock = claudeData.content?.find(b => b.type === "text");
    const raw = textBlock?.text || "{}";
    let brief;
    try {
      brief = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      brief = {
        greeting: "Dobro jutro, Miroslav!",
        fokus: raw,
        podsetnici: [],
        savjet: "",
        misao: "Svaki dan je nova šansa."
      };
    }

    // ── 2. HTML email ──────────────────────────────────────────────────────
    const OR = "#E8511A";
    const podsetnici = (brief.podsetnici || [])
      .map(p => `<li style="margin-bottom:8px;color:#333;font-size:14px;">${p}</li>`)
      .join("");

    const html = `<!DOCTYPE html>
<html lang="sr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0ede8;font-family:'Courier New',monospace;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#f0ede8;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #ddd;border-radius:8px;overflow:hidden;max-width:600px;">

  <tr><td style="background:#060a12;padding:28px 32px;">
    <div style="font-size:9px;color:${OR};letter-spacing:4px;font-weight:bold;margin-bottom:8px;text-transform:uppercase;">ANVIL™ · Jutarnji Brifing</div>
    <div style="font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:-0.5px;">${today}</div>
    <div style="font-size:12px;color:#5a6580;margin-top:6px;">Calderys South-East Europe · SIAL Consulting d.o.o.</div>
    <div style="height:2px;background:${OR};margin-top:20px;border-radius:1px;"></div>
  </td></tr>

  <tr><td style="padding:24px 32px 0;">
    <div style="font-size:15px;color:#1a1a1a;line-height:1.7;padding:14px 18px;background:#fdf8f5;border-left:3px solid ${OR};border-radius:0 6px 6px 0;">
      ${brief.greeting || "Dobro jutro, Miroslav!"}
    </div>
  </td></tr>

  <tr><td style="padding:20px 32px 0;">
    <div style="font-size:9px;color:${OR};letter-spacing:3px;font-weight:bold;margin-bottom:10px;text-transform:uppercase;">Fokus Dana</div>
    <div style="font-size:14px;color:#333;line-height:1.8;">${brief.fokus || ""}</div>
  </td></tr>

  ${podsetnici ? `
  <tr><td style="padding:20px 32px 0;">
    <div style="font-size:9px;color:${OR};letter-spacing:3px;font-weight:bold;margin-bottom:10px;text-transform:uppercase;">Podsetnici</div>
    <ul style="margin:0;padding-left:18px;line-height:1.9;">${podsetnici}</ul>
  </td></tr>` : ""}

  ${brief.savjet ? `
  <tr><td style="padding:20px 32px 0;">
    <div style="font-size:9px;color:#3b82f6;letter-spacing:3px;font-weight:bold;margin-bottom:10px;text-transform:uppercase;">Savjet Dana</div>
    <div style="font-size:13px;color:#444;line-height:1.75;padding:12px 16px;background:#f0f6ff;border-radius:6px;border-left:3px solid #3b82f6;">
      ${brief.savjet}
    </div>
  </td></tr>` : ""}

  ${brief.misao ? `
  <tr><td style="padding:20px 32px;">
    <div style="text-align:center;padding:16px;border-top:1px solid #f0ede8;">
      <div style="font-size:13px;color:#888;font-style:italic;line-height:1.7;">"${brief.misao}"</div>
    </div>
  </td></tr>` : ""}

  <tr><td style="background:#060a12;padding:16px 32px;">
    <table width="100%"><tr>
      <td style="font-size:10px;color:#3a4560;">ANVIL™ by SIAL Consulting d.o.o.</td>
      <td align="right" style="font-size:10px;color:#3a4560;">${timeStr} · Calderys Serbia SEE</td>
    </tr></table>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;

    // ── 3. Pošalji email ───────────────────────────────────────────────────
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const to = process.env.GMAIL_USER_EMAIL || "paunov@calderyserbia.com";
    const subject = `ANVIL™ Brifing · ${today}`;
    const rawMsg = [
      `From: ANVIL Platform <${to}>`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      html,
    ].join("\r\n");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: Buffer.from(rawMsg).toString("base64url") },
    });

    console.log(`[ANVIL Brifing] OK · ${today}`);
    return res.status(200).json({ ok: true, date: today, greeting: brief.greeting });

  } catch (err) {
    console.error("[ANVIL Brifing] Greška:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
