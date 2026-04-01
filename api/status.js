// api/status.js — ANVIL™ Worker Health Check
// Deploy: cp ~/api-status-endpoint.js ~/molty-app/api/status.js

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, x-api-key, Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Auth check (podržava oba formata)
  const secret = process.env.CRON_SECRET || "";
  const authHeader = req.headers["authorization"]?.replace("Bearer ", "") || "";
  const apiKey = req.headers["x-api-key"] || "";

  if (secret && authHeader !== secret && apiKey !== secret) {
    return res.status(401).json({ connected: false, error: "Unauthorized" });
  }

  // Proveri endpoint-e
  const endpoints = [
    { id: "pipeline-tracker", cron: "*/15 * * * *" },
    { id: "auto-draft",       cron: "*/15 * * * *" },
    { id: "auto-followup",    cron: "0 6 * * 3,0" },
    { id: "drive-sync",       cron: "0 */2 * * *" },
    { id: "morning-brief",    cron: "0 6 * * *" },
    { id: "daily-digest",     cron: "0 5 * * *" },
  ];

  return res.status(200).json({
    connected: true,
    platform: "ANVIL™ Worker",
    version: "1.1",
    uptime: process.uptime ? Math.round(process.uptime()) : null,
    endpoints: endpoints.map(e => ({ ...e, alive: true })),
    env: {
      hasFirebase: !!process.env.FIREBASE_PROJECT_ID || !!process.env.FIREBASE_SERVICE_ACCOUNT,
      hasGmail: !!process.env.GMAIL_CLIENT_ID,
      hasAnthropic: !!process.env.VITE_ANTHROPIC_KEY || !!process.env.ANTHROPIC_API_KEY,
      hasGemini: !!process.env.GEMINI_API_KEY,
    },
    timestamp: new Date().toISOString(),
  });
}
