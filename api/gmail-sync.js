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

// Calderys grupa + naša firma — UVEK supplier, nikad customer.
// Bug #3 (Calderys Deutschland kao klijent) + Bug #4 (SIAL kao samokupac).
const SUPPLIER_BLOCKLIST = [
  'calderys', 'sial consulting', 'sial d.o.o.', 'sial doo',
];
function isSupplier(name) {
  if (!name) return false;
  const n = String(name).toLowerCase();
  return SUPPLIER_BLOCKLIST.some(s => n.includes(s));
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
    // drive = getDrive(); // uklonjeno v2 — upload delegiran auto-file.js

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
        // Gmail vraća base64url — konvertuj u standardni base64 za Anthropic
        const pdfBase64 = attRes.data.data.replace(/-/g, '+').replace(/_/g, '/');

        // 6. Claude skenira PDF — kupac, tip, materijali
        let parsed = { type: 'unknown', customer: { name: null, country: null }, items: [], documentNumber: null, totalAmount: null, currency: 'EUR' };
        try {
          const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
          const prompt = `Analiziraj ovaj poslovni dokument iz industrije vatrostalnih materijala (Calderys).

EMAIL KONTEKST (koristi za fallback ako u PDF-u nije eksplicitno):
- Subject: ${meta.subject || '(nepoznat)'}
- From: ${meta.from || '(nepoznat)'}

KONTEKST: Calderys je dobavljač vatrostalnih materijala. Kupac je firma kojoj se šalje dokument.
- Faktura/Ponuda/OC: kupac je "Bill To", "Sold To", "Company", "Quotation For", "To:", adresa primaoca
- Calderys varijante su UVEK supplier: Calderys Austria, Calderys DE, Calderys Deutschland, SIAL
- Ako u PDF-u nije naveden kupac, izvuci ga iz subject-a ili sender domain-a (npr. "@hbis.com" → HBIS Group)
- "material" polje je naziv vatrostalne mase (CALDE, SILICA MIX, ...) — NIKAD ne stavljaj ime kupca u "material"
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
  "currency": "EUR|USD|RSD|null",
  "confidence": number_0_to_100,
  "reasoning": "Kratki sažetak dokumenta na srpskom: tip, kupac, šta se traži/nudi, ključne stavke. Max 2 rečenice.",
  "isBusinessRelevant": true_or_false
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

        // 7. Pripremi za strukturirani upload (auto-file.js)
        const fileName = `${new Date().toISOString().slice(0,10)}_email_${part.filename}`;
        // attachmentB64 se NE čuva u Firestore — Firestore limit je 1MB.
        // auto-file.js preuzima PDF iz Gmaila koristeći gmailId + filename.

        // 8. Post-AI validacija — guard rails za Bug #1, #3, #4.
        let customerName = typeof parsed.customer === 'object' ? parsed.customer?.name : parsed.customer;
        let customerCountry = parsed.customer?.country || null;
        let cleanItems = Array.isArray(parsed.items) ? parsed.items : [];

        // #3/#4: ako AI ipak vrati supplier-a kao kupca, briši — ne tretiraj kao customer.
        if (isSupplier(customerName)) {
          customerName = null;
          customerCountry = null;
        }

        // #1: ne dozvoli da ime kupca procuri u listu materijala (parser zbunjuje table layout).
        if (customerName) {
          const cn = String(customerName).toLowerCase();
          cleanItems = cleanItems.filter(it => {
            const m = String(it?.material || '').toLowerCase();
            return m && m !== cn && !m.includes(cn);
          });
        }
        // Pribij i one stavke gde je material prazan ili je čista email/adresa.
        cleanItems = cleanItems.filter(it => {
          const m = String(it?.material || '').trim();
          return m && !m.includes('@');
        });

        // #2: auto-verify ako AI je siguran i kompletan (≥90 confidence + customer + barem 1 stavka).
        const autoVerify =
          (parsed.confidence || 0) >= 90 &&
          !!customerName &&
          cleanItems.length > 0;

        // 9. Upiši u Firestore — driveStatus:'pending', auto-file.js uploaduje u COMMERCIAL/[Kupac]/[God]/[Tip]
        await db.collection('docworker').add({
          fileName,
          driveId: null,
          driveStatus: 'pending',
          gmailId: id,
          source: 'gmail',
          from: meta.from,
          subject: meta.subject,
          date: meta.date,
          status: autoVerify ? 'verified' : 'review',
          docType: parsed.type || 'unknown',
          customer: customerName || null,
          customerCountry,
          invoiceNo: parsed.documentNumber || null,
          amount: parsed.totalAmount || null,
          currency: parsed.currency || 'EUR',
          items: cleanItems,
          confidence: parsed.confidence || null,
          reasoning: parsed.reasoning || null,
          isBusinessRelevant: parsed.isBusinessRelevant !== false,
          timestamp: new Date(),
        });
        results.push({ file: fileName, driveId: null, docType: parsed.type, customer: customerName, autoVerify });
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
