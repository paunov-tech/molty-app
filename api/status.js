export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  res.json({ ok: true, status: "online", version: "v5", ts: new Date().toISOString() });
}
