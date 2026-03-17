// ═══════════════════════════════════════════════════════════════
// api/morning-brief-context.js — ANVIL™ Returning User Kontekst
// Port iz Jadran AI returning user logike + ANVIL kontekst
//
// Generiše personalizovani kontekst za jutarnji brifing:
//   • Dan u nedelji → fokus poruka
//   • Poslednja aktivnost → relevantni follow-up
//   • Pauza > 4h → "Nešto novo stiglo" badge
// ═══════════════════════════════════════════════════════════════

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function initAdmin() {
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID || "molty-portal",
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    })});
  }
}

// ── DAN U NEDELJI → FOKUS ────────────────────────────────────────
const DAY_FOCUS = {
  1: { // Ponedeljak
    label: "Nova nedelja",
    icon: "📋",
    focus: "Pregled nedelje: šta treba završiti, šta je u toku, novi prioriteti.",
    greeting: "Dobro jutro — nova nedelja, novi start.",
    checkItems: ["Nedovršeni zadaci sa prošle nedelje", "Novi emailovi vikend", "Rok isporuke ove nedelje"],
  },
  2: { // Utorak
    label: "Operativni dan",
    icon: "⚙️",
    focus: "Operativni fokus: follow-up narudžbenice, dokumentacija, oferte.",
    greeting: "Jutro. Operativni dan — fokus na dokumentima.",
    checkItems: ["Ponude koje čekaju odgovor", "Potvrde narudžbenica", "Tekuća dokumentacija"],
  },
  3: { // Srijeda
    label: "Mid-week review",
    icon: "📊",
    focus: "Provjeri pipeline: šta je napredovalo, šta se blokira.",
    greeting: "Sredina nedelje — pregled pipeline-a.",
    checkItems: ["Pipeline Tracker status", "Kupci bez odgovora 48h+", "Fakture za potvrdu"],
  },
  4: { // Četvrtak
    label: "Priprema vikenda",
    icon: "🎯",
    focus: "Pripremi završetak nedelje: hitni zadaci, follow-up, potvrde.",
    greeting: "Četvrtak — počni zatvarati nedelju.",
    checkItems: ["Sve što mora biti gotovo prije petka", "Hitni follow-up", "Priprema za terenski rad"],
  },
  5: { // Petak
    label: "Kraj nedelje",
    icon: "✅",
    focus: "Zatvori nedelju: sve potvrde, sve odgovore, čist ulaz za ponedjeljak.",
    greeting: "Petak. Zatvori sve otvorene stavke.",
    checkItems: ["Sve nekompletne fakture", "Čekaoci odgovora", "Arhiviranje nedelje"],
  },
  6: { // Subota
    label: "Vikend",
    icon: "🔔",
    focus: "Vikend — samo hitno. Provjeri kritična upozorenja.",
    greeting: "Vikend brifing — samo ono što ne može čekati.",
    checkItems: ["Kritični alarmi", "INA/HBIS hitno"],
  },
  0: { // Nedjelja
    label: "Priprema za nedelju",
    icon: "📅",
    focus: "Pregled za sutrašnju nedelju: šta čeka, šta je prioritet.",
    greeting: "Nedjelja — pripremi se za sutra.",
    checkItems: ["Nedovršeno iz prošle nedelje", "Priprema prioriteta"],
  },
};

// ── AKTIVNOST CONTEXT ─────────────────────────────────────────────
async function getActivityContext(db) {
  const now = Date.now();
  const yesterday = new Date(now - 86400000);
  const ctx = {};

  try {
    // Poslednji brifing — kada
    const lastBrief = await db.collection("brain_insights")
      .where("type", "==", "morning_brief")
      .orderBy("generatedAt", "desc")
      .limit(1).get();

    if (!lastBrief.empty) {
      const lb = lastBrief.docs[0].data();
      const daysSince = Math.floor((now - lb.generatedAt) / 86400000);
      ctx.lastBriefDays = daysSince;
      if (daysSince > 1) {
        ctx.missedBriefs = daysSince - 1;
      }
    }

    // Novi dokumenti od jutros
    const newDocs = await db.collection("docworker")
      .where("status", "==", "new")
      .orderBy("timestamp", "desc")
      .limit(20).get();
    ctx.newDocCount = newDocs.size;

    // Kritični dokumenti
    const critDocs = await db.collection("docworker")
      .where("agentMode", "==", "semi")
      .where("status", "==", "needs_approval")
      .limit(10).get();
    ctx.pendingApprovals = critDocs.size;

    // Aktivni alarmi
    const alarms = await db.collection("brain_insights")
      .where("type", "==", "escalation")
      .where("resolved", "==", false)
      .limit(5).get();
    ctx.activeAlarms = alarms.size;
    ctx.alarmDetails = alarms.docs.map(d => ({
      customer: d.data().customer,
      reason: d.data().reason,
    }));

    // Pipeline bez update-a 3+ dana
    const staleDate = new Date(now - 3 * 86400000);
    const stalePipes = await db.collection("pipelines")
      .where("status", "==", "active")
      .where("updatedAt", "<", staleDate)
      .limit(5).get();
    ctx.stalePipelines = stalePipes.docs.map(d => d.data().customer);

    // Agent run statistike
    const agentRun = await db.collection("brain_insights")
      .where("type", "==", "agent_run")
      .orderBy("runAt", "desc")
      .limit(1).get();
    if (!agentRun.empty) {
      ctx.lastAgentStats = agentRun.docs[0].data().stats;
    }

  } catch (e) {
    console.error("[morning-context] DB error:", e.message);
  }

  return ctx;
}

// ── GENERIŠI KONTEKST ZA CLAUDE ──────────────────────────────────
function buildBriefingContext(dayFocus, activity, previousContext = "") {
  const parts = [];

  // Dan u nedelji
  parts.push(`${dayFocus.icon} ${dayFocus.label.toUpperCase()} — ${dayFocus.focus}`);

  // Aktivnost summary
  if (activity.newDocCount > 0) {
    parts.push(`📥 ${activity.newDocCount} novih dokumenata za obradu`);
  }
  if (activity.pendingApprovals > 0) {
    parts.push(`⏳ ${activity.pendingApprovals} čeka odobrenje agenta (SEMI-AUTO)`);
  }
  if (activity.activeAlarms > 0) {
    const alarmStr = activity.alarmDetails.map(a => a.customer).join(", ");
    parts.push(`🚨 ${activity.activeAlarms} aktivnih alarma: ${alarmStr}`);
  }
  if (activity.stalePipelines?.length > 0) {
    parts.push(`⚠️ Pipeline bez update-a 3+ dana: ${activity.stalePipelines.join(", ")}`);
  }
  if (activity.missedBriefs > 0) {
    parts.push(`📅 Propušteno brifinga: ${activity.missedBriefs} — sažmi kumulativno`);
  }

  // Check items za ovaj dan
  if (dayFocus.checkItems?.length) {
    parts.push(`\nFOKUS PROVJERE:\n${dayFocus.checkItems.map(c => `• ${c}`).join("\n")}`);
  }

  // Agent stats
  if (activity.lastAgentStats) {
    const s = activity.lastAgentStats;
    parts.push(`\nAGENT (zadnji run): obrađeno=${s.analyzed||0}, auto=${s.auto||0}, čeka=${s.semi||0}, duplikati=${s.duplicates||0}`);
  }

  return parts.join("\n");
}

// ── MAIN HANDLER ─────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if ((req.headers.authorization || "") !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    initAdmin();
    const db = getFirestore();

    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=nedjelja, 1=ponedeljak...
    const dayFocus = DAY_FOCUS[dayOfWeek] || DAY_FOCUS[1];
    const activity = await getActivityContext(db);
    const contextStr = buildBriefingContext(dayFocus, activity);

    return res.status(200).json({
      ok: true,
      dayFocus,
      activity,
      contextString: contextStr,
      greeting: dayFocus.greeting,
      todayDate: now.toLocaleDateString("sr-Latn", {
        weekday: "long", day: "numeric", month: "long", year: "numeric"
      }),
    });

  } catch (err) {
    console.error("[morning-context]", err.message);
    return res.status(500).json({ error: err.message });
  }
}
