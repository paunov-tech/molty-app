// ═══════════════════════════════════════════════════
// MOLTY API: Gmail Sync — čita emailove, upload na Drive
// ═══════════════════════════════════════════════════
import { google } from 'googleapis';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function getGmail() {
  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: 'v1', auth });
}

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

// Filter — koji emailovi su relevantni
function isRelevant(msg) {
  // Accept all emails with PDF attachments — filter later in DocCenter
  return true;
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
    const gmail = getGmail();
    const drive = getDrive();

    const FOLDER_ID = process.env.COMMERCIAL_FOLDER_ID || '1zsDeckOseY0gMerBHU8nG0p-qKXDV8bN';

    // 1. Nađi nepročitane emailove sa attachmentima
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'in:inbox has:attachment newer_than:30d',
      maxResults: 20,
    });

    const messages = listRes.data.messages || [];
    const results = [];

    for (const { id } of messages) {
      // 2. Uzmi detalje emaila
      const msgRes = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'full',
      });

      const headers = msgRes.data.payload?.headers || [];
      const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

      const meta = {
        from: getHeader('From'),
        subject: getHeader('Subject'),
        date: getHeader('Date'),
        messageId: id,
      };

      // 3. Filter
      if (!isRelevant(meta)) {
        // Označi kao processed da ne čita ponovo
        await gmail.users.messages.modify({
          userId: 'me', id,
          requestBody: { addLabelIds: [], removeLabelIds: ['UNREAD'] },
        });
        continue;
      }

      // 4. Nađi PDF attachmente
      const parts = msgRes.data.payload?.parts || [];
      const pdfParts = parts.filter(p =>
        p.filename?.endsWith('.pdf') || p.mimeType === 'application/pdf'
      );

      for (const part of pdfParts) {
        if (!part.body?.attachmentId) continue;

        // 5. Preuzmi attachment
        const attRes = await gmail.users.messages.attachments.get({
          userId: 'me', messageId: id, id: part.body.attachmentId,
        });

        const fileBuffer = Buffer.from(attRes.data.data, 'base64');

        // 6. Upload na Drive
        const fileName = `${new Date().toISOString().slice(0,10)}_email_${part.filename}`;
        const driveRes = await drive.files.create({
          supportsAllDrives: true,
          requestBody: {
            name: fileName,
            parents: [FOLDER_ID],
          },
          media: {
            mimeType: 'application/pdf',
            body: new (await import('stream')).Readable({ read() { this.push(fileBuffer); this.push(null); } }),
          },
          fields: 'id, name',
        });

        // 7. Upiši u Firestore docworker
        await db.collection('docworker').add({
          fileName,
          driveId: driveRes.data.id,
          gmailId: id,
          messageId: id,
          source: 'gmail',
          from: meta.from,
          subject: meta.subject,
          date: meta.date,
          status: 'new',
          timestamp: new Date(),
        });

        results.push({ file: fileName, driveId: driveRes.data.id });
      }

      // 8. Označi email kao obrađen
      await gmail.users.messages.modify({
        userId: 'me', id,
        requestBody: { removeLabelIds: ['UNREAD'] },
      });
    }

    res.json({ ok: true, checked: messages.length, uploaded: results.length, files: results });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
