// ═══════════════════════════════════════════════════
// MOLTY API: Document Parser v3 — CLEAN
// Never returns 500. Always returns {success, parsed|error}
// Supports: PDF, Google Docs, Google Sheets
// ═══════════════════════════════════════════════════
import { google } from 'googleapis';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

function getDrive() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not set');
  let key;
  try { key = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); }
  catch { key = JSON.parse(raw); }
  return google.drive({ version: 'v3', auth: new google.auth.GoogleAuth({
    credentials: { client_email: key.client_email, private_key: key.private_key },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  }) });
}

// ── Get file content as text (handles Docs, Sheets, text files) ──
async function getFileAsText(drive, docId, mimeType) {
  // Google native formats → export
  if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    const r = await drive.files.export({ fileId: docId, mimeType: 'text/csv' });
    return r.data;
  }
  if (mimeType === 'application/vnd.google-apps.document') {
    const r = await drive.files.export({ fileId: docId, mimeType: 'text/plain' });
    return r.data;
  }
  // Plain text
  if (mimeType?.startsWith('text/')) {
    const r = await drive.files.get({ fileId: docId, alt: 'media' }, { responseType: 'text' });
    return r.data;
  }
  // .docx uploaded files — skip (can't extract text server-side without extra libs)
  if (mimeType?.includes('word') || mimeType?.includes('officedocument')) {
    return null; // will trigger "Prazan dokument" which is fine
  }
  return null;
}

// ── Get PDF as base64 ──
async function getPdfBase64(drive, docId) {
  const r = await drive.files.get({ fileId: docId, alt: 'media' }, { responseType: 'arraybuffer' });
  const buf = Buffer.from(r.data);
  if (buf.length > 4 * 1024 * 1024) throw new Error('PDF >4MB');
  return buf.toString('base64');
}

// ── Call Claude API ──
async function callClaude(content, fileName, docType) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const prompt = buildPrompt(fileName, docType || 'commercial');

  // Content can be text string or PDF base64
  let messages;
  if (typeof content === 'string') {
    messages = [{ role: 'user', content: `${prompt}\n\nDokument:\n---\n${content.substring(0, 8000)}\n---` }];
  } else {
    // PDF base64
    messages = [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: content } },
        { type: 'text', text: prompt },
      ],
    }];
  }

  const response = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'pdfs-2024-09-25',
    },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, messages }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Claude API ${response.status}: ${errText.substring(0, 200)}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude vratio tekst bez JSON-a');
  return JSON.parse(jsonMatch[0]);
}

// ── Prompts ──
function buildPrompt(fileName, docType) {
  if (docType === 'tds') return buildTdsPrompt(fileName);
  return buildCommercialPrompt(fileName);
}

function buildCommercialPrompt(fileName) {
  return `Analiziraj ovaj poslovni dokument (faktura/ponuda) iz industrije vatrostalnih materijala.
Ime fajla: ${fileName}

Odgovori ISKLJUČIVO u JSON formatu:
{
  "type": "invoice|offer|credit_note|other",
  "documentNumber": "string or null",
  "date": "YYYY-MM-DD or null",
  "customer": {
    "name": "ime kupca/firme",
    "country": "ISO 2-letter or null",
    "city": "grad or null"
  },
  "supplier": {
    "name": "dobavljač or null"
  },
  "items": [
    {
      "material": "naziv materijala",
      "quantity": number_or_null,
      "unit": "kg|t|kom|m2|null",
      "unitPrice": number_or_null,
      "totalPrice": number_or_null,
      "currency": "EUR|USD|RSD|null"
    }
  ],
  "totalAmount": number_or_null,
  "currency": "EUR|USD|RSD|null"
}

Odgovori SAMO JSON, bez dodatnog teksta.`;
}

function buildTdsPrompt(fileName) {
  return `Ovo je Technical Data Sheet (TDS) vatrostalnog materijala kompanije Calderys.
Ime fajla: ${fileName}

Izvuci SAMO podatke koji su EKSPLICITNO navedeni u dokumentu.

⚠️ STROGA PRAVILA:
- AKO podatak NE POSTOJI u dokumentu, stavi null. NIKADA ne izmišljaj vrednosti!
- AKO nisi siguran, stavi null.
- NE pretpostavljaj temperaturu, gustinu, hemijski sastav ili bilo šta na osnovu sličnih materijala.
- SAMO kopiraj brojeve koji su jasno napisani u dokumentu.

Odgovori ISKLJUČIVO u JSON formatu:
{
  "type": "tds",
  "materialName": "pun naziv materijala (npr. CALDE CAST M 32)",
  "productCode": "interni kod ako postoji (npr. MAF40050) or null",
  "brand": "Calderys|Alkon|other",
  "category": "castable|gunning|ramming|trowelling|patching|flow|spray|plaster|mix|brick|other",
  "application": "kratak opis primene ili null ako nije navedeno",
  "installMethod": "casting|gunning|ramming|trowelling|patching|spraying|vibrating|other|null",
  "maxServiceTemp": number_celsius_or_null,
  "maxServiceTempUnit": "°C",
  "density": number_kg_m3_or_null,
  "crushingStrength": number_MPa_or_null,
  "porosity": number_percent_or_null,
  "thermalConductivity": number_W_per_mK_or_null,
  "chemicalComposition": {
    "Al2O3": number_percent_or_null,
    "SiO2": number_percent_or_null,
    "Fe2O3": number_percent_or_null,
    "CaO": number_percent_or_null,
    "MgO": number_percent_or_null,
    "Cr2O3": number_percent_or_null,
    "ZrO2": number_percent_or_null,
    "SiC": number_percent_or_null,
    "C": number_percent_or_null
  },
  "grainSize": "string or null (e.g. 0-6mm)",
  "waterAddition": "string or null (e.g. 5.5-6.5%)",
  "shelfLife": "string or null (e.g. 12 months)",
  "packaging": "string or null (e.g. 25kg bags, 1000kg big bags)"
}

Ako dokument ne sadrži hemijski sastav, stavi SVE hemijske vrednosti na null.
Ako dokument ne sadrži fizičke osobine, stavi ih na null.
Odgovori SAMO JSON, bez dodatnog teksta.`;
}

// ── Handler — NEVER returns 500 ──
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(200).json({ success: false, error: 'GET only' });

  const { docId, test, docType } = req.query;
  if (!docId) return res.status(200).json({ success: false, error: 'Missing docId' });

  try {
    const drive = getDrive();
    const meta = await drive.files.get({ fileId: docId, fields: 'id,name,mimeType,modifiedTime,size' });
    const { name, mimeType } = meta.data;

    // Test mode — metadata only
    if (test === '1') {
      return res.status(200).json({ success: true, test: true, file: meta.data });
    }

    let parsed;

    if (mimeType === 'application/pdf') {
      const b64 = await getPdfBase64(drive, docId);
      parsed = await callClaude(b64, name, docType);
    } else {
      const text = await getFileAsText(drive, docId, mimeType);
      if (!text || text.length < 10) {
        return res.status(200).json({ success: true, parsed: null, message: 'Prazan dokument', fileName: name });
      }
      parsed = await callClaude(text, name, docType);
    }

    return res.status(200).json({ success: true, parsed, fileName: name, mimeType });

  } catch (err) {
    return res.status(200).json({
      success: false,
      error: err.message,
      message: err.message,
      docId,
    });
  }
}
