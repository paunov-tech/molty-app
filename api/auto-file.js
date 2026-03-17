// ═══════════════════════════════════════════════════════════════
// api/auto-file.js v2 — Jedini Drive upload, strukturirani
// Struktura: COMMERCIAL / [Kupac] / [2026] / [Tip dokumenta]
//
// Radi DVA posla:
//   1. Uzima docworker zapise sa driveStatus:'pending' → uploaduje strukturirano
//   2. Uzima docworker zapise sa driveStatus:'unstructured' → premešta u pravu strukturu
//
// Cron: 0 * * * * (svaki sat)
// ═══════════════════════════════════════════════════════════════

import { google } from 'googleapis';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const COMMERCIAL_FOLDER = process.env.COMMERCIAL_FOLDER_ID || '1zsDeckOseY0gMerBHU8nG0p-qKXDV8bN';

const TYPE_FOLDER = {
  invoice:  'Fakture',
  offer:    'Ponude',
  po:       'Narudžbenice',
  oc:       'Potvrde narudžbine',
  dn:       'Otpremnice',
  tds:      'TDS',
  cmr:      'CMR',
  proforma: 'Predračuni',
  credit:   'Knjižna odobrenja',
  sds:      'SDS',
  coc:      'Sertifikati',
  report:   'Izveštaji',
  other:    'Ostalo',
  unknown:  'Ostalo',
};

function getClients() {
  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return {
    drive: google.drive({ version: 'v3', auth }),
    gmail: google.gmail({ version: 'v1', auth }),
  };
}

function initAdmin() {
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID || 'molty-portal',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    })});
  }
}

function normalizeName(name) {
  if (!name) return '_Nepoznat';
  return name.trim().replace(/[\/\\:*?"<>|]/g, '-').slice(0, 50);
}

// Nađi ili kreiraj folder (keširan u sesiji da se ne ponavlja)
const _folderCache = {};
async function getOrCreate(drive, parentId, name) {
  const key = `${parentId}::${name}`;
  if (_folderCache[key]) return _folderCache[key];
  
  const res = await drive.files.list({
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    q: `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g,"\\'")}' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id)',
    pageSize: 1,
  });
  
  if (res.data.files?.length > 0) {
    _folderCache[key] = res.data.files[0].id;
    return _folderCache[key];
  }
  
  const created = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });
  _folderCache[key] = created.data.id;
  return _folderCache[key];
}

// Odredi pravu putanju foldera za dokument
async function getTargetFolder(drive, doc) {
  const customer  = normalizeName(doc.customer);
  const year      = new Date(doc.timestamp?.toDate?.() || doc.date || Date.now()).getFullYear().toString();
  const typeFolder = TYPE_FOLDER[doc.docType] || 'Ostalo';

  // COMMERCIAL / [Kupac] / [Godina] / [Tip]
  const customerFolderId = await getOrCreate(drive, COMMERCIAL_FOLDER, customer);
  const yearFolderId     = await getOrCreate(drive, customerFolderId, year);
  const typeFolderId     = await getOrCreate(drive, yearFolderId, typeFolder);
  
  return { folderId: typeFolderId, path: `${customer}/${year}/${typeFolder}` };
}

// Upload buffer na Drive u pravu strukturu
async function uploadToStructure(drive, doc, buffer, fileName) {
  const { folderId, path } = await getTargetFolder(drive, doc);
  const { Readable } = await import('stream');
  
  const driveRes = await drive.files.create({
    supportsAllDrives: true,
    requestBody: { name: fileName, parents: [folderId] },
    media: {
      mimeType: 'application/pdf',
      body: new Readable({ read() { this.push(buffer); this.push(null); } }),
    },
    fields: 'id, webViewLink',
  });
  
  return { 
    driveId: driveRes.data.id,
    pdfUrl: driveRes.data.webViewLink,
    path,
  };
}

// Premesti već uploadovan fajl u pravu strukturu
async function moveToStructure(drive, doc) {
  const { folderId, path } = await getTargetFolder(drive, doc);
  
  // Preuzmi trenutne roditelje
  const fileMeta = await drive.files.get({
    fileId: doc.driveId,
    supportsAllDrives: true,
    fields: 'parents',
  });
  const oldParents = (fileMeta.data.parents || []).join(',');
  
  await drive.files.update({
    fileId: doc.driveId,
    supportsAllDrives: true,
    addParents: folderId,
    removeParents: oldParents,
    fields: 'id',
  });
  
  return { driveId: doc.driveId, path };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  if ((req.headers.authorization || '') !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  initAdmin();
  const db = getFirestore();
  const { drive, gmail } = getClients();
  
  const results = { uploaded: 0, moved: 0, errors: [] };

  try {
    // ── POSAO 1: pending → upload + strukturiraj ────────────────
    const pending = await db.collection('docworker')
      .where('driveStatus', '==', 'pending')
      .limit(20).get();
    
    for (const docSnap of pending.docs) {
      const doc = { id: docSnap.id, ...docSnap.data() };
      try {
        let buffer;
        
        if (doc.attachmentB64) {
          // Već imamo buffer iz gmail-sync
          buffer = Buffer.from(doc.attachmentB64, 'base64');
        } else if (doc.gmailId) {
          // Preuzmi iz Gmail
          const msg = await gmail.users.messages.get({ userId: 'me', id: doc.gmailId, format: 'full' });
          const parts = msg.data.payload?.parts || [];
          const pdfPart = parts.find(p => p.filename?.endsWith('.pdf') || p.mimeType === 'application/pdf');
          if (pdfPart?.body?.attachmentId) {
            const att = await gmail.users.messages.attachments.get({
              userId: 'me', messageId: doc.gmailId, id: pdfPart.body.attachmentId
            });
            buffer = Buffer.from(att.data.data, 'base64');
          }
        }
        
        if (!buffer) { 
          results.errors.push({ id: doc.id, err: 'No buffer source' });
          continue;
        }
        
        const { driveId, pdfUrl, path } = await uploadToStructure(drive, doc, buffer, doc.fileName);
        
        await docSnap.ref.update({
          driveId,
          pdfUrl,
          drivePath: path,
          driveStatus: 'structured',
          attachmentB64: null,  // oslobodi storage
          updatedAt: new Date(),
        });
        
        results.uploaded++;
        console.log(`[auto-file] ✅ Uploaded: ${doc.fileName} → ${path}`);
        
      } catch (e) {
        console.error(`[auto-file] ERR pending ${doc.id}:`, e.message);
        results.errors.push({ id: doc.id, err: e.message });
        await docSnap.ref.update({ driveStatus: 'error', driveError: e.message });
      }
    }

    // ── POSAO 2: unstructured → premesti u pravu strukturu ──────
    // Ovo su stari zapisi sa driveId ali bez structure (flat upload)
    const unstructured = await db.collection('docworker')
      .where('driveStatus', '==', 'unstructured')
      .limit(20).get();
    
    for (const docSnap of unstructured.docs) {
      const doc = { id: docSnap.id, ...docSnap.data() };
      if (!doc.driveId) continue;
      try {
        const { driveId, path } = await moveToStructure(drive, doc);
        await docSnap.ref.update({
          drivePath: path,
          driveStatus: 'structured',
          updatedAt: new Date(),
        });
        results.moved++;
        console.log(`[auto-file] 📁 Moved: ${doc.fileName} → ${path}`);
      } catch (e) {
        results.errors.push({ id: doc.id, err: e.message });
      }
    }

    // ── POSAO 3: stari zapisi bez driveStatus → označi za migraciju
    const legacy = await db.collection('docworker')
      .where('driveId', '!=', null)
      .limit(50).get();
    
    let legacyTagged = 0;
    for (const docSnap of legacy.docs) {
      const d = docSnap.data();
      if (!d.driveStatus) {
        await docSnap.ref.update({ driveStatus: 'unstructured' });
        legacyTagged++;
      }
    }

    return res.status(200).json({ ok: true, ...results, legacyTagged });
    
  } catch (e) {
    console.error('[auto-file] Fatal:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
