// ═══════════════════════════════════════════════════
// MOLTY API: Photo Validate — Claude Vision za inspekcije
//
// POST /api/photo-validate
// Auth: Bearer {CRON_SECRET}
// Body: { image (base64 data URL ili sirov base64), zone, furnaceType, context, lang }
// Returns: { status: "approve"|"reject"|"warning", reasoning, findings[] }
// ═══════════════════════════════════════════════════

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

  const { image, zone = 'Unknown', furnaceType = '', context = '', lang = 'sr' } = req.body || {};
  if (!image) return res.status(400).json({ error: 'image required' });

  const b64 = String(image).replace(/^data:image\/\w+;base64,/, '');
  const mediaMatch = String(image).match(/^data:(image\/\w+);base64,/);
  const mediaType = mediaMatch ? mediaMatch[1] : 'image/jpeg';

  const langName = { sr: 'srpskom (latinica)', en: 'engleskom', de: 'nemačkom' }[lang] || 'srpskom (latinica)';
  const prompt = `Ti si refractory inspector za vatrostalnu oblogu (Calderys peći).
Zona: ${zone}
Tip peći: ${furnaceType}
Kontekst: ${context}

Pregledaj fotografiju i odluči:
- "approve" — obloga ispravna, bez kritičnih oštećenja
- "warning" — vidljiva habanja/sitne pukotine, treba pratiti, NE blokira rad
- "reject" — kritično (probijena obloga, veliki krater, korozija) — STOP, hitan repair

Odgovori SAMO JSON na ${langName}:
{"status":"approve|warning|reject","reasoning":"1-2 rečenice","findings":["nalaz 1","nalaz 2"]}`;

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
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });
    const data = await aiRes.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    const text = data.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(502).json({ error: 'AI did not return JSON', raw: text.slice(0, 200) });
    const parsed = JSON.parse(match[0]);
    if (!['approve', 'warning', 'reject'].includes(parsed.status)) parsed.status = 'warning';
    return res.status(200).json(parsed);
  } catch (e) {
    console.error('[photo-validate]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
