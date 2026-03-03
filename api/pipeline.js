// api/pipeline.js — Pipeline Tracker
// Prati: ponuda → PO → OC → DN → faktura u Firestore
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function initAdmin() {
  if (getApps().length > 0) return;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!key) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY nije postavljen");
  const sa = JSON.parse(key);
  initializeApp({ credential: { getAccessToken: async () => {
    const { GoogleAuth } = await import("google-auth-library");
    const auth = new GoogleAuth({ credentials: sa, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    return { access_token: token.token, expires_in: 3600 };
  }}});
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  
  const secret = (req.headers.authorization || "").replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET && process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    initAdmin();
    const db = getFirestore();
    
    // Učitaj sve pipeline dokumente
    const snap = await db.collection("pipelines").orderBy("updatedAt", "desc").limit(100).get();
    const pipelines = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // Pronađi nepotpune lance
    const incomplete = pipelines.filter(p => {
      const stages = ["quote", "po", "oc", "dn", "invoice"];
      return !stages.every(s => p.stages?.[s]?.done);
    });
    
    // Sačuvaj rezultat
    await db.collection("pipeline_results").doc("latest").set({
      total: pipelines.length,
      incomplete: incomplete.length,
      items: incomplete.slice(0, 20),
      updatedAt: new Date().toISOString(),
    });

    res.json({ ok: true, total: pipelines.length, incomplete: incomplete.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
