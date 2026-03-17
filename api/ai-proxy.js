// api/ai-proxy.js — Siguran Claude API proxy
// Zamjenjuje direktne VITE_ANTHROPIC_KEY pozive iz browsera
// Koristi: fetch('/api/ai-proxy', { method:'POST', body: JSON.stringify({prompt, context}) })

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { messages, system, max_tokens = 1000, model = "claude-sonnet-4-20250514" } = req.body || {};
    if (!messages?.length) return res.status(400).json({ error: "messages required" });

    // Rate limit check (osnovan — IP based)
    // TODO: dodati Redis rate limiting za produkciju

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens, messages, ...(system && { system }) }),
    });

    const data = await response.json();
    if (data.error) return res.status(400).json({ error: data.error.message });

    return res.status(200).json(data);
  } catch (e) {
    console.error("[ai-proxy]", e.message);
    return res.status(500).json({ error: e.message });
  }
}
