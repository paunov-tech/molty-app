// ═══════════════════════════════════════════════════
// MOLTY API: Competitor Intel — kratak AI brifing po konkurentu
//
// POST /api/competitor-intel
// Auth: Bearer {CRON_SECRET}
// Body: { competitors: ["RHI Magnesita", "Vesuvius", ...] }
// Returns: { news: [{ competitor, title, summary, ts }] }
//
// NAPOMENA: Pravi news API (Google News, NewsAPI, ...) nije konfigurisan.
// Endpoint koristi Claude da generiše kratak strateški brief po konkurentu
// na osnovu opšteg znanja — više "competitive context" nego live news.
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

  const { competitors = [] } = req.body || {};
  if (!Array.isArray(competitors) || competitors.length === 0) {
    return res.status(200).json({ news: [] });
  }

  const list = competitors.slice(0, 8).filter(c => typeof c === 'string' && c.trim());
  if (list.length === 0) return res.status(200).json({ news: [] });

  const prompt = `Ti si analitičar konkurencije za Calderys (vatrostalni materijali, čelik/cement/aluminijum tržišta).
Za svakog konkurenta sa liste, daj 1 kratak strateški pojaš (max 2 rečenice) — tehnologija, tržište, slabost, prilike.
Konkurenti: ${list.join(', ')}

Odgovori SAMO JSON:
{"news":[{"competitor":"...","title":"...","summary":"...","ts":"${new Date().toISOString()}"}]}`;

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await aiRes.json();
    if (data.error) return res.status(200).json({ news: [], error: data.error.message });
    const text = data.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(200).json({ news: [] });
    const parsed = JSON.parse(match[0]);
    return res.status(200).json({ news: Array.isArray(parsed.news) ? parsed.news : [] });
  } catch (e) {
    console.error('[competitor-intel]', e.message);
    return res.status(200).json({ news: [], error: e.message });
  }
}
