// ═══════════════════════════════════════════════════════════════
// api/agent-orchestrator.js — ANVIL™ Agentic Backend
// 
// Centralni mozak koji zamenjuje frontend-only FULL AUTO logiku.
// Čita docworker, odlučuje autonomno, izvršava, loguje.
//
// Chain-of-Thought per dokument → akcija → izvršenje → status update
// Feedback loop: prati da li je draft poslan, je li ponuda prihvaćena
//
// Cron: */15 * * * * (svaki 15 min)
// ═══════════════════════════════════════════════════════════════

import { google } from 'googleapis';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ── Konfig ──────────────────────────────────────────────────────
const CONFIDENCE_THRESHOLDS = {
  fileToDrive:   { auto: 90, semi: 75 },  // strukturirani fajlovi
  logRevenue:    { auto: 88, semi: 78 },  // fakture i krediti
  createQuote:   { auto: 0,  semi: 82 },  // NIKAD full auto — uvek odobrenjen
  enrichTDS:     { auto: 85, semi: 70 },
  sendFollowup:  { auto: 0,  semi: 80 },  // NIKAD full auto — email
};

// VIP kupci — uvek SEMI (čeka odobrenje, bez obzira na confidence)
const VIP_CUSTOMERS = ['HBIS', 'ArcelorMittal', 'Lafarge', 'INA', 'Makstil', 'Metalfer', 'Talum'];

function initAll() {
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID || 'molty-portal',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    })});
  }
  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return {
    db: getFirestore(),
    gmail: google.gmail({ version: 'v1', auth }),
  };
}

// ── Chain-of-Thought analiza jednog dokumenta ───────────────────
async function analyzeDoc(doc) {
  const prompt = `Ti si ANVIL™ AI agent za Calderys South-East Europe.
Analiziraj ovaj poslovni dokument i odluči šta tačno treba uraditi.

DOKUMENT:
  Tip: ${doc.docType}
  Kupac: ${doc.customer || 'Nepoznat'}
  Iznos: ${doc.amount ? doc.amount + ' ' + (doc.currency || 'EUR') : 'nije naveden'}
  Faktura/Ref: ${doc.invoiceNo || 'N/A'}
  Fajl: ${doc.fileName}
  Od: ${doc.from}
  Subject: ${doc.subject}
  Confidence klasifikacije: ${doc.confidence || '?'}%
  
CHAIN-OF-THOUGHT:
1. Da li je ovo legitiman poslovni dokument?
2. Koji je sledeći konkretan korak u procesu?
3. Da li postoji rizik (duplikat, greška, visoka vrednost)?
4. Šta bi TSR (Miroslav Paunov) uradio s ovim u narednih 15 minuta?

Odgovori ISKLJUČIVO u JSON:
{
  "reasoning": "2-3 rečenice obrazloženja",
  "action": "fileToDrive|logRevenue|createQuote|enrichTDS|escalate|ignore",
  "priority": "critical|high|medium|low",
  "confidence": 0-100,
  "suggestion": "konkretna preporuka u jednoj rečenici",
  "flags": [],
  "estimatedValue": null,
  "riskNote": null
}

Flags mogući: high_value (>5000 EUR), vip_customer, urgent, duplicate_risk, complaint, new_customer`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  
  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { action: 'unknown', confidence: 0, reasoning: text.slice(0, 200) };
  
  try { return JSON.parse(match[0]); }
  catch { return { action: 'unknown', confidence: 0, reasoning: text.slice(0, 200) }; }
}

// ── Odluka: auto ili semi ───────────────────────────────────────
function decideMode(doc, analysis) {
  const action = analysis.action;
  const conf   = analysis.confidence || 0;
  const th     = CONFIDENCE_THRESHOLDS[action] || { auto: 95, semi: 80 };
  
  // Nikad auto za createQuote i sendFollowup
  if (th.auto === 0) return 'semi';
  
  // VIP kupaci uvek semi
  const isVIP = VIP_CUSTOMERS.some(v => (doc.customer || '').toLowerCase().includes(v.toLowerCase()));
  if (isVIP) return 'semi';
  
  // High value uvek semi
  if (analysis.flags?.includes('high_value') || (doc.amount || 0) > 5000) return 'semi';
  
  if (conf >= th.auto) return 'auto';
  if (conf >= th.semi) return 'semi';
  return 'manual';
}

// ── Izvršenje akcija ────────────────────────────────────────────
async function executeAction(action, doc, db) {
  switch (action) {
    
    case 'fileToDrive': {
      // Označi za auto-file.js koji će preuzeti
      await db.collection('docworker').doc(doc.id).update({
        driveStatus: 'pending',
        agentQueued: true,
        updatedAt: new Date(),
      });
      return { done: true, note: 'Queued for structured Drive upload' };
    }
    
    case 'logRevenue': {
      // Upiši u pipelines kolekciju za Pipeline Tracker
      const existing = await db.collection('pipelines')
        .where('invoiceNo', '==', doc.invoiceNo)
        .where('customer', '==', doc.customer)
        .limit(1).get();
      
      if (!existing.empty) {
        return { done: false, note: 'Duplicate — already in pipelines', duplicate: true };
      }
      
      await db.collection('pipelines').add({
        customer: doc.customer,
        invoiceNo: doc.invoiceNo,
        amount: doc.amount,
        currency: doc.currency || 'EUR',
        docType: doc.docType,
        driveId: doc.driveId,
        source: 'agent_auto',
        status: 'registered',
        createdAt: new Date(),
      });
      return { done: true, note: 'Logged to Pipeline Tracker' };
    }
    
    case 'enrichTDS': {
      // Označi za auto-forward-tds.js
      await db.collection('docworker').doc(doc.id).update({
        tdsStatus: 'pending_forward',
        updatedAt: new Date(),
      });
      return { done: true, note: 'Queued for TDS forward' };
    }
    
    case 'escalate': {
      // Upis u brain_insights za brifing
      await db.collection('brain_insights').add({
        type: 'escalation',
        docId: doc.id,
        customer: doc.customer,
        subject: doc.subject,
        reason: 'Agent escalation',
        priority: 'critical',
        createdAt: new Date(),
        resolved: false,
      });
      return { done: true, note: 'Escalated to daily brief' };
    }
    
    default:
      return { done: false, note: `No executor for action: ${action}` };
  }
}

// ── Feedback loop — proveri da li su draft-ovi poslati ──────────
async function checkDraftFeedback(db, gmail) {
  const drafted = await db.collection('docworker')
    .where('status', '==', 'drafted')
    .where('draftGmailId', '!=', null)
    .limit(30).get();
  
  let sent = 0;
  for (const snap of drafted.docs) {
    const doc = snap.data();
    try {
      // Proveri da li je draft još uvek u drafts ili je poslan
      await gmail.users.drafts.get({ userId: 'me', id: doc.draftGmailId });
      // Ako get uspe → još uvek draft (nije poslan)
    } catch (e) {
      if (e.code === 404) {
        // Draft ne postoji → verovatno poslan
        await snap.ref.update({ status: 'sent', sentAt: new Date() });
        sent++;
      }
    }
  }
  return sent;
}

// ── Detekcija duplikata ─────────────────────────────────────────
async function checkDuplicate(db, doc) {
  if (!doc.invoiceNo && !doc.gmailId) return false;
  
  const q = await db.collection('docworker')
    .where('invoiceNo', '==', doc.invoiceNo)
    .where('customer', '==', doc.customer)
    .limit(2).get();
  
  return q.docs.filter(d => d.id !== doc.id).length > 0;
}

// ── Main handler ────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if ((req.headers.authorization || '') !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { db, gmail } = initAll();
  const stats = { analyzed: 0, auto: 0, semi: 0, manual: 0, errors: 0, duplicates: 0 };

  try {
    // ── 1. Feedback loop ───────────────────────────────────────
    const sent = await checkDraftFeedback(db, gmail);
    stats.sentDrafts = sent;

    // ── 2. Novi dokumenti za analizu ──────────────────────────
    const newDocs = await db.collection('docworker')
      .where('status', '==', 'new')
      .where('isBusinessRelevant', '==', true)
      .orderBy('timestamp', 'desc')
      .limit(15).get();

    for (const snap of newDocs.docs) {
      const doc = { id: snap.id, ...snap.data() };
      
      try {
        // Provera duplikata
        const isDuplicate = await checkDuplicate(db, doc);
        if (isDuplicate) {
          await snap.ref.update({ 
            status: 'duplicate', 
            agentNote: 'Duplicate detected by agent',
            updatedAt: new Date(),
          });
          stats.duplicates++;
          continue;
        }

        // Chain-of-thought analiza
        const analysis = await analyzeDoc(doc);
        const mode = decideMode(doc, analysis);
        
        stats.analyzed++;
        stats[mode]++;

        // Upis analize u Firestore
        const updateData = {
          agentAnalysis: analysis,
          agentMode: mode,
          agentAction: analysis.action,
          agentConfidence: analysis.confidence,
          agentFlags: analysis.flags || [],
          agentSuggestion: analysis.suggestion,
          updatedAt: new Date(),
        };

        if (mode === 'auto') {
          // Izvrši odmah
          const result = await executeAction(analysis.action, doc, db);
          if (result.duplicate) {
            updateData.status = 'duplicate';
          } else if (result.done) {
            updateData.status = 'agent_processed';
            updateData.agentExecuted = true;
            updateData.agentResult = result.note;
          }
        } else if (mode === 'semi') {
          // Čeka odobrenje u AgentInbox
          updateData.status = 'needs_approval';
        } else {
          // Manual — ostavi kao new ali dodaj analizu
          updateData.status = 'needs_review';
        }

        await snap.ref.update(updateData);

      } catch (e) {
        console.error(`[agent] ERR doc ${doc.id}:`, e.message);
        stats.errors++;
        await snap.ref.update({ 
          status: 'agent_error', 
          agentError: e.message,
          updatedAt: new Date(),
        });
      }
    }

    // ── 3. Log stats ───────────────────────────────────────────
    if (stats.analyzed > 0 || stats.sentDrafts > 0) {
      await db.collection('brain_insights').add({
        type: 'agent_run',
        stats,
        runAt: new Date(),
      });
    }

    console.log('[agent-orchestrator]', JSON.stringify(stats));
    return res.status(200).json({ ok: true, ...stats });

  } catch (e) {
    console.error('[agent-orchestrator] Fatal:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
