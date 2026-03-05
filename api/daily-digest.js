// api/daily-digest.js — Daily Digest za CommHub
// Generiše dnevni AI pregled aktivnosti
export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEYS;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY nije postavljen" });

  try {
    const { initializeApp, getApps, cert } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");

    if (!getApps().length) {
      const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  let sa;
  try { sa = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); }
  catch { sa = JSON.parse(raw); }
      initializeApp({ credential: cert(sa) });
    }

    const db = getFirestore();

    // Učitaj poslednji digest
    const digestDoc = await db.collection("daily_digest").doc("latest").get();
    if (digestDoc.exists) {
      const data = digestDoc.data();
      const age = Date.now() - new Date(data.generatedAt).getTime();
      // Vrati keširani ako je mlađi od 4h
      if (age < 4 * 60 * 60 * 1000) {
        return res.json({ ok: true, cached: true, ...data });
      }
    }

    // Učitaj podatke
    const [followupsSnap, pipelineDoc, forwardsSnap] = await Promise.all([
      db.collection("auto_followups").where("status", "==", "pending").limit(10).get(),
      db.collection("pipeline_results").doc("latest").get(),
      db.collection("tds_forwards").where("status", "==", "pending").limit(10).get(),
    ]);

    const pendingFollowups = followupsSnap.docs.map(d => d.data().customerName);
    const pipelineData = pipelineDoc.exists ? pipelineDoc.data() : {};
    const pendingForwards = forwardsSnap.size;

    const prompt = `Ti si ANVIL™ AI asistent za Miroslava Paunova, TSR za Calderys Balkani.
Napiši kratak dnevni izveštaj (max 200 reči) na srpskom:

Podaci:
- Follow-up kupci (čekaju odgovor): ${pendingFollowups.join(", ") || "nema"}
- Pipeline: ${pipelineData.incomplete || 0} nepotpunih lanaca od ${pipelineData.total || 0}
- TDS dokumenti čekaju prosleđivanje: ${pendingForwards}

Format: 3 sekcije (Prioriteti danas, Pipeline status, Akcije), bez markdown.`;

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
    const digest = data.content?.[0]?.text || "";

    const result = {
      digest,
      pendingFollowups: pendingFollowups.length,
      pipelineIncomplete: pipelineData.incomplete || 0,
      pendingForwards,
      generatedAt: new Date().toISOString()
    };

    await db.collection("daily_digest").doc("latest").set(result);

    res.json({ ok: true, ...result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
