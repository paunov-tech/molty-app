// upload-gdrive.js — Preuzima Gmail attachment i uploaduje na Drive
import { google } from 'googleapis';

function getAuth() {
  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return auth;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = (req.headers.authorization || '').replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const { gmailId, fileName, customer, docType } = req.body || {};
  if (!gmailId) return res.status(400).json({ error: 'Missing gmailId' });

  try {
    const auth = getAuth();
    const gmail = google.gmail({ version: 'v1', auth });
    const drive = google.drive({ version: 'v3', auth });

    // 1. Nađi attachment u emailu
    const msg = await gmail.users.messages.get({ userId: 'me', id: gmailId, format: 'full' });
    const parts = msg.data.payload?.parts || [];
    const pdfPart = parts.find(p => p.filename?.endsWith('.pdf') || p.mimeType === 'application/pdf');
    if (!pdfPart?.body?.attachmentId) return res.status(404).json({ error: 'PDF attachment not found' });

    // 2. Preuzmi attachment
    const att = await gmail.users.messages.attachments.get({
      userId: 'me', messageId: gmailId, id: pdfPart.body.attachmentId
    });
    const buffer = Buffer.from(att.data.data, 'base64');

    // 3. Nađi ili kreiraj folder za kupca
    const FOLDER_ID = process.env.COMMERCIAL_FOLDER_ID || '1zsDeckOseY0gMerBHU8nG0p-qKXDV8bN';
    let folderId = FOLDER_ID;
    if (customer) {
      const folderSearch = await drive.files.list({
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        q: `mimeType='application/vnd.google-apps.folder' and name='${customer}' and '${FOLDER_ID}' in parents and trashed=false`,
        fields: 'files(id,name)',
      });
      if (folderSearch.data.files?.length) {
        folderId = folderSearch.data.files[0].id;
      }
    }

    // 4. Upload na Drive
    const uploadName = fileName || `${new Date().toISOString().slice(0,10)}_${pdfPart.filename}`;
    const { Readable } = await import('stream');
    const driveRes = await drive.files.create({
      supportsAllDrives: true,
      requestBody: { name: uploadName, parents: [folderId] },
      media: {
        mimeType: 'application/pdf',
        body: Readable.from(buffer),
      },
      fields: 'id,name,webViewLink',
    });

    res.json({
      ok: true,
      fileId: driveRes.data.id,
      uploadName,
      folder: customer || 'root',
      link: driveRes.data.webViewLink,
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
