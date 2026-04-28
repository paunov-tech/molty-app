// ═══════════════════════════════════════════════════════════════
// doc-router.js v1 — Centralni dispatcher za docworker dokumente
//
// Čita sve docworker dokumente koji nisu "routed" i odlučuje:
//   PO / RFQ / OC / Ponuda  → quote_needed  + needs_reply
//   Invoice (ulazna)        → upisuje u revenuhub_invoices
//   DN / CMR / CoC / SDS    → driveStatus="pending" + file_needed
//   TDS                     → tds_enrich
//   Reklamacija keyword      → brain_insights (critical) + needs_reply
//
// Cron: */15 * * * *
// ═══════════════════════════════════════════════════════════════
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function initAdmin() {
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID || 'molty-portal',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }) });
  }
}

// ── Helpers ──────────────────────────────────────────────────────

const COMPLAINT_KEYWORDS = ['reklamacija', 'complaint', 'oštećen', 'damage', 'defect',
  'damaged', 'broken', 'wrong', 'error', 'pogrešno', 'greška', 'problem'];

function isComplaint(doc) {
  const text = `${doc.subject || ''} ${doc.reasoning || ''}`.toLowerCase();
  return COMPLAINT_KEYWORDS.some(k => text.includes(k));
}

// Maping docType → akcija
const QUOTE_TYPES  = new Set(['po', 'rfq', 'oc', 'proforma']);
const FILE_TYPES   = new Set(['dn', 'cmr', 'coc', 'sds', 'report', 'other']);
const REV_TYPES    = new Set(['invoice', 'credit']);
const TDS_TYPES    = new Set(['tds']);

// Normalizuj naziv kupca (isto kao revenueWriter.js na frontendu)
function normCust(raw) {
  if (!raw) return { name: 'Nepoznat', co: 'RS' };
  const name = raw.trim().replace(/\s+/g, ' ');
  // Detektuj zemlju po poznatim sufiksima
  const co = name.match(/\b(d\.o\.o|d\.d|a\.d|a\.s|gmbh|kg|bv|nv|llc|ltd)\b/i)
    ? (name.toLowerCase().includes('gmbh') || name.toLowerCase().includes(' kg')
        ? 'DE' : name.toLowerCase().includes('bv') ? 'NL' : 'RS')
    : 'RS';
  return { name, co };
}

// Upiši u revenuhub_invoices (server-side replika revenueWriter)
async function logInvoice(db, doc) {
  const invNo = doc.invoiceNo || `DW-${doc.id.slice(0, 8)}`;

  // Deduplication
  const existing = await db.collection('revenuhub_invoices').doc(invNo).get();
  if (existing.exists) return { skipped: true, invNo };

  const { name: cust, co } = normCust(doc.customer);
  const rawDate = doc.date ? new Date(doc.date) : doc.timestamp?.toDate?.() || new Date();
  const date = rawDate.toISOString().slice(0, 10);

  const items = (doc.items || []).map(it => ({
    code: it.sapCode || '',
    desc: it.material || it.name || 'Materijal',
    qty:  Number(it.quantity) || 0,
    u:    it.unit || 'TO',
    p:    Number(it.unitPrice) || 0,
    t:    Number(it.totalPrice) || Number(doc.amount) || 0,
  }));

  if (!items.length && doc.amount) {
    items.push({ code: '', desc: 'Vatrostalni materijali', qty: 1, u: 'paušal', p: doc.amount, t: doc.amount });
  }

  await db.collection('revenuhub_invoices').doc(invNo).set({
    inv: invNo, date, cust, co,
    cn: '', pay: '', deliv: '',
    contact: doc.from || '',
    items,
    disc: 0, fr: 0,
    tot: Number(doc.amount) || items.reduce((s, i) => s + i.t, 0),
    _source: 'docworker',
    _dwId: doc.id,
    _confidence: doc.confidence || null,
    _importedAt: new Date().toISOString(),
  });

  return { ok: true, invNo };
}

// Kreiraj brain_insight za reklamaciju
async function escalateComplaint(db, doc) {
  await db.collection('brain_insights').add({
    type: 'complaint',
    priority: 'critical',
    customer: doc.customer || 'Nepoznat',
    subject: doc.subject || doc.fileName,
    reasoning: doc.reasoning || '',
    dwId: doc.id,
    dismissed: false,
    createdAt: FieldValue.serverTimestamp(),
  });
}

// ── Handler ──────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = (req.headers.authorization || '').replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET && process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  initAdmin();
  const db = getFirestore();

  // Uzmi sve nerutirane, business-relevantne dokumente (limit 30 po pozivu)
  // Single-field query + JS filter — izbegava Firestore composite index na (routed, isBusinessRelevant).
  // Inequality '!=' + equality '==' u istom queryju traži composite index koji nije deploy-ovan.
  const snap = await db.collection('docworker')
    .where('isBusinessRelevant', '==', true)
    .limit(100)
    .get();

  if (snap.empty) return res.json({ ok: true, processed: 0 });

  const unroutedDocs = snap.docs.filter(d => d.data().routed !== true).slice(0, 30);
  if (unroutedDocs.length === 0) return res.json({ ok: true, processed: 0, scanned: snap.size });

  const results = { quoted: 0, invoiced: 0, filed: 0, tds: 0, escalated: 0, errors: [], scanned: snap.size };

  for (const docSnap of unroutedDocs) {
    const doc = { id: docSnap.id, ...docSnap.data() };
    const type = doc.docType || 'unknown';
    const update = { routed: true, routedAt: new Date().toISOString() };

    try {
      // ── Reklamacija — uvijek prva provjera ──
      if (isComplaint(doc)) {
        await escalateComplaint(db, doc);
        update.routedAction = 'complaint_escalated';
        update.needs_reply = true;
        update.replyPriority = 'critical';
        results.escalated++;
      }

      // ── PO / RFQ / OC / Proforma → treba ponuda + odgovor ──
      else if (QUOTE_TYPES.has(type)) {
        update.routedAction = 'quote_needed';
        update.needs_reply = true;
        update.replyPriority = 'high';
        results.quoted++;
      }

      // ── Faktura / Knjižno odobrenje → upiši u RevHub ──
      else if (REV_TYPES.has(type) && doc.confidence >= 70) {
        const r = await logInvoice(db, doc);
        update.routedAction = r.skipped ? 'invoice_already_logged' : 'invoice_logged';
        update.linkedInvNo = r.invNo || null;
        // Drive upload ako PDF postoji
        if (!doc.driveStatus || doc.driveStatus === 'none') update.driveStatus = 'pending';
        results.invoiced++;
      }

      // ── DN / CMR / CoC / SDS → arhiviraj na Drive ──
      else if (FILE_TYPES.has(type)) {
        if (!doc.driveStatus || doc.driveStatus === 'none') update.driveStatus = 'pending';
        update.routedAction = 'file_to_drive';
        results.filed++;
      }

      // ── TDS ──
      else if (TDS_TYPES.has(type)) {
        update.routedAction = 'tds_enrich';
        if (!doc.driveStatus || doc.driveStatus === 'none') update.driveStatus = 'pending';
        results.tds++;
      }

      // ── Ostalo (offer dolazna, nepoznat tip…) ──
      else {
        update.routedAction = 'reviewed';
      }

    } catch (e) {
      console.error(`[doc-router] ERR ${doc.id}:`, e.message);
      results.errors.push({ id: doc.id, err: e.message });
      update.routedAction = 'error';
      update.routeError = e.message;
    }

    await docSnap.ref.update(update);
  }

  console.log('[doc-router] Done:', results);
  return res.json({ ok: true, processed: snap.size, ...results });
}
