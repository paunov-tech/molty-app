import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function initAdmin() {
  if (getApps().length > 0) return;
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID || 'molty-portal',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  }) });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === "OPTIONS") return res.status(200).end();
  const secret = (req.headers.authorization || "").replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET && process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    initAdmin();
    const db = getFirestore();
    const snap = await db.collection("pipelines").orderBy("updatedAt", "desc").limit(100).get();
    const pipelines = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const incomplete = pipelines.filter(p => {
      const stages = ["quote", "po", "oc", "dn", "invoice"];
      return !stages.every(s => p.stages?.[s]?.done);
    });
    await db.collection("pipeline_results").doc("latest").set({
      total: pipelines.length,
      incomplete: incomplete.length,
      items: incomplete.slice(0, 20),
      updatedAt: new Date().toISOString(),
    });
    res.json({ ok: true, total: pipelines.length, incomplete: incomplete.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
