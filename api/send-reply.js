// ═══════════════════════════════════════════════════════════════
// send-reply.js v1 — Šalje pripremljeni email via Gmail API
//
// POST /api/send-reply
// Body: { docId, overrideBody?, overrideSubject?, extraCC? }
//
// Čita draftBody, draftSubject, draftCC iz docworker,
// šalje reply na originalni email (in-reply-to threadId),
// ažurira docworker: status="sent", sentAt, sentBy
// ═══════════════════════════════════════════════════════════════
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

function initAdmin() {
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID || 'molty-portal',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }) });
  }
}

// Ugradi RFC 2822 email poruku
function buildMimeMessage({ to, cc, subject, body, inReplyTo, references, from }) {
  const lines = [
    `From: ${from || 'Miroslav Paunov <miroslav.paunov@calderys.com>'}`,
    `To: ${to}`,
    cc && cc.length ? `Cc: ${Array.isArray(cc) ? cc.join(', ') : cc}` : null,
    `Subject: ${subject}`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
    references ? `References: ${references}` : null,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    body,
  ].filter(l => l !== null).join('\r\n');

  return Buffer.from(lines).toString('base64url');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = (req.headers.authorization || '').replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET && process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { docId, overrideBody, overrideSubject, extraCC, sentBy } = req.body || {};
  if (!docId) return res.status(400).json({ error: 'docId je obavezan' });

  initAdmin();
  const db = getFirestore();

  // Učitaj dokument
  const docSnap = await db.collection('docworker').doc(docId).get();
  if (!docSnap.exists) return res.status(404).json({ error: 'Dokument nije pronađen' });

  const doc = docSnap.data();

  if (!doc.draftBody && !overrideBody) {
    return res.status(400).json({ error: 'Nema pripremljenog emaila. Pokrenite auto-draft prvo.' });
  }

  // Uzmi originalni email za threading
  let inReplyTo = null;
  let threadId = null;
  let toAddress = null;
  let originalSubject = null;

  try {
    const gmail = getGmail();
    const msg = await gmail.users.messages.get({
      userId: 'me',
      id: doc.gmailId,
      format: 'metadata',
      metadataHeaders: ['From', 'Reply-To', 'Message-Id', 'References', 'Subject'],
    });

    const headers = msg.data.payload?.headers || [];
    const getH = name => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

    inReplyTo = getH('Message-Id');
    const replyTo = getH('Reply-To') || getH('From');
    toAddress = replyTo;
    originalSubject = getH('Subject');
    threadId = msg.data.threadId;
  } catch (e) {
    console.warn('[send-reply] Gmail metadata failed:', e.message);
    // Fallback: šalje na from adresu iz docworker
    toAddress = doc.from;
  }

  if (!toAddress) return res.status(400).json({ error: 'Nije moguće odrediti primaoca' });

  // Pripremi i pošalji
  const subject = overrideSubject || doc.draftSubject || `Re: ${originalSubject || doc.subject}`;
  const body = overrideBody || doc.draftBody;
  const cc = [...(doc.draftCC || []), ...(extraCC || [])];

  try {
    const gmail = getGmail();
    const raw = buildMimeMessage({ to: toAddress, cc, subject, body, inReplyTo });

    const sentMsg = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw, threadId: threadId || undefined },
    });

    // Upiši labels: MOLTY-replied
    try {
      const labelsRes = await gmail.users.labels.list({ userId: 'me' });
      let labelId = labelsRes.data.labels?.find(l => l.name === 'MOLTY-replied')?.id;
      if (!labelId) {
        const nl = await gmail.users.labels.create({ userId: 'me', requestBody: {
          name: 'MOLTY-replied', labelListVisibility: 'labelHide', messageListVisibility: 'hide',
        }});
        labelId = nl.data.id;
      }
      await gmail.users.messages.modify({ userId: 'me', id: doc.gmailId, requestBody: {
        addLabelIds: [labelId], removeLabelIds: ['UNREAD'],
      }});
    } catch {}

    // Ažuriraj docworker
    await docSnap.ref.update({
      status: 'sent',
      sentAt: new Date().toISOString(),
      sentTo: toAddress,
      sentCC: cc,
      sentSubject: subject,
      sentBy: sentBy || 'user',
      gmailSentId: sentMsg.data.id,
    });

    return res.json({ ok: true, sentId: sentMsg.data.id, to: toAddress, subject });

  } catch (e) {
    console.error('[send-reply] Send failed:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
