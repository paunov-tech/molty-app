// ═══════════════════════════════════════════════════
// MOLTY API: TDS Enrich — AI lookup za vatrostalne materijale
//
// POST /api/tds-enrich
// (Frontend tdsenrich.jsx ne šalje Authorization header — origin allowlist
// se koristi kao zaštita, isto kao /api/ai-proxy)
// Body: { materialName, mode: "tds"|"competitor", alreadyEnriched? }
// Returns: { success: true, data: {...} } | { skipped: true } | { error, raw }
// ═══════════════════════════════════════════════════

const ALLOWED_ORIGINS = [
  'https://molty-platform-6jch.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
];

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (origin) {
    return res.status(403).json({ error: 'Forbidden origin' });
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  const { materialName, mode = 'tds', alreadyEnriched = [] } = req.body || {};
  if (!materialName) return res.status(400).json({ error: 'materialName required' });

  // Skip ako je već enrich-ovan (klijent kontroliše listu)
  if (mode === 'tds' && Array.isArray(alreadyEnriched) && alreadyEnriched.includes(materialName)) {
    return res.status(200).json({ skipped: true });
  }

  const prompt = mode === 'competitor'
    ? `Pronađi konkurentne ekvivalente vatrostalnog materijala "${materialName}".
Konkurenti: RHI Magnesita, Vesuvius, Refratechnik, Imerys, Saint-Gobain.
Odgovori SAMO JSON: {"competitors":[{"brand":"...","product":"...","spec":"...","note":"..."}]}`
    : `Pronađi tehničke specifikacije Calderys vatrostalnog materijala "${materialName}".
Polja koja tražimo: chemistry (Al2O3, SiO2, MgO, Fe2O3 %), bulk_density (g/cm3), max_temp (°C), application, install_method, drying_curve.
Ako informacija nije pouzdana, vrati polje kao null.
Odgovori SAMO JSON: {"chemistry":{...},"bulk_density":number_or_null,"max_temp":number_or_null,"application":"string","install_method":"string","drying_curve":"string","confidence":"high|medium|low"}`;

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
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
    if (!match) return res.status(200).json({ success: false, error: 'no JSON in response', raw: text.slice(0, 200) });
    const parsed = JSON.parse(match[0]);
    return res.status(200).json({ success: true, data: parsed });
  } catch (e) {
    console.error('[tds-enrich]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
