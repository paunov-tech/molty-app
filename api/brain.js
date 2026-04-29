// ═══════════════════════════════════════════════════
// MOLTY API: Brain — Claude proxy for Dashboard / RevenueHub AI chat
//
// POST /api/brain
// Auth: Bearer {CRON_SECRET}  (different from /api/ai-proxy origin allowlist)
// Body: { system, max_tokens, messages: [{role, content}] }
// Returns: raw Anthropic response shape — { content: [{ text }], ... }
// ═══════════════════════════════════════════════════

const ALLOWED_MODELS = new Set([
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
  'claude-opus-4-6',
]);

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

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  try {
    const { messages, system, max_tokens = 1000, model: reqModel } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages required' });
    }
    const model = ALLOWED_MODELS.has(reqModel) ? reqModel : 'claude-sonnet-4-6';

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens, messages, ...(system && { system }) }),
    });
    const data = await aiRes.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    return res.status(200).json(data);
  } catch (e) {
    console.error('[brain]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
