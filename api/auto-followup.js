// api/auto-followup.js — Auto Follow-up
// Draft follow-up za neaktivne kupce (45+ dana tišine)
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

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEYS;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY nije postavljen" });

  try {
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
    const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();

    // Pronađi neaktivne kupce
    const snap = await db.collection("customers")
      .where("lastContact", "<=", cutoff)
      .where("active", "==", true)
      .limit(5).get();

    const customers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const followups = [];

    for (const cust of customers) {
      const daysSince = Math.round((Date.now() - new Date(cust.lastContact).getTime()) / 86400000);

      const prompt = `Ti si TSR (Technical Sales Representative) za Calderys - vatrostalne materijale.
Napiši kratak, profesionalan follow-up email na srpskom za kupca:

Kupac: ${cust.name}
Industrija: ${cust.industry || "čeličana"}
Poslednji kontakt: pre ${daysSince} dana
Poslednja aktivnost: ${cust.lastNote || "isporuka materijala"}

Email treba biti: prijatan, profesionalan, sa konkretnim razlogom za kontakt (tehnička podrška, nova ponuda, inspekcija peći). Max 150 reči.`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 400,
          messages: [{ role: "user", content: prompt }]
        })
      });

      const data = await response.json();
      const draft = data.content?.[0]?.text || "";

      await db.collection("auto_followups").add({
        customerId: cust.id,
        customerName: cust.name,
        draft,
        daysSince,
        status: "pending",
        createdAt: new Date().toISOString()
      });

      followups.push({ customer: cust.name, daysSince });
    }

    res.json({ ok: true, processed: followups.length, followups });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
