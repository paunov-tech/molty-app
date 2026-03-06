// api/daily-digest.js — Daily Digest v2 with HTML email
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = (req.headers.authorization || '').replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { initializeApp, getApps, cert } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    if (!getApps().length) {
      initializeApp({ credential: cert({
        projectId: 'molty-portal',
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      })});
    }
    const db = getFirestore();

    const [followupsSnap, forwardsSnap, docsSnap] = await Promise.all([
      db.collection('auto_followups').where('status', '==', 'pending').limit(20).get(),
      db.collection('tds_forwards').where('status', '==', 'pending').limit(20).get(),
      db.collection('docworker').where('status', '==', 'new').limit(20).get(),
    ]);

    const followups = followupsSnap.docs.map(d => d.data().customerName || '?');
    const newDocs = docsSnap.docs.map(d => `${d.data().customer || '?'} — ${d.data().docType || '?'} (${d.data().amount ? d.data().amount + ' EUR' : 'iznos nepoznat'})`);
    const pendingForwards = forwardsSnap.size;

    const prompt = `Ti si ANVIL™ AI asistent za Miroslava Paunova, TSR za Calderys Balkani.
Calderys prodaje vatrostalne materijale u: Srbija, BiH, Makedonija, Bugarska, Hrvatska, Crna Gora.
Kupci: čeličane (HBIS, AMZ, Makstil), cementare (Lafarge, Heidelberg), livnice (Livarna Titan, LTH), industrija aluminijuma.

PODACI ZA DANAS:
- Follow-up kupci koji čekaju odgovor: ${followups.join(', ') || 'nema'}
- Novi dokumenti u sistemu: ${newDocs.length > 0 ? newDocs.join(' | ') : 'nema'}
- TDS dokumenti čekaju prosleđivanje: ${pendingForwards}

Napiši dnevni izveštaj na srpskom u JSON formatu:
{
  "prioriteti": "2-3 konkretne akcije za danas",
  "dokumenti": "pregled novih dokumenata i šta treba uraditi",
  "trziste": "kratka BI napomena o tržištu vatrostalnih materijala na Balkanu — šta se dešava sa čeličanama, cementarama, aluminjumskom industrijom, koji trendovi utiču na prodaju vatrostalnih materijala",
  "konkurencija": "kratka napomena o konkurentima (RHI Magnesita, Vesuvius, Refratechnik, Calderys competition) — generalni trendovi, ne izmišljaj specifične vesti",
  "sansa": "jedna konkretna prodajna šansa ili preporuka za Miroslava na osnovu podataka"
}
Odgovori SAMO JSON.`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const aiData = await aiRes.json();
    const text = aiData.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    const sections = match ? JSON.parse(match[0]) : { prioriteti: text, dokumenti: '', trziste: '', konkurencija: '', sansa: '' };

    const today = new Date().toLocaleDateString('sr-Latn-RS', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const digestText = `PRIORITETI: ${sections.prioriteti}\n\nDOKUMENTI: ${sections.dokumenti}\n\nTRŽIŠTE: ${sections.trziste}\n\nKONKURENCIJA: ${sections.konkurencija}\n\nŠANSA DANA: ${sections.sansa}`;

    // HTML email
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:20px;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1a1d2e,#252840);border:1px solid #E8511A40;border-radius:12px;padding:24px;margin-bottom:16px;">
    <div style="display:flex;align-items:center;margin-bottom:8px;">
      <span style="font-size:24px;margin-right:10px;">⚒️</span>
      <span style="color:#E8511A;font-size:20px;font-weight:700;letter-spacing:2px;">ANVIL™</span>
      <span style="color:#6b7280;font-size:14px;margin-left:8px;">Daily Intelligence</span>
    </div>
    <div style="color:#9ca3af;font-size:13px;">${today}</div>
    <div style="color:#6b7280;font-size:12px;margin-top:4px;">Miroslav Paunov · TSR Calderys Balkani</div>
  </div>

  <!-- Prioriteti -->
  <div style="background:#1a1d2e;border:1px solid #E8511A30;border-left:3px solid #E8511A;border-radius:8px;padding:16px;margin-bottom:12px;">
    <div style="color:#E8511A;font-size:11px;font-weight:700;letter-spacing:1px;margin-bottom:8px;">🎯 PRIORITETI DANAS</div>
    <div style="color:#e5e7eb;font-size:14px;line-height:1.6;">${sections.prioriteti}</div>
  </div>

  <!-- Dokumenti -->
  <div style="background:#1a1d2e;border:1px solid #3b82f630;border-left:3px solid #3b82f6;border-radius:8px;padding:16px;margin-bottom:12px;">
    <div style="color:#3b82f6;font-size:11px;font-weight:700;letter-spacing:1px;margin-bottom:8px;">📄 DOKUMENTI (${newDocs.length} novih)</div>
    <div style="color:#e5e7eb;font-size:14px;line-height:1.6;">${sections.dokumenti}</div>
  </div>

  <!-- Tržište -->
  <div style="background:#1a1d2e;border:1px solid #10b98130;border-left:3px solid #10b981;border-radius:8px;padding:16px;margin-bottom:12px;">
    <div style="color:#10b981;font-size:11px;font-weight:700;letter-spacing:1px;margin-bottom:8px;">📊 BI TRŽIŠTE</div>
    <div style="color:#e5e7eb;font-size:14px;line-height:1.6;">${sections.trziste}</div>
  </div>

  <!-- Konkurencija -->
  <div style="background:#1a1d2e;border:1px solid #8b5cf630;border-left:3px solid #8b5cf6;border-radius:8px;padding:16px;margin-bottom:12px;">
    <div style="color:#8b5cf6;font-size:11px;font-weight:700;letter-spacing:1px;margin-bottom:8px;">🔍 KONKURENCIJA</div>
    <div style="color:#e5e7eb;font-size:14px;line-height:1.6;">${sections.konkurencija}</div>
  </div>

  <!-- Šansa dana -->
  <div style="background:linear-gradient(135deg,#E8511A15,#f59e0b10);border:1px solid #f59e0b40;border-radius:8px;padding:16px;margin-bottom:16px;">
    <div style="color:#f59e0b;font-size:11px;font-weight:700;letter-spacing:1px;margin-bottom:8px;">💡 ŠANSA DANA</div>
    <div style="color:#fde68a;font-size:14px;line-height:1.6;font-style:italic;">${sections.sansa}</div>
  </div>

  <!-- Footer -->
  <div style="text-align:center;color:#374151;font-size:11px;padding-top:12px;border-top:1px solid #1f2937;">
    ANVIL™ by SIAL Consulting · Auto-generisan izveštaj · ${new Date().toISOString().slice(0,19).replace('T',' ')} UTC
  </div>

</div>
</body>
</html>`;

    const result = { digest: digestText, pendingFollowups: followups.length, pendingForwards, newDocs: newDocs.length, generatedAt: new Date().toISOString() };
    await db.collection('daily_digest').doc('latest').set(result);

    // Send email
    const { google } = await import('googleapis');
    const oauth2 = new google.auth.OAuth2(process.env.GMAIL_CLIENT_ID, process.env.GMAIL_CLIENT_SECRET);
    oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
    const gmail = google.gmail({ version: 'v1', auth: oauth2 });

    const subject = `⚒️ ANVIL™ Dnevni Izveštaj — ${today}`;
    const boundary = 'anvil_boundary_001';
    const raw = [
      `To: paunov@calderyserbia.com`,
      `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      digestText,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      html,
      ``,
      `--${boundary}--`,
    ].join('\r\n');

    const profile = await gmail.users.getProfile({ userId: 'me' });
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw: Buffer.from(raw).toString('base64url') } });

    return res.json({ ok: true, ...result, sentFrom: profile.data.emailAddress });

  } catch (e) {
    console.error('[daily-digest]', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
