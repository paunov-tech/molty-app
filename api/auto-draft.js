// api/auto-draft.js — Auto Draft
// Generiše draft odgovore za nove poslovne dokumente koristeći Claude API
export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();

  const secret = (req.headers.authorization || "").replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET && process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEYS;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY nije postavljen" });

  try {
    // Učitaj nove dokumente iz Firestore
    const { initializeApp, getApps, cert } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");

    if (!getApps().length) {
      initializeApp({ credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID || 'molty-portal',
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      }) });
    }

    const db = getFirestore();
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const snap = await db.collection("docworker")
      .where("status", "==", "new")
      .where("createdAt", ">=", since)
      .limit(10).get();

    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const drafts = [];

    for (const doc of docs) {
      const prompt = `Ti si poslovni asistent za ${doc.company || "kompaniju"}. 
Napiši profesionalan odgovor na sledeći dokument na srpskom jeziku:

Tip: ${doc.type || "poslovni dokument"}
Sadržaj: ${doc.content || doc.subject || ""}

Odgovor treba biti koncizan, profesionalan i direktan. Max 200 reči.`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 500,
          messages: [{ role: "user", content: prompt }]
        })
      });

      const data = await response.json();
      const draft = data.content?.[0]?.text || "";

      await db.collection("docworker").doc(doc.id).update({
        status: "drafted",
        draft,
        draftedAt: new Date().toISOString()
      });

      drafts.push({ id: doc.id, draft: draft.slice(0, 100) + "..." });
    }

    res.json({ ok: true, processed: drafts.length, drafts });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
