// invoice-parse.js — Prima base64 stranice PDF-a, parsira Claude AI-jem
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { pages } = req.body || {};
  if (!pages || !pages.length) {
    return res.status(200).json({ error: 'Missing pages' });
  }

  const prompt = `Analiziraj ovu fakturu iz industrije vatrostalnih materijala.
Odgovori ISKLJUČIVO u JSON formatu:
{
  "invoices": [
    {
      "inv": "broj fakture",
      "cust": "naziv kupca (NIKAD Calderys — oni su prodavac/dobavljač)",
      "date": "YYYY-MM-DD",
      "tot": ukupan iznos kao broj,
      "cur": "EUR ili RSD ili USD",
      "co": "ISO 2-slovno: RS ili SI ili BA ili MK ili BG ili HR",
      "items": [
        {
          "desc": "naziv materijala",
          "qty": količina kao broj,
          "u": "kg ili t ili kom ili m2",
          "price": jedinična cena kao broj,
          "t": ukupna cena stavke kao broj
        }
      ]
    }
  ]
}
PRAVILA:
- Kupac je firma koja PRIMA robu, Calderys je firma koja ŠALJE
- Ako ima više faktura na jednom PDF-u, vrati sve
- Količine i cene su UVEK brojevi, nikad string
- Odgovori SAMO JSON, bez teksta pre ili posle`;

  try {
    const content = pages.map(p => ({
      type: 'image',
      source: { type: 'base64', media_type: p.mediaType || 'image/jpeg', data: p.data }
    }));
    content.push({ type: 'text', text: prompt });

    const resp = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content }],
      }),
    });

    const ai = await resp.json();
    const text = ai.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(200).json({ error: 'AI nije vratio JSON', raw: text.substring(0, 200) });
    const parsed = JSON.parse(jsonMatch[0]);
    return res.status(200).json(parsed);

  } catch (e) {
    return res.status(200).json({ error: e.message });
  }
}
