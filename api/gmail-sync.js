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
  const from = (msg.from || '').toLowerCase();
  const subject = (msg.subject || '').toLowerCase();
  // Calderys uvek prolazi
  if (from.includes('calderys.com')) return true;
  // Poznati kupci po domenu
  const customerDomains = ['hbis', 'amz', 'makstil', 'lafarge', 'heidelberg',
    'plamen', 'bamex', 'titan', 'moravacem', 'progress', 'ossam', 'autoflex',
    'radijator', 'vatrostalna', 'berg', 'livarna', 'cimos', 'eta',
    'aluminij', 'impol', 'lth', 'seval', 'ferro', 'vbs', 'sevojno'];
  if (customerDomains.some(s => from.includes(s))) return true;
  // Subject keywords
  const keywords = ['rfq', 'upit', 'ponuda', 'narudžba', 'narudzba',
    'purchase order', 'porudžbenica', 'faktura', 'invoice', 'order',
    'quotation', 'offer', 'zahtev', 'isporuka', 'otpremnica', 'tds'];
  if (keywords.some(s => subject.includes(s))) return true;
  // Ako ima PDF attachment — pusti kroz, Claude će odlučiti
  return msg.hasPdf || false;
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
      q: req.query.catchup === '1'
        ? 'has:attachment newer_than:14d'
        : 'has:attachment -label:MOLTY-processed',
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

      // 3. Dedup — preskoči ako već obrađen
      const existingSnap = await db.collection('docworker').where('gmailId', '==', id).limit(1).get();
      if (!existingSnap.empty) {
        console.log('[gmail-sync] skip duplicate gmailId:', id);
        continue;
      }
      // 3. Nađi PDF attachmente
      const parts = msgRes.data.payload?.parts || [];
      const pdfParts = parts.filter(p =>
        p.filename?.endsWith('.pdf') || p.mimeType === 'application/pdf'
      );

      // 4. Filter — ako nema PDF, preskoči
      if (pdfParts.length === 0) {
        await gmail.users.messages.modify({ userId: 'me', id, requestBody: { removeLabelIds: ['UNREAD'] } });
        continue;
      }

      for (const part of pdfParts) {
        if (!part.body?.attachmentId) continue;

        // 5. Preuzmi PDF buffer
        const attRes = await gmail.users.messages.attachments.get({
          userId: 'me', messageId: id, id: part.body.attachmentId,
        });
        const fileBuffer = Buffer.from(attRes.data.data, 'base64');
        // Gmail vraća base64url — konvertuj u standardni base64 za Anthropic
        const pdfBase64 = attRes.data.data.replace(/-/g, '+').replace(/_/g, '/');

        // 6. Claude skenira PDF — kupac, tip, materijali
        let parsed = { type: 'unknown', customer: { name: null, country: null }, items: [], documentNumber: null, totalAmount: null, currency: 'EUR' };
        try {
          const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
          const prompt = `Analiziraj ovaj poslovni dokument iz industrije vatrostalnih materijala (Calderys).
KONTEKST: Calderys je dobavljač vatrostalnih materijala. Kupac je firma kojoj se šalje dokument.
- Faktura/Ponuda/OC: kupac je "Bill To", "Sold To", "Company", "Quotation For", "To:", adresa primaoca
- Calderys varijante su UVEK supplier: Calderys Austria, Calderys DE, Calderys Deutschland, SIAL
- Za svaku stavku u tabeli izvuci: SAP kod (broj pozicije/materijala), naziv materijala, količinu, jedinicu, cenu, ukupno
- Materijali počinju sa: CALDE, SILICA MIX, PLAST, PLICAST, ALKON, PORIT, OPAL, ERMAG, ERSPIN
- totalAmount je NET amount ili Total (bez VAT ako je posebno navedeno)
Odgovori SAMO JSON bez ikakvog dodatnog teksta:
{
  "type": "invoice|offer|po|oc|other",
  "documentNumber": "string or null",
  "date": "YYYY-MM-DD or null",
  "customer": {"name": "string or null", "country": "ISO-2 or null", "city": "string or null"},
  "supplier": {"name": "string or null"},
  "items": [
    {
      "sapCode": "string or null",
      "material": "string or null",
      "quantity": number_or_null,
      "unit": "TO|KG|kom|null",
      "unitPrice": number_or_null,
      "totalPrice": number_or_null,
      "currency": "EUR|null"
    }
  ],
  "totalAmount": number_or_null,
  "currency": "EUR|USD|RSD|null"
}`;

          const aiRes = await fetch(ANTHROPIC_API, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': process.env.ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01',
              'anthropic-beta': 'pdfs-2024-09-25',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-6',
              max_tokens: 1500,
              messages: [{
                role: 'user',
                content: [
                  { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
                  { type: 'text', text: prompt },
                ],
              }],
            }),
          });
          const aiStatus = aiRes.status;
          const aiBody = await aiRes.json();
          if (aiStatus !== 200) {
            parsed = { type: 'api_error', _error: `${aiStatus}: ${JSON.stringify(aiBody).substring(0,150)}` };
          } else {
            const text = aiBody.content?.[0]?.text || '';
            const match = text.match(/\{[\s\S]*\}/);
            if (match) { parsed = JSON.parse(match[0]); } else { parsed = { type: 'no_json', _raw: text.substring(0,200) }; }
          }
        } catch (parseErr) {
          console.error('[gmail-sync] AI scan failed:', parseErr.message, parseErr.stack);
          parsed = { type: 'scan_error', _error: parseErr.message };
        }

        // 7. Upload na Drive
        const fileName = `${new Date().toISOString().slice(0,10)}_email_${part.filename}`;
        const driveRes = await drive.files.create({
          supportsAllDrives: true,
          requestBody: { name: fileName, parents: [FOLDER_ID] },
          media: {
            mimeType: 'application/pdf',
            body: new (await import('stream')).Readable({ read() { this.push(fileBuffer); this.push(null); } }),
          },
          fields: 'id, name',
        });

        // 8. Upiši u Firestore docworker sa parsed podacima
        const customerName = typeof parsed.customer === 'object' ? parsed.customer?.name : parsed.customer;
        await db.collection('docworker').add({
          fileName,
          driveId: driveRes.data.id,
          gmailId: id,
          source: 'gmail',
          from: meta.from,
          subject: meta.subject,
          date: meta.date,
          status: 'new',
          docType: parsed.type || 'unknown',
          customer: customerName || null,
          customerCountry: parsed.customer?.country || null,
          invoiceNo: parsed.documentNumber || null,
          amount: parsed.totalAmount || null,
          currency: parsed.currency || 'EUR',
          items: parsed.items || [],
          timestamp: new Date(),
        });

        results.push({ file: fileName, driveId: driveRes.data.id, docType: parsed.type, customer: customerName, invoiceNo: parsed.documentNumber || null, amount: parsed.totalAmount || null, currency: parsed.currency || null, items: parsed.items || [] });
      }

      // 9. Označi email kao obrađen — dodaj MOLTY-processed label
      try {
        // Nađi ili kreiraj MOLTY-processed label
        const labelsRes = await gmail.users.labels.list({ userId: 'me' });
        let labelId = labelsRes.data.labels?.find(l => l.name === 'MOLTY-processed')?.id;
        if (!labelId) {
          const newLabel = await gmail.users.labels.create({
            userId: 'me',
            requestBody: { name: 'MOLTY-processed', labelListVisibility: 'labelHide', messageListVisibility: 'hide' },
          });
          labelId = newLabel.data.id;
        }
        await gmail.users.messages.modify({
          userId: 'me', id,
          requestBody: { addLabelIds: [labelId], removeLabelIds: ['UNREAD'] },
        });
      } catch (labelErr) {
        console.warn('[gmail-sync] label error:', labelErr.message);
      }
    }

    res.json({ ok: true, checked: messages.length, uploaded: results.length, files: results });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
