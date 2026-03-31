// api/ai-proxy.js — Siguran Claude API proxy
// Zamjenjuje direktne VITE_ANTHROPIC_KEY pozive iz browsera
// Koristi: fetch('/api/ai-proxy', { method:'POST', body: JSON.stringify({messages, system, max_tokens}) })

const ALLOWED_ORIGINS = [
  "https://molty-platform-6jch.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
];

// Simple in-memory rate limit: max 30 requests/min per IP
const ipMap = new Map();
function rateOk(ip) {
  const now = Date.now();
  const win = 60_000;
  const max = 30;
  const entry = ipMap.get(ip) || { count: 0, reset: now + win };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + win; }
  entry.count++;
  ipMap.set(ip, entry);
  return entry.count <= max;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else if (origin) {
    return res.status(403).json({ error: "Forbidden" });
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket?.remoteAddress || "unknown";
  if (!rateOk(ip)) return res.status(429).json({ error: "Too many requests" });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "AI proxy not configured" });

  try {
    const { messages, system, max_tokens = 1000, model: reqModel } = req.body || {};
    if (!messages?.length) return res.status(400).json({ error: "messages required" });

    // Whitelist — prevent clients from escalating to arbitrary/expensive models
    const ALLOWED_MODELS = new Set(["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-6"]);
    const model = ALLOWED_MODELS.has(reqModel) ? reqModel : "claude-sonnet-4-6";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
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
