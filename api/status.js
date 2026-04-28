// api/status.js — ANVIL™ Worker Health Check
// Public health endpoint — no auth required.
// Returns only non-sensitive info (platform name, uptime, cron list, env presence flags).
// VIGIL workflow on Hetzner n8n probes this every 10 min.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, x-api-key, Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

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
