// invoice-parse.js — Prima base64 stranice PDF-a, parsira Claude AI-jem
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { pages } = req.body || {};
  if (!pages || !pages.length) {
    return res.status(200).json({ error: 'Missing pages' });
  }

  try {
    const content = pages.map(p => ({
      type: 'image',
      source: { type: 'base64', media_type: p.mediaType || 'image/jpeg', data: p.data }
    }));

    content.push({
      type: 'text',
      text: `Analiziraj ovu fakturu i izvuci SVE fakture/stavke. Vrati SAMO JSON bez komentara:
{
  "invoices": [
    {
      "inv": "broj fakture",
      "cust": "naziv kupca (NE Calderys — oni su prodavac)",
      "date": "YYYY-MM-DD",
      "tot": ukupan iznos kao broj,
      "cur": "EUR ili RSD",
      "co": "RS ili SI ili BA ili MK ili BG ili HR",
      "items": [{"desc": "opis", "qty": količina, "price": cena, "t": ukupno}]
    }
  ]
}`
    });

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content }],
      }),
    });

    const ai = await resp.json();
    const text = ai.content?.[0]?.text || '';
    const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);

  } catch (e) {
    return res.status(200).json({ error: e.message });
  }
}
