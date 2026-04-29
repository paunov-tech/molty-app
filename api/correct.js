// ═══════════════════════════════════════════════════
// MOLTY API: Document Correction Endpoint
// 
// Receives manual corrections from DocCenter UI when AI parser
// got customer/type/country wrong. Updates the docworker Firestore
// document and logs the correction for future learning.
//
// POST /api/correct
// Auth: Bearer {CRON_SECRET}
// Body: { messageId, correctedType, correctedCustomer, correctedCountry }
// Returns: { ok: true, updated: { ... } } | { error: "..." }
// ═══════════════════════════════════════════════════

import admin from 'firebase-admin';

// Initialize Firebase Admin once per cold start
if (!admin.apps.length) {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not set');
  let key;
  try {
    key = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    key = JSON.parse(raw);
  }
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: key.project_id,
      clientEmail: key.client_email,
      privateKey: key.private_key,
    }),
  });
}

const db = admin.firestore();

// ── CORS / preflight ──────────────────────────────────
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ── Bearer auth ───────────────────────────────────────
function checkAuth(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return { ok: false, error: 'CRON_SECRET not configured on server' };
  }
  const header = req.headers.authorization || req.headers.Authorization || '';
  const got = header.replace(/^Bearer\s+/i, '').trim();
  if (got !== expected) {
    return { ok: false, error: 'Unauthorized' };
  }
  return { ok: true };
}

// ── Find docworker doc by messageId ───────────────────
// messageId can match either the doc ID, gmailId field, or the docId field.
async function findDocworkerDoc(messageId) {
  // Try direct doc ID first (cheapest)
  const direct = await db.collection('docworker').doc(messageId).get();
  if (direct.exists) return direct;

  // Then try gmailId field
  const byGmail = await db.collection('docworker')
    .where('gmailId', '==', messageId)
    .limit(1)
    .get();
  if (!byGmail.empty) return byGmail.docs[0];

  // Then try docId field (some endpoints use this naming)
  const byDocId = await db.collection('docworker')
    .where('docId', '==', messageId)
    .limit(1)
    .get();
  if (!byDocId.empty) return byDocId.docs[0];

  return null;
}

// ── Main handler ──────────────────────────────────────
export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // Auth
  const auth = checkAuth(req);
  if (!auth.ok) {
    return res.status(401).json({ error: auth.error });
  }

  // Parse body (Vercel parses JSON automatically when Content-Type is set,
  // but we double-check)
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Missing body' });
  }

  const { messageId, correctedType, correctedCustomer, correctedCountry } = body;

  if (!messageId) {
    return res.status(400).json({ error: 'messageId required' });
  }

  // Build update payload — only include fields user actually corrected
  const update = {
    correctedAt: admin.firestore.FieldValue.serverTimestamp(),
    correctedBy: 'doccenter-ui',
    aiCorrected: true,
  };
  const original = {};

  try {
    const docSnap = await findDocworkerDoc(messageId);

    if (!docSnap) {
      return res.status(404).json({
        error: `Document not found: ${messageId}`,
      });
    }

    const data = docSnap.data() || {};

    // Track what changed for the learning log
    if (correctedType !== undefined && correctedType !== null && correctedType !== '') {
      original.docType = data.docType ?? null;
      update.docType = correctedType;
    }
    if (correctedCustomer !== undefined && correctedCustomer !== null && correctedCustomer !== '') {
      original.customer = data.customer ?? null;
      update.customer = correctedCustomer;
    }
    if (correctedCountry !== undefined && correctedCountry !== null && correctedCountry !== '') {
      original.customerCountry = data.customerCountry ?? null;
      update.customerCountry = correctedCountry;
    }

    if (Object.keys(original).length === 0) {
      return res.status(400).json({
        error: 'No corrections provided (all fields empty)',
      });
    }

    // Update the docworker document
    await docSnap.ref.update(update);

    // Log correction event for future learning (separate collection)
    await db.collection('correction_log').add({
      messageId,
      docworkerDocId: docSnap.id,
      original,
      corrected: {
        docType: update.docType ?? null,
        customer: update.customer ?? null,
        customerCountry: update.customerCountry ?? null,
      },
      correctedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      ok: true,
      docId: docSnap.id,
      updated: {
        docType: update.docType ?? null,
        customer: update.customer ?? null,
        customerCountry: update.customerCountry ?? null,
      },
    });
  } catch (err) {
    console.error('correct.js error:', err);
    return res.status(500).json({
      error: err.message || 'Internal error',
    });
  }
}
