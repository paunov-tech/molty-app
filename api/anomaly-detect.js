// api/anomaly-detect.js — ANVIL™ AI Anomaly Detection
// Dnevni CRON koji analizira kupce i flaguje anomalije:
//   - Kupac bez narudžbe >90 dana
//   - Prihod pao >40% vs prethodnih 90 dana
//   - Prihod porastao >50% (upsell šansa)
//   - Kupac u pipeline ali nema fakturu >60 dana
//
// Cron: 0 7 * * * (svaki dan u 07:00)
// CRON_SECRET zaštićen endpoint

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

// Grupiši fakture po kupcu, izračunaj period metrike
function groupByCustomer(invoices, fromMs, toMs) {
  const map = {};
  for (const inv of invoices) {
    const ts = inv.date ? new Date(inv.date).getTime() : (inv.processedAt?.toMillis?.() || 0);
    if (ts < fromMs || ts > toMs) continue;
    const cust = inv.customer || inv.cust || "Unknown";
    if (!map[cust]) map[cust] = { total: 0, count: 0, lastDate: 0 };
    map[cust].total += parseFloat(inv.totalAmount || inv.amount || inv.tot || 0);
    map[cust].count++;
    if (ts > map[cust].lastDate) map[cust].lastDate = ts;
  }
  return map;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if ((req.headers.authorization || "") !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const db = initDb();
  const now = Date.now();
  const day = 86400000;
  const p1Start = now - 90 * day; // current 90d window
  const p2Start = now - 180 * day; // previous 90d window
  const p1End = now;
  const p2End = now - 90 * day;

  try {
    // ── 1. Load invoices (revenuhub_invoices) ──
    const invSnap = await db.collection("revenuhub_invoices")
      .where("processedAt", ">=", new Date(p2Start))
      .get();
    const invoices = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const curr = groupByCustomer(invoices, p1Start, p1End);
    const prev = groupByCustomer(invoices, p2Start, p2End);

    // ── 2. Load all known customers ──
    const custSnap = await db.collection("revenuhub_invoices")
      .orderBy("processedAt", "desc").limit(500).get();
    const allCustomers = [...new Set(
      custSnap.docs.map(d => d.data().customer || d.data().cust).filter(Boolean)
    )];

    // ── 3. Detect anomalies ──
    const anomalies = [];

    for (const cust of allCustomers) {
      const c = curr[cust];
      const p = prev[cust];

      // a) No order in last 90 days (but had orders before)
      if (!c && p && p.count > 0) {
        const daysSinceLastOrder = Math.round((now - p.lastDate) / day);
        if (daysSinceLastOrder > 90) {
          anomalies.push({
            type: "no_recent_order",
            severity: daysSinceLastOrder > 120 ? "critical" : "warning",
            customer: cust,
            message: `Nema narudžbe ${daysSinceLastOrder} dana (prethodni period: €${Math.round(p.total)}, ${p.count} fakt.)`,
            value: daysSinceLastOrder,
            prevRevenue: Math.round(p.total),
            detectedAt: new Date(),
            resolved: false,
          });
        }
        continue;
      }

      if (!c || !p) continue;

      // b) Revenue drop >40%
      if (p.total > 500 && c.total < p.total * 0.6) {
        const dropPct = Math.round((1 - c.total / p.total) * 100);
        anomalies.push({
          type: "revenue_drop",
          severity: dropPct > 60 ? "critical" : "warning",
          customer: cust,
          message: `Prihod pao ${dropPct}% — €${Math.round(c.total)} vs €${Math.round(p.total)} prethodno`,
          value: dropPct,
          currRevenue: Math.round(c.total),
          prevRevenue: Math.round(p.total),
          detectedAt: new Date(),
          resolved: false,
        });
      }

      // c) Revenue increase >50% (upsell opportunity)
      if (p.total > 200 && c.total > p.total * 1.5) {
        const growthPct = Math.round((c.total / p.total - 1) * 100);
        anomalies.push({
          type: "revenue_growth",
          severity: "info",
          customer: cust,
          message: `Rast prihoda ${growthPct}% — €${Math.round(c.total)} vs €${Math.round(p.total)} prethodno (upsell šansa)`,
          value: growthPct,
          currRevenue: Math.round(c.total),
          prevRevenue: Math.round(p.total),
          detectedAt: new Date(),
          resolved: false,
        });
      }
    }

    // ── 4. Check open pipeline items with no invoice >60 days ──
    const pipeSnap = await db.collection("pipelines")
      .where("status", "not-in", ["invoiced", "won", "lost", "cancelled"])
      .get();

    for (const doc of pipeSnap.docs) {
      const p = doc.data();
      const createdAt = p.createdAt ? new Date(p.createdAt).getTime() : 0;
      const daysOpen = Math.round((now - createdAt) / day);
      if (daysOpen > 60) {
        anomalies.push({
          type: "stale_pipeline",
          severity: daysOpen > 90 ? "critical" : "warning",
          customer: p.customer,
          message: `Pipeline otvoren ${daysOpen} dana bez fakture (status: ${p.status})`,
          value: daysOpen,
          pipelineId: doc.id,
          detectedAt: new Date(),
          resolved: false,
        });
      }
    }

    // ── 5. Deduplicate — single-field query on detectedAt, filter type in JS ──
    const anomalyTypes = new Set(["no_recent_order", "revenue_drop", "revenue_growth", "stale_pipeline"]);
    const recentSnap = await db.collection("brain_insights")
      .where("detectedAt", ">=", new Date(now - 7 * day))
      .limit(500)
      .get();
    const recentKeys = new Set(
      recentSnap.docs
        .map(d => d.data())
        .filter(d => anomalyTypes.has(d.type))
        .map(d => `${d.type}::${d.customer}`)
    );

    const newAnomalies = anomalies.filter(a => !recentKeys.has(`${a.type}::${a.customer}`));

    // ── 6. Write to brain_insights ──
    const batch = db.batch();
    for (const a of newAnomalies) {
      const ref = db.collection("brain_insights").doc();
      batch.set(ref, { ...a, source: "anomaly-detect", priority: a.severity === "critical" ? 3 : a.severity === "warning" ? 2 : 1 });
    }
    if (newAnomalies.length > 0) await batch.commit();

    console.log(`[anomaly-detect] ${newAnomalies.length} new anomalies (${anomalies.length} total detected)`);
    return res.status(200).json({
      ok: true,
      total: anomalies.length,
      new: newAnomalies.length,
      breakdown: {
        no_recent_order: newAnomalies.filter(a => a.type === "no_recent_order").length,
        revenue_drop:    newAnomalies.filter(a => a.type === "revenue_drop").length,
        revenue_growth:  newAnomalies.filter(a => a.type === "revenue_growth").length,
        stale_pipeline:  newAnomalies.filter(a => a.type === "stale_pipeline").length,
      },
    });

  } catch (e) {
    console.error("[anomaly-detect]", e.message);
    return res.status(500).json({ error: e.message });
  }
}
