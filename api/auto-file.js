// ═══════════════════════════════════════════════════
// MOLTY API: Auto-File — sortira dokumente po strukturi
// COMMERCIAL / [Kupac] / [Godina] / [Tip dokumenta]
// ═══════════════════════════════════════════════════
import { google } from 'googleapis';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const COMMERCIAL_FOLDER = process.env.COMMERCIAL_FOLDER_ID || '1zsDeckOseY0gMerBHU8nG0p-qKXDV8bN';

// Tip dokumenta → naziv foldera
const TYPE_FOLDER = {
  invoice:   'Fakture',
  offer:     'Ponude',
  po:        'Narudžbenice',
  oc:        'Potvrde narudžbine',
  dn:        'Otpremnice',
  tds:       'TDS',
  cmr:       'CMR',
  proforma:  'Predračuni',
  credit:    'Knjižna odobrenja',
  other:     'Ostalo',
  unknown:   'Ostalo',
};

function getDrive() {
  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return google.drive({ version: 'v3', auth });
}

function initAdmin() {
  if (getApps().length > 0) return;
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID || 'molty-portal',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  }) });
}

// Nađi ili kreiraj folder sa datim imenom unutar parent-a
async function getOrCreateFolder(drive, parentId, name) {
  // Traži postojeći
  const res = await drive.files.list({
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    q: `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g,"\\'")}' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id, name)',
    pageSize: 1,
  });
  if (res.data.files?.length > 0) return res.data.files[0].id;

  // Kreiraj novi
  const created = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });
  return created.data.id;
}

// Normalizuj ime kupca za folder (bez specijalnih znakova)
function normalizeName(name) {
  if (!name) return 'Nepoznat kupac';
  return name.trim().replace(/[\/\\:*?"<>|]/g, '-').slice(0, 60);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = (req.headers.authorization || '').replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET && process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    initAdmin();
    const db = getFirestore();
    const drive = getDrive();

    // Uzmi dokumente koji čekaju filing (status=new i imaju driveId)
    const snap = await db.collection('docworker')
      .where('status', '==', 'new')
      .where('isBusinessRelevant', '==', true)
      .limit(20)
      .get();

    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const results = [];
    const errors = [];

    for (const doc of docs) {
      if (!doc.driveId) continue;

      try {
        const customerName = normalizeName(doc.customer);
        const year = (doc.date ? doc.date.slice(0, 4) : null) || new Date().getFullYear().toString();
        const typeFolderName = TYPE_FOLDER[doc.docType] || 'Ostalo';

        // Kreiraj strukturu: COMMERCIAL / Kupac / Godina / Tip
        const custFolderId  = await getOrCreateFolder(drive, COMMERCIAL_FOLDER, customerName);
        const yearFolderId  = await getOrCreateFolder(drive, custFolderId, year);
        const typeFolderId  = await getOrCreateFolder(drive, yearFolderId, typeFolderName);

        // Premesti fajl u pravi folder
        // Uzmi trenutne roditelje fajla
        const fileMeta = await drive.files.get({
          supportsAllDrives: true,
          fileId: doc.driveId,
          fields: 'id, name, parents',
        });

        const currentParents = (fileMeta.data.parents || []).join(',');

        await drive.files.update({
          supportsAllDrives: true,
          fileId: doc.driveId,
          addParents: typeFolderId,
          removeParents: currentParents,
          fields: 'id, parents',
        });

        // Ažuriraj Firestore
        await db.collection('docworker').doc(doc.id).update({
          status: 'filed',
          filedAt: new Date(),
          filedPath: `${customerName} / ${year} / ${typeFolderName}`,
          driveFolderId: typeFolderId,
        });

        results.push({
          file: doc.fileName,
          customer: customerName,
          path: `${customerName} / ${year} / ${typeFolderName}`,
        });

      } catch (err) {
        errors.push({ file: doc.fileName, error: err.message });
        await db.collection('docworker').doc(doc.id).update({ status: 'file_error', fileError: err.message });
      }
    }

    res.json({
      ok: true,
      processed: docs.length,
      filed: results.length,
      errors: errors.length,
      results,
      errors,
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
