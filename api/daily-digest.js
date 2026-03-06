// api/daily-digest.js — Daily Digest, šalje email svako jutro
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = (req.headers.authorization || '').replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // 1. Firebase
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

    // 2. Podaci
    const [followupsSnap, forwardsSnap, docsSnap] = await Promise.all([
      db.collection('auto_followups').where('status', '==', 'pending').limit(20).get(),
      db.collection('tds_forwards').where('status', '==', 'pending').limit(20).get(),
      db.collection('docworker').where('status', '==', 'new').limit(20).get(),
    ]);

    const followups = followupsSnap.docs.map(d => d.data().customerName || '?');
    const newDocs = docsSnap.docs.map(d => `${d.data().customer || '?'} — ${d.data().docType || '?'}`);
    const pendingForwards = forwardsSnap.size;

    // 3. Claude generiše izveštaj
    const prompt = `Ti si ANVIL™ AI asistent za Miroslava Paunova, TSR za Calderys Balkani (Srbija, BiH, Makedonija, Bugarska, Hrvatska, Crna Gora).
Napiši kratak dnevni izveštaj na srpskom jeziku (max 200 reči):
- Follow-up kupci koji čekaju odgovor: ${followups.join(', ') || 'nema'}
- Novi dokumenti u sistemu: ${newDocs.join(', ') || 'nema'}
- TDS dokumenti čekaju prosleđivanje: ${pendingForwards}
Format: 3 kratke sekcije — PRIORITETI DANAS, DOKUMENTI, AKCIJE. Bez markdown.`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const aiData = await aiRes.json();
    const digest = aiData.content?.[0]?.text || 'Greška pri generisanju izveštaja';

    // 4. Sačuvaj u Firestore
    const result = { digest, pendingFollowups: followups.length, pendingForwards, newDocs: newDocs.length, generatedAt: new Date().toISOString() };
    await db.collection('daily_digest').doc('latest').set(result);

    // 5. Pošalji email
    const { google } = await import('googleapis');
    const oauth2 = new google.auth.OAuth2(process.env.GMAIL_CLIENT_ID, process.env.GMAIL_CLIENT_SECRET);
    oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
    const gmail = google.gmail({ version: 'v1', auth: oauth2 });

    const subject = `ANVIL™ Dnevni Izveštaj — ${new Date().toLocaleDateString('sr-Latn-RS')}`;
    const raw = [
      `To: paunov@calderyserbia.com`,
      `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      digest,
    ].join('\r\n');

    const profile = await gmail.users.getProfile({ userId: 'me' });
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw: Buffer.from(raw).toString('base64url') } });

    return res.json({ ok: true, ...result, sentFrom: profile.data.emailAddress });

  } catch (e) {
    console.error('[daily-digest]', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
