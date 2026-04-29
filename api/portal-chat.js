// ═══════════════════════════════════════════════════
// MOLTY API: Portal Chat — Customer Portal AI assistant
//
// POST /api/portal-chat
// Auth: Bearer {CRON_SECRET}
// Body: { messages: [{role, content, photo?}], context }
// Returns: { text }
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

  const { messages = [], context = '' } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages required' });
  }

  const system = `Ti si ANVIL™ AI asistent unutar Customer Portal-a za Calderys / SIAL kupce u industriji vatrostalnih materijala.
Odgovaraj kratko, profesionalno, na jeziku korisnika (sr/en/de), max 6 rečenica.
Domen: peći, vatrostalna obloga, instalacije, inspekcije, fakture, plan radova.

KONTEKST KUPCA:
${context || '(nema dodatnog konteksta)'}`;

  // Map messages — podrži photo (base64) blokove preko vision content array.
  const apiMessages = messages.map(m => {
    if (m.photo) {
      const b64 = String(m.photo).replace(/^data:image\/\w+;base64,/, '');
      return {
        role: m.role,
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
          { type: 'text', text: m.content || 'Analiziraj sliku.' },
        ],
      };
    }
    return { role: m.role, content: String(m.content || '') };
  });

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
        system,
        messages: apiMessages,
      }),
    });
    const data = await aiRes.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    return res.status(200).json({ text: data.content?.[0]?.text || '' });
  } catch (e) {
    console.error('[portal-chat]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
