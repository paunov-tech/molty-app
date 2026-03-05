// api/auto-forward-tds.js — TDS Forward
// Prosleđuje nove TDS/SDS kupcima koji koriste taj materijal
export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();

  const secret = (req.headers.authorization || "").replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET && process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

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
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Pronađi nove TDS dokumente
    const tdsSnap = await db.collection("tds_documents")
      .where("uploadedAt", ">=", since)
      .limit(20).get();

    const newTDS = tdsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const forwarded = [];

    for (const tds of newTDS) {
      // Pronađi kupce koji koriste ovaj materijal
      const custSnap = await db.collection("customers")
        .where("materials", "array-contains", tds.materialCode || tds.name)
        .get();

      const customers = custSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      for (const cust of customers) {
        // Kreiraj forward zapis
        await db.collection("tds_forwards").add({
          tdsId: tds.id,
          tdsName: tds.name,
          materialCode: tds.materialCode,
          customerId: cust.id,
          customerName: cust.name,
          customerEmail: cust.contact?.email || "",
          status: "pending",
          createdAt: new Date().toISOString()
        });

        forwarded.push({ tds: tds.name, customer: cust.name });
      }

      // Označi TDS kao obrađen
      await db.collection("tds_documents").doc(tds.id).update({
        forwarded: true,
        forwardedAt: new Date().toISOString(),
        forwardCount: customers.length
      });
    }

    res.json({ ok: true, tdsProcessed: newTDS.length, forwarded: forwarded.length, items: forwarded });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
