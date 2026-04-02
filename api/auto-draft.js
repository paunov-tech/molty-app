// ═══════════════════════════════════════════════════════════════
// auto-draft.js v2 — Kontekstualni email composer
//
// Za svaki docworker dokument s needs_reply=true i bez drafta:
//   1. Uzme customer historiju iz revenuhub_invoices
//   2. Uzme zadnje cijene, kontakt, TDS dostupne na Driveu
//   3. Generiše profesionalan email na ispravnom jeziku
//   4. Predlaže attachmente (TDS, ponuda, faktura)
//   5. Upiše: draftBody, draftSubject, draftLang, draftCC,
//             draftAttachmentSuggestions, status="drafted"
//
// Cron: */30 * * * *
// Može se pozvati i direktno: POST /api/auto-draft { docId }
// ═══════════════════════════════════════════════════════════════
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

function initAdmin() {
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID || 'molty-portal',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }) });
  }
}

// ── Jezik po zemlji ──────────────────────────────────────────────
const LANG_MAP = { RS: 'sr', BA: 'sr', ME: 'sr', MK: 'mk', HR: 'hr', SI: 'sl', AT: 'de', DE: 'de' };
const LANG_NAME = { sr: 'srpski', hr: 'hrvatski', sl: 'slovenački', de: 'njemački', mk: 'makedonski' };

// ── Uzmi customer historiju iz RevHub ────────────────────────────
async function getCustomerContext(db, customerName) {
  if (!customerName) return null;
  const snap = await db.collection('revenuhub_invoices')
    .where('cust', '>=', customerName.slice(0, 6))
    .where('cust', '<=', customerName.slice(0, 6) + '\uf8ff')
    .orderBy('cust').orderBy('date', 'desc')
    .limit(5).get();

  if (snap.empty) return null;

  const invoices = snap.docs.map(d => d.data());
  const totalEur = invoices.reduce((s, i) => s + (i.tot || 0), 0);
  const lastInv = invoices[0];

  // Sve materijale s posljednjim cijenama
  const matPrices = {};
  invoices.forEach(inv => {
    (inv.items || []).forEach(it => {
      if (it.desc && it.p && !matPrices[it.desc]) {
        matPrices[it.desc] = { price: it.p, unit: it.u, date: inv.date };
      }
    });
  });

  return {
    name: lastInv.cust,
    country: lastInv.co,
    contact: lastInv.contact || '',
    lastOrderDate: lastInv.date,
    totalEur: Math.round(totalEur),
    invoiceCount: invoices.length,
    topMaterials: Object.entries(matPrices).slice(0, 5).map(([name, v]) =>
      `${name}: €${v.price}/${v.unit} (${v.date})`),
  };
}

// ── Uzmi TDS dokumente dostupne za kupca ────────────────────────
async function getAvailableTDS(db, customer) {
  const snap = await db.collection('docworker')
    .where('docType', '==', 'tds')
    .where('driveStatus', '==', 'structured')
    .limit(10).get();
  return snap.docs.map(d => ({ name: d.data().fileName, url: d.data().pdfUrl })).filter(f => f.url);
}

// ── Sistemski prompt — Calderys agent ───────────────────────────
function buildSystemPrompt() {
  return `Ti si profesionalni poslovni asistent za Calderys Serbia, distributera vatrostalnih materijala.
Kompanija: Calderys Serbia d.o.o, Beograd
Odgovorni prodavač: Miroslav Paunov (miroslav.paunov@calderys.com)
Tehnički tim: Radojka Ilić (radojka.ilic@calderys.com), Sonja Marković (sonja.markovic@calderys.com)

PRAVILA:
- Uvijek se obraćaj kupcu IMENOM ako je poznato, inače sa "Poštovani"
- Budi profesionalan, koncizan, direktan — bez suvišnih komplimenta
- Potpiši se kao Miroslav Paunov
- Jezik: prilagodi zemlji kupca
- Nikad ne obećavaj rok isporuke bez potvrde
- Za cijene uvijek napiši "podložno potvrdi / subject to confirmation"
- Format: čisti plain text email, bez HTML tagova
`;
}

// ── Generiši email za PO/RFQ ─────────────────────────────────────
function buildPOPrompt(doc, ctx, lang) {
  const langName = LANG_NAME[lang] || 'srpski';
  const ctxStr = ctx
    ? `Historija kupca:
- Ukupno naručeno: €${ctx.totalEur.toLocaleString()}
- Zadnja narudžba: ${ctx.lastOrderDate}
- Kontakt: ${ctx.contact || 'nepoznat'}
- Poznate cijene materijala: ${ctx.topMaterials.join('; ') || 'nema podataka'}`
    : 'Nema historije kupca u sistemu — novi kupac.';

  return `Napiši odgovor na Purchase Order / RFQ email na ${langName} jeziku.

DOKUMENT:
Kupac: ${doc.customer || 'Nepoznat'}
Zemlja: ${doc.customerCountry || 'RS'}
Materijali: ${(doc.items || []).map(i => `${i.material} ${i.quantity}${i.unit}`).join(', ') || 'Nije specificirano'}
Iznos: ${doc.amount ? `€${doc.amount}` : 'Nije navedeno'}
Predmet originala: ${doc.subject || ''}
AI sažetak: ${doc.reasoning || ''}

${ctxStr}

Odgovor treba:
1. Potvrditi primitak narudžbe
2. Navesti da se priprema ponuda / RFQ za Sonjinog tima
3. Navesti očekivani rok odgovora (2-3 radna dana)
4. Zatražiti potvrdu tehničkih specifikacija ako nedostaju
5. Ne navoditi konkretne cijene bez "subject to confirmation"

Format:
Subject: Re: [originalni predmet]
---
[tijelo emaila]

Miroslav Paunov
Calderys Serbia d.o.o.`;
}

// ── Generiši email za Invoice potvrdu ────────────────────────────
function buildInvoicePrompt(doc, ctx, lang) {
  const langName = LANG_NAME[lang] || 'srpski';
  return `Napiši kratku potvrdu prijema fakture na ${langName} jeziku.

FAKTURA:
Kupac: ${doc.customer || 'Nepoznat'}
Iznos: €${doc.amount || '—'}
Broj fakture: ${doc.invoiceNo || '—'}
AI sažetak: ${doc.reasoning || ''}

Odgovor treba:
1. Potvrditi primitak fakture
2. Navesti rok plaćanja (ako se može zaključiti) ili zatražiti potvrdu uslova
3. Biti maksimalno kratak (3-4 rečenice)

Format:
Subject: Re: [originalni predmet]
---
[tijelo emaila]

Miroslav Paunov
Calderys Serbia d.o.o.`;
}

// ── Generiši email za reklamaciju ────────────────────────────────
function buildComplaintPrompt(doc, ctx, lang) {
  const langName = LANG_NAME[lang] || 'srpski';
  return `Napiši profesionalan odgovor na reklamaciju na ${langName} jeziku.

REKLAMACIJA:
Kupac: ${doc.customer || 'Nepoznat'}
Predmet: ${doc.subject || ''}
AI sažetak: ${doc.reasoning || ''}

Odgovor treba:
1. Izraziti razumijevanje za problem (bez priznavanja odgovornosti)
2. Navesti da se odmah pokreće istraga
3. Navesti rok za povratnu informaciju (48 sati)
4. Zatražiti: broj lot/šarže, fotografije, detaljan opis problema
5. Dodijeliti referentni broj reklamacije: RECL-${new Date().getFullYear()}-${doc.id.slice(0,4).toUpperCase()}

NAPOMENA: Ovo je kritičan email — mora biti besprijekoran.

Format:
Subject: Re: [originalni predmet] - Referenca RECL-${new Date().getFullYear()}-${doc.id.slice(0,4).toUpperCase()}
---
[tijelo emaila]

Miroslav Paunov
Calderys Serbia d.o.o.`;
}

// ── Pozovi Claude ────────────────────────────────────────────────
async function callClaude(systemPrompt, userPrompt, apiKey) {
  const resp = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  const data = await resp.json();
  return data.content?.[0]?.text || '';
}

// ── Parsiraj Subject iz generisanog emaila ───────────────────────
function parseSubjectAndBody(raw, fallbackSubject) {
  const subjectMatch = raw.match(/^Subject:\s*(.+)/m);
  const subject = subjectMatch ? subjectMatch[1].trim() : fallbackSubject;
  const body = raw.replace(/^Subject:.*\n?---\n?/m, '').trim();
  return { subject, body };
}

// ── Main handler ─────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = (req.headers.authorization || '').replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET && process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY nije postavljen' });

  initAdmin();
  const db = getFirestore();

  // Direktan poziv s docId
  const docId = req.body?.docId || req.query?.docId;
  let docs;
  if (docId) {
    const snap = await db.collection('docworker').doc(docId).get();
    docs = snap.exists ? [{ id: snap.id, ...snap.data() }] : [];
  } else {
    // Cron: uzmi dokumente koji trebaju odgovor
    const snap = await db.collection('docworker')
      .where('needs_reply', '==', true)
      .where('status', 'in', ['review', 'drafted'])
      .limit(5)
      .get();
    docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Filtriraj one koji već imaju draft
    docs = docs.filter(d => !d.draftBody);
  }

  if (!docs.length) return res.json({ ok: true, processed: 0 });

  const results = [];

  for (const doc of docs) {
    try {
      const type = doc.docType || 'unknown';
      const country = doc.customerCountry || 'RS';
      const lang = LANG_MAP[country] || 'sr';

      // Uzmi customer kontekst i dostupne TDS
      const [ctx, tdsFiles] = await Promise.all([
        getCustomerContext(db, doc.customer),
        getAvailableTDS(db, doc.customer),
      ]);

      // Odaberi odgovarajući prompt
      let userPrompt;
      const isComplaint = doc.routedAction === 'complaint_escalated';
      if (isComplaint) {
        userPrompt = buildComplaintPrompt(doc, ctx, lang);
      } else if (['po', 'rfq', 'oc', 'proforma'].includes(type)) {
        userPrompt = buildPOPrompt(doc, ctx, lang);
      } else if (['invoice', 'credit'].includes(type)) {
        userPrompt = buildInvoicePrompt(doc, ctx, lang);
      } else {
        // Generički odgovor za ostale tipove koji trebaju reply
        userPrompt = buildPOPrompt(doc, ctx, lang);
      }

      const raw = await callClaude(buildSystemPrompt(), userPrompt, apiKey);
      const { subject, body } = parseSubjectAndBody(raw, `Re: ${doc.subject || doc.fileName}`);

      // CC lista
      const cc = [];
      if (['po', 'rfq'].includes(type)) cc.push('sonja.markovic@calderys.com');
      if (isComplaint) cc.push('radojka.ilic@calderys.com', 'sonja.markovic@calderys.com');

      // Attachment prijedlozi (TDS za materijale navedene u dokumentu)
      const materials = (doc.items || []).map(i => i.material).filter(Boolean);
      const attachmentSuggestions = tdsFiles.filter(f =>
        materials.some(m => f.name.toLowerCase().includes(m.toLowerCase().slice(0, 6)))
      ).slice(0, 3);

      await db.collection('docworker').doc(doc.id).update({
        status: 'drafted',
        draftBody: body,
        draftSubject: subject,
        draftLang: lang,
        draftCC: cc,
        draftAttachmentSuggestions: attachmentSuggestions,
        draftedAt: new Date().toISOString(),
        draftModel: MODEL,
        customerContext: ctx ? {
          totalEur: ctx.totalEur,
          lastOrderDate: ctx.lastOrderDate,
          invoiceCount: ctx.invoiceCount,
        } : null,
      });

      results.push({ id: doc.id, customer: doc.customer, type, lang, ccCount: cc.length });
    } catch (e) {
      console.error(`[auto-draft] ERR ${doc.id}:`, e.message);
      results.push({ id: doc.id, error: e.message });
    }
  }

  return res.json({ ok: true, processed: results.length, results });
}
