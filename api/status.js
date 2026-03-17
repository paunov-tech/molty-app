// api/status.js — Health check endpoint za Sync modul
// GET /api/status

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const endpoints = [
    "pipeline", "auto-draft", "auto-followup",
    "drive-sync", "morning-brief", "gmail-sync"
  ];

  return res.status(200).json({
    connected: true,
    worker: "molty-worker.vercel.app",
    version: "2.1.0",
    timestamp: new Date().toISOString(),
    endpoints,
    env: {
      firebase: !!process.env.FIREBASE_CLIENT_EMAIL,
      gmail: !!process.env.GMAIL_CLIENT_ID && !!process.env.GMAIL_REFRESH_TOKEN,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      drive: !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
    }
  });
}
