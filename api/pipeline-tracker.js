// api/pipeline-tracker.js — Document Flow Chain Tracker
// Prati: Ponuda → PO → OC → DN → Faktura
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = (req.headers.authorization || '').replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { initializeApp, getApps, cert } = await import('firebase-admin/app');
    const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
    if (!getApps().length) {
      initializeApp({ credential: cert({
        projectId: 'molty-portal',
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      })});
    }
    const db = getFirestore();

    const body = req.body || {};

    // ── MANUAL OVERRIDE ──
    if (body.action === 'override' && body.pipelineId) {
      const validStatuses = ['offer_sent', 'po_received', 'oc_sent', 'dn_sent', 'invoiced', 'lost', 'on_hold', 'cancelled', 'won'];
      if (!validStatuses.includes(body.status)) {
        return res.status(400).json({ error: `Invalid status. Valid: ${validStatuses.join(', ')}` });
      }
      await db.collection('pipelines').doc(body.pipelineId).update({
        status: body.status,
        manualOverride: true,
        overrideNote: body.note || '',
        updatedAt: new Date().toISOString(),
      });
      return res.json({ ok: true, action: 'override', pipelineId: body.pipelineId, status: body.status });
    }

    // ── PROCESS NEW DOCUMENT ──
    if (body.action === 'process' && body.docId) {
      const docSnap = await db.collection('docworker').doc(body.docId).get();
      if (!docSnap.exists) return res.status(404).json({ error: 'Document not found' });
      const doc = { id: docSnap.id, ...docSnap.data() };

      const customer = doc.customer;
      const docType = doc.docType || doc.type;
      if (!customer || !docType) return res.json({ ok: true, message: 'No customer or docType, skipping' });

      // Mapiranje docType → pipeline step
      const typeMap = {
        'offer': 'offer_sent',
        'po': 'po_received',
        'oc': 'oc_sent',
        'delivery_note': 'dn_sent',
        'invoice': 'invoiced',
      };
      const step = typeMap[docType];
      if (!step) return res.json({ ok: true, message: `docType ${docType} not tracked` });

      // Nađi otvoreni pipeline za ovog kupca
      const openSnap = await db.collection('pipelines')
        .where('customer', '==', customer)
        .where('status', 'not-in', ['invoiced', 'lost', 'cancelled', 'won'])
        .limit(1).get();

      if (step === 'offer_sent') {
        // Kreiraj novi pipeline
        const pipeline = {
          customer,
          customerCountry: doc.customerCountry || null,
          status: 'offer_sent',
          manualOverride: false,
          steps: [{
            step: 'offer_sent',
            docId: doc.id,
            docType,
            documentNumber: doc.invoiceNo || null,
            amount: doc.amount || null,
            currency: doc.currency || 'EUR',
            date: doc.date || new Date().toISOString().slice(0,10),
            fileName: doc.fileName,
          }],
          totalAmount: doc.amount || null,
          currency: doc.currency || 'EUR',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          followupSent: false,
        };
        const ref = await db.collection('pipelines').add(pipeline);
        await db.collection('docworker').doc(doc.id).update({ pipelineId: ref.id, status: 'processed' });
        return res.json({ ok: true, action: 'created', pipelineId: ref.id, customer, step });
      }

      if (!openSnap.empty) {
        // Ažuriraj postojeći pipeline
        const pipe = openSnap.docs[0];
        const steps = pipe.data().steps || [];
        steps.push({
          step,
          docId: doc.id,
          docType,
          documentNumber: doc.invoiceNo || null,
          amount: doc.amount || null,
          date: doc.date || new Date().toISOString().slice(0,10),
          fileName: doc.fileName,
        });
        await pipe.ref.update({
          status: step,
          steps,
          updatedAt: new Date().toISOString(),
        });
        await db.collection('docworker').doc(doc.id).update({ pipelineId: pipe.id, status: 'processed' });
        return res.json({ ok: true, action: 'updated', pipelineId: pipe.id, customer, step });
      }

      return res.json({ ok: true, message: 'No open pipeline found, document not linked' });
    }

    // ── LIST PIPELINES ──
    const snap = await db.collection('pipelines').orderBy('updatedAt', 'desc').limit(50).get();
    const pipelines = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const stats = {
      total: pipelines.length,
      offer_sent: pipelines.filter(p => p.status === 'offer_sent').length,
      po_received: pipelines.filter(p => p.status === 'po_received').length,
      oc_sent: pipelines.filter(p => p.status === 'oc_sent').length,
      dn_sent: pipelines.filter(p => p.status === 'dn_sent').length,
      invoiced: pipelines.filter(p => p.status === 'invoiced').length,
      lost: pipelines.filter(p => p.status === 'lost').length,
      won: pipelines.filter(p => p.status === 'won').length,
    };
    return res.json({ ok: true, pipelines, stats });

  } catch (e) {
    console.error('[pipeline-tracker]', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
