// ═══════════════════════════════════════════════════
// MOLTY API: Draft Email — AI-generated email composition
//
// POST /api/draft-email
// Auth: Bearer {CRON_SECRET}
// Body: { messageId, docType, customer, country, materials[], from, subject }
// Returns: { subject, body }
// ═══════════════════════════════════════════════════

const TEMPLATES = {
  quotation: 'pošalji ponudu — daj cene materijala, valuta EUR, EXW Werk, plaćanje 30 dana',
  reactivation: 'reaktivacija dormant kupca — toplo se javi, ponudi katalog/sastanak',
  followup: 'follow-up na otvorenu prepisku — kratko, profesionalno, traži update',
  spec_sonja: 'pošalji Sonja Mayerhofer (Sales Manager Austria) tražeći cene',
  rfq: 'odgovor na RFQ — potvrdi prijem, najavi rok za ponudu',
  oc: 'order confirmation — potvrdi prijem narudžbe i isporuku',
  invoice: 'pošalji fakturu sa rokom plaćanja',
  delivery: 'najava isporuke — broj otpremnice, datum, transport',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const secret = (req.headers.authorization || '').replace('Bearer ', '');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { docType = 'followup', customer = '', country = '', materials = [], subject = '' } = req.body || {};
  const guidance = TEMPLATES[docType] || TEMPLATES.followup;

  const prompt = `Ti si Miroslav Paunov — Technical Sales Representative, Calderys / SIAL Consulting.
Sastavi kratak poslovni email na srpskom (latinica), ton: profesionalan, direktan, bez nepotrebnih uvoda.

Kontekst:
- Kupac: ${customer || '(nepoznat)'}${country ? ` · ${country}` : ''}
- Tip: ${docType}
- Postojeći subject: ${subject || '(prazan)'}
${materials?.length ? `- Materijali u igri:\n${materials.slice(0,8).map(m => `  · ${typeof m === 'string' ? m : (m.material || m.name || '')}`).join('\n')}` : ''}

Zadatak: ${guidance}

Odgovori SAMO JSON: {"subject": "...", "body": "..."} — body je markdown, max 8 redova, bez potpisa (potpis se dodaje van).`;

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await aiRes.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    const text = data.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(502).json({ error: 'AI did not return JSON', raw: text.slice(0, 200) });
    const parsed = JSON.parse(match[0]);
    return res.status(200).json({ subject: parsed.subject || subject, body: parsed.body || '' });
  } catch (e) {
    console.error('[draft-email]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
