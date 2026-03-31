// ═══════════════════════════════════════════════════════════════
// api/neural-engine.js — ANVIL™ Neural Engine
// Cron: 0 * * * * (svaki sat)
// CRON_SECRET zaštićen endpoint
//
// Delta principle: 5-fazni ciklus koji gradi Single Operating Picture
//   Phase 1 — INGEST:    konzumira neural_events od svih modula
//   Phase 2 — CORRELATE: cross-module detekcija obrazaca
//   Phase 3 — SYNTHESIZE: piše neural_state/current (SOP)
//   Phase 4 — SELF-LEARN: mjeri tačnost, podešava pragove pouzdanosti
//   Phase 5 — EMIT:       loguje statistiku u brain_insights
//
// Lego principle: svaka faza = autonomni blok s jasnim input/output
// ═══════════════════════════════════════════════════════════════

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function initDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID || "molty-portal",
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      }),
    });
  }
  return getFirestore();
}

// ── Health computation ───────────────────────────────────────────
function computeHealth({ pipeline, agent, customers, anomalyCount }) {
  if (
    (agent?.pendingApprovals || 0) > 10 ||
    (customers?.atRiskCount || 0) > 5 ||
    (agent?.autoRate || 1) < 0.3 ||
    anomalyCount > 5
  ) return "red";
  if (
    (pipeline?.stuckCount || 0) > 3 ||
    (agent?.avgConfidence || 100) < 70 ||
    anomalyCount > 2
  ) return "yellow";
  return "green";
}

// ── Phase 2a: Pipeline stats ─────────────────────────────────────
async function getPipelineStats(db) {
  const now = Date.now();
  const day = 86400000;

  const activeSnap = await db.collection("pipelines")
    .where("status", "not-in", ["won", "lost", "cancelled"])
    .get();
  const active = activeSnap.docs.map(d => d.data());
  const activeCount = active.length;
  const totalValue = active.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const avgDaysOpen = active.length > 0
    ? active.reduce((s, p) => {
        const created = p.createdAt ? new Date(p.createdAt).getTime() : now;
        return s + (now - created) / day;
      }, 0) / active.length
    : 0;
  const stuckCount = active.filter(p => {
    const created = p.createdAt ? new Date(p.createdAt).getTime() : now;
    return (now - created) / day > 30;
  }).length;

  // Conversion rate (last 90d)
  try {
    const resolvedSnap = await db.collection("pipelines")
      .where("status", "in", ["won", "lost"])
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();
    const resolved = resolvedSnap.docs.map(d => d.data().status);
    const wonCount = resolved.filter(s => s === "won").length;
    const conversionRate = resolved.length > 0 ? wonCount / resolved.length : 0;

    return {
      activeCount, totalValue, avgDaysOpen: Math.round(avgDaysOpen),
      stuckCount, wonLast30d: wonCount, conversionRate,
    };
  } catch {
    return { activeCount, totalValue, avgDaysOpen: Math.round(avgDaysOpen), stuckCount, wonLast30d: 0, conversionRate: 0 };
  }
}

// ── Phase 2b: Agent stats ────────────────────────────────────────
async function getAgentStats(db) {
  try {
    const snap = await db.collection("docworker")
      .where("updatedAt", ">=", new Date(Date.now() - 48 * 3600000))
      .orderBy("updatedAt", "desc")
      .limit(100)
      .get();
    const docs = snap.docs.map(d => d.data());
    const processed = docs.filter(d => d.agentMode);
    const auto = processed.filter(d => d.agentMode === "auto").length;
    const autoRate = processed.length > 0 ? auto / processed.length : 0;
    const pending = docs.filter(d => d.status === "needs_approval").length;
    const confidences = processed.filter(d => d.agentConfidence).map(d => d.agentConfidence);
    const avgConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

    const runSnap = await db.collection("brain_insights")
      .where("type", "==", "agent_run")
      .orderBy("runAt", "desc")
      .limit(1)
      .get();
    const lastRunAt = runSnap.empty ? null : runSnap.docs[0].data().runAt;

    return { autoRate, pendingApprovals: pending, avgConfidence: Math.round(avgConfidence), lastRunAt };
  } catch {
    return { autoRate: 0, pendingApprovals: 0, avgConfidence: 0, lastRunAt: null };
  }
}

// ── Phase 2c: Customer risk ──────────────────────────────────────
async function getCustomerRisk(db) {
  try {
    const riskSnap = await db.collection("brain_insights")
      .where("resolved", "==", false)
      .where("type", "in", ["no_recent_order", "revenue_drop"])
      .get();
    const riskCustomers = [...new Set(riskSnap.docs.map(d => d.data().customer).filter(Boolean))];
    const dormant = riskSnap.docs.filter(d => d.data().type === "no_recent_order").map(d => d.data().customer).filter(Boolean);

    const growthSnap = await db.collection("brain_insights")
      .where("resolved", "==", false)
      .where("type", "==", "revenue_growth")
      .limit(5)
      .get();
    const growthSignals = growthSnap.docs.map(d => d.data().customer).filter(Boolean);

    // Top customer by revenue (last 90d invoices)
    let topCustomer = null;
    try {
      const invSnap = await db.collection("revenuhub_invoices")
        .where("processedAt", ">=", new Date(Date.now() - 90 * 86400000))
        .orderBy("processedAt", "desc")
        .limit(200)
        .get();
      const revMap = {};
      invSnap.docs.forEach(d => {
        const data = d.data();
        const cust = data.customer || data.cust || "";
        if (cust) revMap[cust] = (revMap[cust] || 0) + parseFloat(data.totalAmount || data.amount || 0);
      });
      topCustomer = Object.entries(revMap).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    } catch {}

    return {
      atRiskCount: riskCustomers.length,
      dormantCount: dormant.length,
      topCustomer,
      growthSignals,
    };
  } catch {
    return { atRiskCount: 0, dormantCount: 0, topCustomer: null, growthSignals: [] };
  }
}

// ── Phase 2d: Build compound insights ───────────────────────────
function buildInsights(events, pipeline, agent, customers) {
  const insights = [];
  const now = new Date();

  // A: Stale pipeline critical
  if (pipeline.stuckCount > 2) {
    insights.push({
      type: "correlation",
      priority: pipeline.stuckCount > 5 ? "critical" : "high",
      message: `${pipeline.stuckCount} pipeline-ova otvoreno >30 dana — potreban follow-up`,
      ts: now,
    });
  }

  // B: Agent confidence drop
  if (agent.avgConfidence < 70 && agent.avgConfidence > 0) {
    insights.push({
      type: "prediction",
      priority: "high",
      message: `Prosječna pouzdanost agenta: ${agent.avgConfidence}% — provjeriti format dokumenata`,
      ts: now,
    });
  }

  // C: Cross-module: anomaly customer × active pipeline
  const anomalyEvts = events.filter(e => e.type === "anomaly_detected" && e.payload?.customer);
  const anomalyCustomers = [...new Set(anomalyEvts.map(e => e.payload.customer))];
  const pipelineEvts = events.filter(e =>
    e.payload?.customer &&
    (e.type === "pipeline_status_change" || e.type === "pipeline_created")
  );
  for (const cust of anomalyCustomers) {
    const hasPipeline = pipelineEvts.some(e =>
      (e.payload.customer || "").toLowerCase().includes(cust.toLowerCase())
    );
    if (hasPipeline) {
      insights.push({
        type: "correlation",
        priority: "critical",
        message: `${cust}: anomalija prihoda + aktivan pipeline — prioritetni kontakt`,
        customer: cust,
        ts: now,
      });
    }
  }

  // D: Install quality trend
  const wfEvts = events.filter(e => e.type === "workflow_completed" && e.payload?.score != null);
  if (wfEvts.length > 0) {
    const avgScore = wfEvts.reduce((s, e) => s + e.payload.score, 0) / wfEvts.length;
    if (avgScore < 70) {
      insights.push({
        type: "anomaly",
        priority: "high",
        message: `Prosječan skor instalacija: ${Math.round(avgScore)}% (ispod B-praga 70%) — provjeri materijale`,
        ts: now,
      });
    }
  }

  // E: Growth signals vs risk (upsell opportunity)
  if (customers.growthSignals?.length > 0 && customers.atRiskCount > 0) {
    insights.push({
      type: "prediction",
      priority: "medium",
      message: `${customers.growthSignals.length} kupaca u rastu, ${customers.atRiskCount} na riziku — optimizuj plan posjeta`,
      ts: now,
    });
  }

  // F: High pending approvals
  if (agent.pendingApprovals > 5) {
    insights.push({
      type: "anomaly",
      priority: "high",
      message: `${agent.pendingApprovals} dokumenata čeka odobrenje u Agent Inboxu — potrebna akcija`,
      ts: now,
    });
  }

  // Sort: critical first
  const pri = { critical: 0, high: 1, medium: 2, low: 3 };
  insights.sort((a, b) => (pri[a.priority] ?? 3) - (pri[b.priority] ?? 3));
  return insights.slice(0, 5);
}

// ── Phase 4: Self-learning ───────────────────────────────────────
// Measures accuracy of auto-processed decisions, adjusts confidence thresholds.
// Conservative adjustment: ±1-2 per run, floor 80, ceiling 98.
async function selfLearn(db) {
  const now = Date.now();
  const day = 86400000;

  // Default thresholds — same as CONFIDENCE_THRESHOLDS in agent-orchestrator
  const DEFAULT_THRESHOLDS = {
    "fileToDrive.auto": 90, "fileToDrive.semi": 75,
    "logRevenue.auto": 88,  "logRevenue.semi": 78,
    "enrichTDS.auto": 85,   "enrichTDS.semi": 70,
    "createQuote.auto": 0,  "sendFollowup.auto": 0,
  };

  const weightsRef = db.collection("neural_weights").doc("action_confidence");
  const weightsSnap = await weightsRef.get();
  const current = weightsSnap.exists ? weightsSnap.data() : {
    domain: "action_confidence",
    version: 0,
    thresholds: DEFAULT_THRESHOLDS,
    accuracy: { window30d: 1, window7d: 1, sampleCount: 0 },
    history: [],
  };

  // Measure accuracy: auto-processed docs with no subsequent agent_error
  let totalAuto = 0, errorCount = 0, recentTotal = 0, recentErrors = 0;
  try {
    const autoSnap = await db.collection("docworker")
      .where("agentMode", "==", "auto")
      .where("agentExecuted", "==", true)
      .where("updatedAt", ">=", new Date(now - 30 * day))
      .orderBy("updatedAt", "desc")
      .limit(300)
      .get();
    const autoDocs = autoSnap.docs.map(d => d.data());
    totalAuto = autoDocs.length;
    errorCount = autoDocs.filter(d => d.status === "agent_error" || d.agentError).length;

    // 7d window
    const recentSnap = await db.collection("docworker")
      .where("agentMode", "==", "auto")
      .where("agentExecuted", "==", true)
      .where("updatedAt", ">=", new Date(now - 7 * day))
      .orderBy("updatedAt", "desc")
      .limit(100)
      .get();
    const recent = recentSnap.docs.map(d => d.data());
    recentTotal = recent.length;
    recentErrors = recent.filter(d => d.status === "agent_error" || d.agentError).length;
  } catch { /* no data yet — default to 1.0 */ }

  const successRate = totalAuto > 0 ? (totalAuto - errorCount) / totalAuto : 1.0;
  const recentRate = recentTotal > 0 ? (recentTotal - recentErrors) / recentTotal : 1.0;

  // Adjust thresholds (only for overridable actions)
  const adjustable = ["fileToDrive", "logRevenue", "enrichTDS"];
  const newThresholds = { ...current.thresholds };
  const delta = {};
  for (const action of adjustable) {
    const key = `${action}.auto`;
    const old = current.thresholds[key] ?? DEFAULT_THRESHOLDS[key] ?? 88;
    let adj = 0;
    if (successRate > 0.95) adj = -1;  // loosen — high accuracy, can lower the bar slightly
    else if (successRate < 0.80) adj = +2;  // tighten — too many errors
    const newVal = Math.min(Math.max(old + adj, 80), 98);
    newThresholds[key] = newVal;
    if (newVal !== old) delta[key] = newVal - old;
  }

  const newVersion = (current.version || 0) + 1;
  const history = [
    ...(current.history || []).slice(-9),
    { ts: new Date(), accuracy: successRate, delta, sampleCount: totalAuto },
  ];

  await weightsRef.set({
    domain: "action_confidence",
    updatedAt: new Date(),
    version: newVersion,
    thresholds: newThresholds,
    accuracy: { window30d: successRate, window7d: recentRate, sampleCount: totalAuto },
    history,
  });

  return { successRate, recentRate, totalAuto, delta, thresholds: newThresholds };
}

// ── Main handler ─────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if ((req.headers.authorization || "") !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const db = initDb();
  const runStart = Date.now();

  try {
    // ═══════════════════════════════════════════════
    // PHASE 1 — INGEST
    // Consume unprocessed neural_events from all modules.
    // Mark processed to prevent re-ingestion.
    // ═══════════════════════════════════════════════
    const evSnap = await db.collection("neural_events")
      .where("processed", "==", false)
      .orderBy("ts", "asc")
      .limit(500)
      .get();

    const events = evSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Mark as processed (batch, max 500 = Firestore limit)
    if (events.length > 0) {
      const markBatch = db.batch();
      for (const ev of events) {
        markBatch.update(db.collection("neural_events").doc(ev.id), {
          processed: true,
          processedAt: new Date(),
        });
      }
      await markBatch.commit();
    }

    // ═══════════════════════════════════════════════
    // PHASE 2 — CORRELATE
    // Parallel sensor fusion across all data sources.
    // ═══════════════════════════════════════════════
    const [pipeline, agent, customers] = await Promise.all([
      getPipelineStats(db),
      getAgentStats(db),
      getCustomerRisk(db),
    ]);

    // Count active unresolved anomalies
    let anomalyCount = 0;
    try {
      const anomSnap = await db.collection("brain_insights")
        .where("resolved", "==", false)
        .where("type", "in", ["no_recent_order", "revenue_drop", "stale_pipeline"])
        .get();
      anomalyCount = anomSnap.size;
    } catch {}

    // ═══════════════════════════════════════════════
    // PHASE 3a — BUILD INSIGHTS (pre-learning)
    // ═══════════════════════════════════════════════
    const insights = buildInsights(events, pipeline, agent, customers);
    const health = computeHealth({ pipeline, agent, customers, anomalyCount });

    // Load current SOP version
    let currentVersion = 0;
    try {
      const snap = await db.collection("neural_state").doc("current").get();
      currentVersion = snap.exists ? (snap.data().engineVersion || 0) : 0;
    } catch {}

    // ═══════════════════════════════════════════════
    // PHASE 4 — SELF-LEARN
    // Compute accuracy, adjust confidence thresholds.
    // Runs independently — failure here doesn't stop SOP write.
    // ═══════════════════════════════════════════════
    let learning = { successRate: 1, recentRate: 1, totalAuto: 0, delta: {} };
    try {
      learning = await selfLearn(db);
    } catch (e) {
      console.warn("[neural-engine] Self-learn skipped:", e.message);
    }

    // ═══════════════════════════════════════════════
    // PHASE 3b — SYNTHESIZE: write neural_state/current (SOP)
    // This is the Single Operating Picture — single source of truth.
    // ═══════════════════════════════════════════════
    await db.collection("neural_state").doc("current").set({
      updatedAt: new Date(),
      engineVersion: currentVersion + 1,
      health,
      pipeline,
      customers,
      agent,
      insights,
      selfLearn: {
        totalPredictions: learning.totalAuto,
        confirmedCorrect: Math.round(learning.totalAuto * learning.successRate),
        accuracy: learning.successRate,
        lastLearnAt: new Date(),
      },
    });

    // Write compound insights to brain_insights (critical + high only, to avoid noise)
    const compoundInsights = insights.filter(i => ["critical", "high"].includes(i.priority));
    if (compoundInsights.length > 0) {
      const insightBatch = db.batch();
      for (const ins of compoundInsights) {
        insightBatch.set(db.collection("brain_insights").doc(), {
          ...ins,
          source: "neural_engine",
          resolved: false,
          detectedAt: new Date(),
          priority: ins.priority === "critical" ? 3 : 2,
        });
      }
      await insightBatch.commit();
    }

    // ═══════════════════════════════════════════════
    // PHASE 5 — EMIT run stats
    // ═══════════════════════════════════════════════
    const runMs = Date.now() - runStart;
    await db.collection("brain_insights").add({
      type: "neural_engine_run",
      engineVersion: currentVersion + 1,
      eventsIngested: events.length,
      insightsGenerated: insights.length,
      weightsAdjusted: Object.keys(learning.delta).length,
      accuracy: learning.successRate,
      health,
      runMs,
      runAt: new Date(),
    });

    console.log(
      `[neural-engine] v${currentVersion + 1} | ${health} | ` +
      `events:${events.length} | insights:${insights.length} | ` +
      `accuracy:${Math.round(learning.successRate * 100)}% | ${runMs}ms`
    );

    return res.status(200).json({
      ok: true,
      engineVersion: currentVersion + 1,
      health,
      eventsIngested: events.length,
      insightsGenerated: insights.length,
      accuracy: learning.successRate,
      thresholdsAdjusted: Object.keys(learning.delta),
      runMs,
    });

  } catch (e) {
    console.error("[neural-engine] Fatal:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
