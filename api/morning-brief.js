// api/morning-brief.js — Vercel Serverless Function
// Zamenjuje stari daily digest. Cron: 0 6 * * * (07:00 CET)
// Deploy: molty-worker Vercel projekat

export default async function handler(req, res) {
  // Autorizacija — samo cron pozivi
  const authHeader = req.headers["authorization"];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const today = new Date().toLocaleDateString("sr-Latn", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
    const timeStr = new Date().toLocaleTimeString("sr-Latn", { hour: "2-digit", minute: "2-digit" });

    // ── 1. Generiši brifing sa Claude ──────────────────────────────────────
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: `Ti si ANVIL™ AI jutarnji brifing agent za Miroslava Paunova.
TSR – Calderys South-East Europe | SIAL Consulting d.o.o.
Region: Srbija, Bosna, Makedonija, Bugarska, Hrvatska, Crna Gora.
Klijenti: HBIS, ArcelorMittal, Lafarge, Makstil, Metalfer.
Datum: ${today}, ${timeStr}.

Napiši koncizan jutarnji brifing. Vrati SAMO validan JSON bez backtick-ova:
{
  "greeting": "1 rečenica pozdrav",
  "fokus": "šta je danas prioritet, 2-3 rečenice",
  "podsetnici": ["podsetnik 1", "podsetnik 2"],
  "savjet_dana": "kratki praktični savjet za TSR rad na terenu",
  "misao": "motivaciona rečenica na srpskom"
}`,
        messages: [{ role: "user", content: "Jutarnji brifing." }],
        mcp_servers: [
          { type: "url", url: "https://gmail.mcp.claude.com/mcp", name: "gmail" },
          { type: "url", url: "https://gcal.mcp.claude.com/mcp", name: "google-calendar" }
        ]
      }),
    });

    const claudeData = await claudeRes.json();
    if (claudeData.error) throw new Error(claudeData.error.message);

    const textBlock = claudeData.content?.find(b => b.type === "text");
    const raw = textBlock?.text || "{}";
    let brief;
    try {
      brief = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      brief = { greeting: "Dobro jutro!", fokus: raw, podsetnici: [], savjet_dana: "", misao: "" };
    }

    // ── 2. Formiraj HTML email ──────────────────────────────────────────────
    const OR = "#E8511A";
    const podsetnici = (brief.podsetnici || []).map(p =>
      `<li style="margin-bottom:6px;color:#444;">${p}</li>`
    ).join("");

    const html = `<!DOCTYPE html>
<html lang="sr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ANVIL™ Jutarnji Brifing</title></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:'Courier New',monospace;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e0ddd8;border-radius:8px;overflow:hidden;">

  <!-- Header -->
  <tr><td style="background:#060a12;padding:28px 32px;">
    <div style="font-size:9px;color:${OR};letter-spacing:4px;font-weight:bold;margin-bottom:8px;">ANVIL™ · JUTARNJI BRIFING</div>
    <div style="font-size:24px;font-weight:bold;color:#ffffff;letter-spacing:-0.5px;">${today}</div>
    <div style="font-size:13px;color:#5a6580;margin-top:4px;">${timeStr} · Calderys South-East Europe</div>
    <div style="height:2px;background:${OR};margin-top:20px;border-radius:1px;"></div>
  </td></tr>

  <!-- Greeting -->
  <tr><td style="padding:24px 32px 0;">
    <div style="font-size:15px;color:#1a1a1a;line-height:1.7;padding:14px 18px;background:#fdf8f5;border-left:3px solid ${OR};border-radius:0 6px 6px 0;">
      ${brief.greeting || "Dobro jutro, Miroslav!"}
    </div>
  </td></tr>

  <!-- Fokus -->
  <tr><td style="padding:20px 32px 0;">
    <div style="font-size:9px;color:${OR};letter-spacing:3px;font-weight:bold;margin-bottom:10px;">FOKUS DANA</div>
    <div style="font-size:14px;color:#333;line-height:1.75;">${brief.fokus || ""}</div>
  </td></tr>

  ${podsetnici ? `
  <!-- Podsetnici -->
  <tr><td style="padding:20px 32px 0;">
    <div style="font-size:9px;color:${OR};letter-spacing:3px;font-weight:bold;margin-bottom:10px;">PODSETNICI</div>
    <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.8;">${podsetnici}</ul>
  </td></tr>` : ""}

  ${brief.savjet_dana ? `
  <!-- Savjet -->
  <tr><td style="padding:20px 32px 0;">
    <div style="font-size:9px;color:#3b82f6;letter-spacing:3px;font-weight:bold;margin-bottom:10px;">SAVJET DANA</div>
    <div style="font-size:13px;color:#444;line-height:1.7;padding:12px 16px;background:#f0f5ff;border-radius:6px;border:1px solid #dbe8ff;">
      ${brief.savjet_dana}
    </div>
  </td></tr>` : ""}

  ${brief.misao ? `
  <!-- Misao -->
  <tr><td style="padding:20px 32px 0;">
    <div style="font-size:13px;color:#888;font-style:italic;text-align:center;padding:16px;border-top:1px solid #f0ede8;border-bottom:1px solid #f0ede8;">
      "${brief.misao}"
    </div>
  </td></tr>` : ""}

  <!-- Footer -->
  <tr><td style="padding:24px 32px;background:#060a12;">
    <div style="display:flex;justify-content:space-between;">
      <span style="font-size:10px;color:#3a4560;">ANVIL™ by SIAL Consulting d.o.o.</span>
      <span style="font-size:10px;color:#3a4560;">Calderys Serbia · SEE Region</span>
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;

    // ── 3. Pošalji email via Gmail OAuth2 ──────────────────────────────────
    const { google } = await import("googleapis");
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const subject = `ANVIL™ Brifing · ${today}`;
    const message = [
      `From: ANVIL Platform <paunov@calderyserbia.com>`,
      `To: paunov@calderyserbia.com`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      html,
    ].join("\n");

    const encoded = Buffer.from(message).toString("base64url");
    await gmail.users.messages.send({ userId: "me", requestBody: { raw: encoded } });

    console.log(`[ANVIL Brifing] Poslat za ${today}`);
    return res.status(200).json({ ok: true, date: today });

  } catch (err) {
    console.error("[ANVIL Brifing] Greška:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
