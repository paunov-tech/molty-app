// ═══════════════════════════════════════════════════
// MOLTY MODULE: Drive Sync v2 — Auto Pipeline
// Skenira COMMERCIAL folder → Parsira PDF fakture → Ažurira kupce
// ═══════════════════════════════════════════════════
import { useState, useEffect, useCallback, useRef } from "react";
import { C, fm, fe } from "../core/theme.js";
import { Card, Stat, Badge, SectionTitle } from "../core/ui.jsx";
import { store, useCustomers } from "../core/store.js";

// ── API ──
const api = async (mode, params = {}) => {
  const qs = new URLSearchParams({ mode, ...params }).toString();
  const r = await fetch(`/api/drive-sync?${qs}`);
  return r.json();
};
const parseDoc = async (docId, docType = "commercial") => {
  const r = await fetch(`/api/parse-doc?docId=${docId}&docType=${docType}`);
  if (!r.ok) {
    try {
      const err = await r.json();
      return { success: false, message: err.error || `HTTP ${r.status}` };
    } catch {
      return { success: false, message: `HTTP ${r.status}` };
    }
  }
  return r.json();
};

// ── Helpers ──
const timeAgo = (d) => {
  if (!d) return "";
  const m = Math.floor((Date.now() - new Date(d)) / 60000);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};
const daysBetween = (d1, d2) => Math.floor(Math.abs(new Date(d1) - new Date(d2)) / 86400000);
const mimeIcon = (m) => {
  if (!m) return "📄";
  if (m.includes("spreadsheet")) return "📊";
  if (m.includes("document") || m.includes("word")) return "📝";
  if (m === "application/pdf") return "📕";
  if (m.includes("image")) return "🖼️";
  return "📄";
};
const isParseable = (m) => m === "application/pdf" || m === "application/vnd.google-apps.document" || m === "application/vnd.google-apps.spreadsheet";

// ── KOMERCIJALNI: Invoice, Offer, Proforma, Rechnung, Angebot, Faktura, Racun
// API filtrira po ključnim rečima + godini ili datumu modifikacije
const isTargetDoc = (name, modifiedTime) => {
  if (!name) return false;
  const n = name.toLowerCase();
  if (/\bmsds\b/.test(n) || /\bsds\b/.test(n)) return false;
  const isComm = n.includes("invoice") || n.includes("offer") || n.includes("quotation") ||
    n.includes("proforma") || n.includes("pro-forma") || n.includes("pro forma") ||
    n.includes("rechnung") || n.includes("angebot") || n.includes("faktura") || n.includes("racun");
  if (!isComm) return false;
  // Check year in filename
  const years = name.match(/\b(20\d{2})\b/g);
  if (years && years.some(y => parseInt(y) >= 2021 && parseInt(y) <= 2026)) return "commercial";
  // Or check modifiedTime is 2021+
  if (modifiedTime && modifiedTime >= "2021-01-01") return "commercial";
  return false;
};

// ── Customer matching (strict) ──
function matchCustomer(folderName, customers) {
  if (!folderName || folderName.length < 3) return null;
  const fn = folderName.toLowerCase().trim();
  
  // 1. Exact match on name or aka
  for (const c of customers) {
    const name = c.name?.toLowerCase() || "";
    const aka = c.aka?.toLowerCase() || "";
    if (fn === name || fn === aka) return c;
  }
  
  // 2. One contains the other (but both must be >5 chars to avoid false matches)
  if (fn.length > 5) {
    for (const c of customers) {
      const name = c.name?.toLowerCase() || "";
      const aka = c.aka?.toLowerCase() || "";
      if (name.length > 5 && (fn.includes(name) || name.includes(fn))) return c;
      if (aka.length > 5 && (fn.includes(aka) || aka.includes(fn))) return c;
    }
  }
  
  // 3. Significant keyword match (words >5 chars, excluding common words)
  const skipWords = new Set(["group", "steel", "iron", "metal", "company", "serbia", "livnica", "invoice", "fakture", "ulazne", "doo", "dooel"]);
  const fnWords = fn.split(/[\s_\-]+/).filter(w => w.length > 5 && !skipWords.has(w));
  if (fnWords.length > 0) {
    for (const c of customers) {
      const cWords = `${c.name || ""} ${c.aka || ""}`.toLowerCase();
      for (const kw of fnWords) {
        if (cWords.includes(kw)) return c;
      }
    }
  }
  
  return null;
}

// ═══ PIPELINE ═══
async function stepScan() {
  const res = await api("recent");
  if (!res.success) throw new Error(res.error || "Scan failed");
  return res;
}

function stepFilter(files) {
  return files.filter(f => {
    if (!isParseable(f.mimeType)) return false;
    // API already filtered by keyword+year, just double-check
    if (f._docType === "commercial") return true;
    // Fallback client filter
    return !!isTargetDoc(f.name, f.modifiedTime);
  }).map(f => ({ ...f, _docType: f._docType || "commercial" }));
}

async function stepParse(docs, onProgress, docType = "commercial") {
  const results = [];
  let delay = 1200;
  for (let i = 0; i < docs.length; i++) {
    onProgress(i + 1, docs.length, docs[i].name);
    
    let retries = 0;
    const MAX_RETRIES = 3;
    while (retries <= MAX_RETRIES) {
      try {
        const res = await parseDoc(docs[i].id, docType);
        if (res.success && res.parsed) {
          results.push({ file: docs[i], parsed: res.parsed });
          delay = Math.max(1200, delay * 0.9);
          break;
        } else if (res.error && res.error.includes("429")) {
          retries++;
          if (retries > MAX_RETRIES) {
            results.push({ file: docs[i], error: res.error });
            break;
          }
          const wait = Math.min(90000, 15000 * Math.pow(2, retries - 1));
          onProgress(i + 1, docs.length, `⏳ Rate limit — čekam ${Math.round(wait/1000)}s... (${docs[i].name})`);
          await new Promise(r => setTimeout(r, wait));
          delay = Math.min(3000, delay * 1.5);
        } else {
          results.push({ file: docs[i], error: res.message || res.error || "No data" });
          break;
        }
      } catch (e) {
        results.push({ file: docs[i], error: e.message });
        break;
      }
    }
    
    if (i < docs.length - 1) await new Promise(r => setTimeout(r, delay));
  }
  return results;
}

// ═══ TDS PIPELINE ═══
async function stepScanTds() {
  const res = await api("tds");
  if (!res.success) throw new Error(res.error || "TDS scan failed");
  return res;
}

function stepApplyTds(parsedResults) {
  const changes = [];
  const seenMats = new Set();
  console.log(`[TDS APPLY] Starting with ${parsedResults.length} results`);

  for (const { file, parsed } of parsedResults) {
    if (!parsed) continue;
    const matName = parsed.materialName || parsed.material_name || parsed.name;
    if (!matName) { console.log(`[TDS SKIP] ${file.name} — no materialName`); continue; }
    if (seenMats.has(matName.toLowerCase())) { console.log(`[TDS SKIP] ${matName} — duplicate`); continue; }
    seenMats.add(matName.toLowerCase());

    try {
      const tdsData = {
        name: matName,
        productCode: parsed.productCode || null,
        brand: parsed.brand || "Calderys",
        category: parsed.category || "other",
        application: parsed.application || "",
        installMethod: parsed.installMethod || null,
        maxTemp: parsed.maxServiceTemp || null,
        density: parsed.density || null,
        crushingStrength: parsed.crushingStrength || null,
        porosity: parsed.porosity || null,
        thermalConductivity: parsed.thermalConductivity || null,
        chemistry: parsed.chemicalComposition || {},
        grainSize: parsed.grainSize || null,
        waterAddition: parsed.waterAddition || null,
        shelfLife: parsed.shelfLife || null,
        packaging: parsed.packaging || null,
        driveFileId: file.id,
        driveFileName: file.name,
        driveFolder: file.folder || "",
        source: "tds-sync",
        syncDate: new Date().toISOString().slice(0, 10),
      };

      const materials = store.get("materials");
      const existing = materials.find(m => {
        const n1 = (m.name || "").toLowerCase().replace(/[®™\s]+/g, " ").trim();
        const n2 = matName.toLowerCase().replace(/[®™\s]+/g, " ").trim();
        return n1 === n2;
      });

      if (existing) {
        store.update("materials", existing.id, tdsData);
        changes.push({ type: "tds_update", material: matName, category: tdsData.category, maxTemp: tdsData.maxTemp, source: file.name });
        console.log(`[TDS APPLY] ↻ ${matName} (updated)`);
      } else {
        store.add("materials", tdsData);
        changes.push({ type: "tds_new", material: matName, category: tdsData.category, maxTemp: tdsData.maxTemp, source: file.name });
        console.log(`[TDS APPLY] + ${matName} (new)`);
      }
    } catch (e) {
      console.error(`[TDS ERROR] ${matName}: ${e.message}`);
    }
  }

  console.log(`[TDS APPLY] Done: ${changes.length} materials processed`);
  store.log("tds_sync", { materials: changes.length, timestamp: new Date().toISOString().slice(0, 10) });
  return changes;
}

function stepApply(parsedResults, customers) {
  const changes = [];
  const today = new Date().toISOString().slice(0, 10);
  const seenDocs = new Set(); // dedup by document number
  console.log(`[MOLTY APPLY] Processing ${parsedResults.length} results, ${customers.length} existing customers`);

  for (const { file, parsed } of parsedResults) {
    if (!parsed) continue;

    // Dedup: skip if same document number already processed
    if (parsed.documentNumber) {
      const dedupKey = `${parsed.documentNumber}_${parsed.type}`;
      if (seenDocs.has(dedupKey)) continue;
      seenDocs.add(dedupKey);
    }

    // ── TDS → add/update material in store ──
    if (parsed.type === "tds" && parsed.materialName) {
      const existingMats = store.get("materials");
      const existing = existingMats.find(m => m.name.toLowerCase() === parsed.materialName.toLowerCase());
      
      const matData = {
        name: parsed.materialName,
        brand: parsed.brand || "Calderys",
        category: parsed.category || "other",
        application: parsed.application || "",
        maxTemp: parsed.maxTemp || 0,
        density: parsed.density || 0,
        crushingStrength: parsed.crushingStrength || "",
        thermalConductivity: parsed.thermalConductivity || "",
        composition: parsed.chemicalComposition || {},
        grainSize: parsed.grainSize || "",
        installMethod: parsed.installMethod || "",
        source: file.name,
      };

      if (existing) {
        store.update("materials", existing.id, matData);
        changes.push({ type: "material_update", material: parsed.materialName, source: file.customerFolder });
      } else {
        store.add("materials", matData);
        changes.push({ type: "new_material", material: parsed.materialName, source: file.customerFolder });
      }
      continue;
    }

    // ── Rechnung / Angebot → update or CREATE customer ──
    let customer = matchCustomer(file.customerFolder, customers) || matchCustomer(parsed.customer?.name, customers);
    console.log(`[APPLY] ${file.name} → type=${parsed.type}, folder="${file.customerFolder}", parsedName="${parsed.customer?.name}", matched=${customer?.name || 'NONE'}`);

    if (!customer && (parsed.type === "invoice" || parsed.type === "offer")) {
      // AUTO-CREATE new customer from parsed data
      const custName = parsed.customer?.name || file.customerFolder;
      if (custName && custName.length > 2 && !custName.match(/^[a-f0-9]{8}$/)) {
        const year = parsed.date ? parsed.date.slice(0, 4) : today.slice(0, 4);
        const newCust = {
          name: custName,
          aka: file.customerFolder !== custName ? file.customerFolder : "",
          country: parsed.customer?.country || "",
          city: parsed.customer?.city || "",
          status: "active",
          revenue: parsed.totalAmount && (parsed.currency === "EUR" || !parsed.currency) ? parsed.totalAmount : 0,
          invoices: parsed.type === "invoice" ? 1 : 0,
          processedInvoices: parsed.documentNumber ? [parsed.documentNumber] : [],
          lastOrder: parsed.date || today,
          daysIdle: parsed.date ? daysBetween(parsed.date, today) : 0,
          topMaterials: (parsed.items || []).map(it => it.material).filter(Boolean),
          period: `${year}-${year}`,
          source: "drive-sync",
        };
        customer = store.add("customers", newCust);
        customers.push(customer); // add to local array for future matching
        changes.push({
          type: "new_customer", customer: custName, aka: newCust.aka,
          source: file.name, docNumber: parsed.documentNumber,
          total: parsed.totalAmount, currency: parsed.currency,
        });
        continue; // already processed
      }
    }

    if (customer && (parsed.type === "invoice" || parsed.type === "offer")) {
      const updates = {};
      let changed = false;

      // Track processed invoices to prevent double-counting
      const knownInvoices = customer.processedInvoices || [];
      const docNum = parsed.documentNumber;
      const alreadyCounted = docNum && knownInvoices.includes(docNum);

      if (parsed.date && (!customer.lastOrder || parsed.date > customer.lastOrder)) {
        updates.lastOrder = parsed.date;
        updates.daysIdle = daysBetween(parsed.date, today);
        updates.status = "active";
        changed = true;
      }
      if (!alreadyCounted && parsed.totalAmount && (parsed.currency === "EUR" || !parsed.currency)) {
        updates.revenue = (customer.revenue || 0) + parsed.totalAmount;
        updates.invoices = (customer.invoices || 0) + 1;
        if (docNum) updates.processedInvoices = [...knownInvoices, docNum];
        changed = true;
      }
      if (parsed.items?.length > 0) {
        const newMats = parsed.items.map(it => it.material).filter(Boolean);
        const existing = customer.topMaterials || [];
        const merged = [...new Set([...existing, ...newMats])];
        if (merged.length > existing.length) { updates.topMaterials = merged; changed = true; }
      }
      if (parsed.date && customer.period) {
        const year = parsed.date.slice(0, 4);
        const [startY, endY] = customer.period.split("-");
        const ns = year < startY ? year : startY;
        const ne = year > endY ? year : endY;
        if (ns !== startY || ne !== endY) { updates.period = `${ns}-${ne}`; changed = true; }
      }

      if (changed) {
        store.update("customers", customer.id, updates);
        changes.push({
          type: "customer_update", customer: customer.name, aka: customer.aka,
          updates, source: file.name, docNumber: parsed.documentNumber,
          total: parsed.totalAmount, currency: parsed.currency,
        });
      }

      // ── Extract material prices from invoice items ──
      if (parsed.items?.length > 0 && (parsed.currency === "EUR" || !parsed.currency)) {
        const allMats = store.get("materials");
        for (const item of parsed.items) {
          if (!item.material || !item.unitPrice || item.unitPrice <= 0) continue;
          const itemName = item.material.toLowerCase().trim();
          const mat = allMats.find(m => {
            const n = (m.name || "").toLowerCase().trim();
            return n === itemName || n.includes(itemName) || itemName.includes(n);
          });
          if (mat) {
            // Only update if this invoice is newer than last price
            const invoiceDate = parsed.date || today;
            if (!mat.lastPriceDate || invoiceDate >= mat.lastPriceDate) {
              store.update("materials", mat.id, {
                price: item.unitPrice,
                lastPrice: item.unitPrice,
                lastPriceDate: invoiceDate,
                priceUnit: item.unit || "t",
                priceCurrency: "EUR",
              });
            }
          }
        }
      }
    }
  }

  store.log("drive_sync", { parsed: parsedResults.length, changes: changes.length, timestamp: today });
  return changes;
}

// ═══ FEED ITEM ═══
function FeedItem({ item }) {
  const s = { display: "flex", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.brd}` };
  if (item.type === "new_customer") return (
    <div style={s}>
      <span style={{ fontSize: 18 }}>🆕</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.gr }}>
          + {item.customer} <span style={{ color: C.txD, fontWeight: 400 }}>{item.aka ? `(${item.aka})` : ""}</span>
        </div>
        <div style={{ fontSize: 10, color: C.txM, marginTop: 2 }}>
          {item.docNumber && <span>📋 {item.docNumber} · </span>}
          {item.total != null && <span style={{ color: C.or, fontWeight: 700 }}>€{fm(item.total)} · </span>}
          Novi kupac dodat iz Drive
        </div>
        <div style={{ fontSize: 9, color: C.txD, marginTop: 2 }}>iz: {item.source}</div>
      </div>
    </div>
  );
  if (item.type === "customer_update") return (
    <div style={s}>
      <span style={{ fontSize: 18 }}>🏭</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>
          {item.customer} <span style={{ color: C.txD, fontWeight: 400 }}>({item.aka})</span>
        </div>
        <div style={{ fontSize: 10, color: C.txM, marginTop: 2 }}>
          {item.docNumber && <span>📋 {item.docNumber} · </span>}
          {item.total != null && <span style={{ color: C.or, fontWeight: 700 }}>€{fm(item.total)} · </span>}
          {item.updates.lastOrder && <span>📅 {item.updates.lastOrder}</span>}
        </div>
        <div style={{ fontSize: 9, color: C.txD, marginTop: 2 }}>iz: {item.source}</div>
      </div>
    </div>
  );
  if (item.type === "new_material") return (
    <div style={s}>
      <span style={{ fontSize: 14 }}>🧱</span>
      <div>
        <div style={{ fontSize: 11, color: C.cy }}>+ {item.material}</div>
        <div style={{ fontSize: 9, color: C.txD }}>{item.source}</div>
      </div>
    </div>
  );
  if (item.type === "material_update") return (
    <div style={s}>
      <span style={{ fontSize: 14 }}>🔄</span>
      <div>
        <div style={{ fontSize: 11, color: C.bl }}>↻ {item.material}</div>
        <div style={{ fontSize: 9, color: C.txD }}>TDS ažuriran · {item.source}</div>
      </div>
    </div>
  );
  if (item.type === "tds_new") return (
    <div style={s}>
      <span style={{ fontSize: 18 }}>📋</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.cy }}>
          + {item.material}
        </div>
        <div style={{ fontSize: 10, color: C.txM, marginTop: 2 }}>
          {item.category && <span style={{ color: C.pu }}>🏷 {item.category} · </span>}
          {item.maxTemp && <span style={{ color: C.or }}>🌡 {item.maxTemp}°C · </span>}
          Novi TDS
        </div>
        <div style={{ fontSize: 9, color: C.txD, marginTop: 2 }}>iz: {item.source}</div>
      </div>
    </div>
  );
  if (item.type === "tds_update") return (
    <div style={s}>
      <span style={{ fontSize: 18 }}>🔬</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.bl }}>
          ↻ {item.material}
        </div>
        <div style={{ fontSize: 10, color: C.txM, marginTop: 2 }}>
          {item.category && <span style={{ color: C.pu }}>🏷 {item.category} · </span>}
          {item.maxTemp && <span style={{ color: C.or }}>🌡 {item.maxTemp}°C · </span>}
          TDS ažuriran
        </div>
        <div style={{ fontSize: 9, color: C.txD, marginTop: 2 }}>iz: {item.source}</div>
      </div>
    </div>
  );
  if (item.type === "new_file") return (
    <div style={s}>
      <span style={{ fontSize: 14 }}>{mimeIcon(item.mimeType)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
        <div style={{ fontSize: 9, color: C.txD }}>
          📁 {item.folder}{item.subfolder ? ` / ${item.subfolder}` : ""} · {timeAgo(item.modified)}
          {isParseable(item.mimeType) && (item._docType || isTargetDoc(item.name)) && <span style={{ color: C.or, marginLeft: 6 }}>💰 parseable</span>}
        </div>
      </div>
      {item.link && <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 9, color: C.bl, textDecoration: "none" }}>↗</a>}
    </div>
  );
  if (item.type === "parse_error") return (
    <div style={s}>
      <span style={{ fontSize: 14 }}>⚠️</span>
      <div>
        <div style={{ fontSize: 11, color: C.rd }}>{item.name}</div>
        <div style={{ fontSize: 9, color: C.txD }}>{item.error}</div>
      </div>
    </div>
  );
  return null;
}

// ═══ MAIN ═══
export default function Sync() {
  const customers = useCustomers();
  const [status, setStatus] = useState("checking");
  const [health, setHealth] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [progress, setProgress] = useState("");
  const [feed, setFeed] = useState([]);
  const [stats, setStats] = useState(null);
  const [lastSync, setLastSync] = useState(() => {
    try { return localStorage.getItem("molty_last_sync") || null; } catch { return null; }
  });
  const abortRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api("health");
        setHealth(res);
        setStatus(res.success && res.connected ? "connected" : "error");
      } catch { setStatus("disconnected"); }
    })();
  }, []);

  const runSync = useCallback(async (mode = "full") => {
    abortRef.current = false;
    const newFeed = [];

    try {
      // ── TDS MODE ──
      if (mode === "tds" || mode === "tds-scan") {
        setPhase("scanning");
        setProgress("📡 Skeniram TDS fajlove (CALDE materijali)...");
        const scanRes = await stepScanTds();

        for (const f of scanRes.files || []) {
          newFeed.push({
            type: "new_file", name: f.name, folder: f.folder,
            mimeType: f.mimeType, modified: f.modifiedTime,
          });
        }

        if (abortRef.current) { setPhase("idle"); return; }
        
        const parseableFiles = (scanRes.files || []).filter(f => isParseable(f.mimeType));
        
        if (mode === "tds-scan") {
          setFeed(newFeed);
          setStats({ totalFiles: scanRes.count, folders: (scanRes.folders || []).length, docsFound: parseableFiles.length, parsed: 0, errors: 0, customerUpdates: 0, newMaterials: 0, tdsMaterials: 0 });
          setPhase("done");
          return;
        }

        // Cap TDS parsing at 100
        const MAX_TDS = 100;
        let toParse = parseableFiles;
        let cappedMsg = "";
        if (parseableFiles.length > MAX_TDS) {
          toParse = parseableFiles.slice(0, MAX_TDS);
          cappedMsg = ` ⚠️ Ograničeno na ${MAX_TDS}`;
        }

        setProgress(`📋 ${toParse.length} CALDE TDS fajlova${cappedMsg}`);
        await new Promise(r => setTimeout(r, 1500));

        setPhase("parsing");
        const parsed = await stepParse(toParse, (cur, tot, name) => {
          setProgress(`🔬 TDS ${cur}/${tot}: ${name}`);
        }, "tds");
        if (abortRef.current) { setPhase("idle"); return; }

        for (const r of parsed) {
          if (r.error) newFeed.unshift({ type: "parse_error", name: r.file.name, error: r.error });
        }

        setPhase("applying");
        setProgress("💾 Ažuriram materijale...");
        const successParsed = parsed.filter(r => r.parsed);
        console.log(`[TDS] Parsed: ${parsed.length}, Success: ${successParsed.length}, Errors: ${parsed.filter(r=>r.error).length}`);
        if (successParsed.length > 0) console.log(`[TDS] Sample:`, JSON.stringify(successParsed[0].parsed).slice(0, 200));
        const changes = stepApplyTds(successParsed);

        setFeed([...changes, ...newFeed]);
        setStats({
          totalFiles: scanRes.count, folders: (scanRes.folders || []).length,
          docsFound: toParse.length,
          parsed: parsed.filter(r => r.parsed).length,
          errors: parsed.filter(r => r.error).length,
          customerUpdates: 0,
          newMaterials: 0,
          tdsMaterials: changes.length,
        });

        const now = new Date().toISOString();
        setLastSync(now);
        try { localStorage.setItem("molty_last_sync", now); } catch {}
        setPhase("done");
        setProgress("");
        return;
      }

      // ── COMMERCIAL MODE (existing) ──
      setPhase("scanning");
      setProgress("📡 Skeniram COMMERCIAL folder (2021-2026)...");
      const scanRes = await stepScan();

      for (const f of scanRes.files || []) {
        newFeed.push({
          type: "new_file", name: f.name, folder: f.customerFolder,
          subfolder: f.subfolder, mimeType: f.mimeType,
          modified: f.modifiedTime, link: f.webViewLink,
        });
      }

      if (abortRef.current) { setPhase("idle"); return; }
      if (mode === "scan") {
        setFeed(newFeed);
        setStats({ totalFiles: scanRes.count, folders: scanRes.customerFolders, docsFound: 0, parsed: 0, errors: 0, customerUpdates: 0, newMaterials: 0 });
        setPhase("done");
        const now = new Date().toISOString();
        setLastSync(now);
        try { localStorage.setItem("molty_last_sync", now); } catch {}
        return;
      }

      // Filter parseable
      setPhase("filtering");
      setProgress("🔍 Filtriram: Invoice, Offer, Proforma, Rechnung, Angebot (2021+)...");
      const docs = stepFilter(scanRes.files || []);

      if (docs.length === 0) {
        setFeed(newFeed);
        setStats({ totalFiles: scanRes.count, folders: scanRes.customerFolders, docsFound: 0, parsed: 0, errors: 0, customerUpdates: 0, newMaterials: 0 });
        setProgress(`Nema Invoice/Offer/Rechnung/Angebot/Proforma (2021+). (${scanRes.count} fajlova)`);
        setPhase("done");
        return;
      }

      const commCount = docs.length;
      
      // Cap at 200 per sync to control costs
      const MAX_PARSE = 200;
      let toParse = docs;
      let cappedMsg = "";
      if (docs.length > MAX_PARSE) {
        toParse = docs.slice(0, MAX_PARSE);
        cappedMsg = ` ⚠️ Ograničeno na ${MAX_PARSE} (ukupno ${docs.length})`;
      }
      
      setProgress(`📋 ${commCount} komercijalnih dokumenata (2021+) od ${scanRes.count} na Drive-u${cappedMsg}`);
      await new Promise(r => setTimeout(r, 1500)); // Let user see the count

      // Parse
      setPhase("parsing");
      const parsed = await stepParse(toParse, (cur, tot, name) => {
        setProgress(`🧠 Parsiram ${cur}/${tot}: ${name}`);
      });
      if (abortRef.current) { setPhase("idle"); return; }

      // Add parse errors to feed
      for (const r of parsed) {
        if (r.error) newFeed.unshift({ type: "parse_error", name: r.file.name, error: r.error });
      }

      // Apply
      setPhase("applying");
      setProgress("💾 Ažuriram kupce i materijale...");
      const changes = stepApply(parsed.filter(r => r.parsed), customers);

      setFeed([...changes, ...newFeed]);
      setStats({
        totalFiles: scanRes.count, folders: scanRes.customerFolders,
        docsFound: toParse.length,
        parsed: parsed.filter(r => r.parsed).length,
        errors: parsed.filter(r => r.error).length,
        customerUpdates: changes.filter(c => c.type === "customer_update" || c.type === "new_customer").length,
        newMaterials: changes.filter(c => c.type === "new_material" || c.type === "material_update").length,
      });

      const now = new Date().toISOString();
      setLastSync(now);
      try { localStorage.setItem("molty_last_sync", now); } catch {}
      setPhase("done");
      setProgress("");

    } catch (e) {
      setProgress(`❌ ${e.message}`);
      setPhase("idle");
    }
  }, [customers]);

  const abort = () => { abortRef.current = true; setPhase("idle"); setProgress("Prekinuto."); };
  const isRunning = phase !== "idle" && phase !== "done";

  // ── DISCONNECTED ──
  if (status === "disconnected" || status === "error") {
    return (
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <Card style={{ borderColor: C.rd + "44" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.rd }} />
            <span style={{ fontSize: 12, color: C.rd, fontWeight: 600 }}>Nije povezan</span>
          </div>
          <div style={{ fontSize: 11, color: C.txM, padding: "8px 12px", background: C.sf, borderRadius: 6 }}>
            {health?.error || "API nije dostupan"}
          </div>
          <div style={{ fontSize: 11, color: C.txM, marginTop: 12, lineHeight: 1.8 }}>
            Env vars: <code style={{ color: C.cy }}>GOOGLE_SERVICE_ACCOUNT_KEY</code>, <code style={{ color: C.cy }}>COMMERCIAL_FOLDER_ID</code>, <code style={{ color: C.cy }}>ANTHROPIC_API_KEY</code>
          </div>
        </Card>
      </div>
    );
  }

  if (status === "checking") {
    return <div style={{ textAlign: "center", padding: 40, color: C.txD }}>📡 Provera konekcije...</div>;
  }

  // ── CONNECTED ──
  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.gr, boxShadow: `0 0 6px ${C.gr}` }} />
        <span style={{ fontSize: 11, color: C.gr, fontWeight: 600 }}>Povezan</span>
        <span style={{ fontSize: 10, color: C.txD }}>📂 {health?.folder || "Commercial"}</span>
        {lastSync && <span style={{ fontSize: 10, color: C.txD, marginLeft: "auto" }}>Sync: {timeAgo(lastSync)}</span>}
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <Stat label="Folderi" value={stats.folders} icon="📁" color={C.bl} />
          <Stat label="Fajlova" value={stats.totalFiles} icon="📄" color={C.bl} />
          <Stat label="Parsirano" value={stats.parsed} sub={stats.errors > 0 ? `${stats.errors} err` : ""} icon="🧠" color={C.pu} />
          <Stat label="Kupci" value={stats.customerUpdates} icon="🏭" color={C.gr} />
          <Stat label="Materijali" value={stats.newMaterials} icon="🧱" color={C.cy} />
          {stats.tdsMaterials > 0 && <Stat label="TDS" value={stats.tdsMaterials} icon="🔬" color={C.cy} />}
        </div>
      )}

      {/* Controls */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: C.txD }}>Komercijalni 2021-2026</span>
          <div style={{ flex: 1 }} />
          {isRunning
            ? <button onClick={abort} style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.rd}55`,
                background: C.rd + "15", color: C.rd, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>⏹ Prekini</button>
            : <>
                <button onClick={() => runSync("full")} style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.or}55`,
                  background: C.or + "15", color: C.or, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>⚡ AUTO SYNC</button>
                <button onClick={() => runSync("scan")} style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.bl}55`,
                  background: C.bl + "15", color: C.bl, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>👁 Skeniraj</button>
              </>
          }
        </div>
      </Card>
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: C.txD }}>📋 TDS — Tehnički listovi (CALDE)</span>
          <div style={{ flex: 1 }} />
          {!isRunning && <>
            <button onClick={() => runSync("tds")} style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.cy}55`,
              background: C.cy + "15", color: C.cy, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>🔬 TDS SYNC</button>
            <button onClick={() => runSync("tds-scan")} style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.pu}55`,
              background: C.pu + "15", color: C.pu, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>👁 TDS Skeniraj</button>
          </>}
        </div>
      </Card>

      {/* Progress */}
      {isRunning && (
        <Card style={{ marginBottom: 14, borderColor: C.or + "44" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 20, height: 20, border: `2px solid ${C.or}`, borderTopColor: "transparent",
              borderRadius: "50%", animation: "spin 1s linear infinite" }} />
            <div>
              <div style={{ fontSize: 11, color: C.or, fontWeight: 600 }}>
                {phase === "scanning" && "📡 Skeniram..."}
                {phase === "filtering" && "🔍 Filtriram..."}
                {phase === "parsing" && "🧠 Claude parsira..."}
                {phase === "applying" && "💾 Ažuriram..."}
              </div>
              <div style={{ fontSize: 10, color: C.txM, marginTop: 2 }}>{progress}</div>
            </div>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); }}`}</style>
        </Card>
      )}

      {/* Feed */}
      {feed.length > 0 && (
        <div>
          {feed.some(f => f.type === "customer_update" || f.type === "new_customer" || f.type === "new_material" || f.type === "material_update" || f.type === "tds_new" || f.type === "tds_update") && (
            <Card style={{ marginBottom: 10, borderColor: C.gr + "33" }}>
              <SectionTitle>✅ Promene ({feed.filter(f => f.type === "customer_update" || f.type === "new_customer" || f.type === "new_material" || f.type === "material_update" || f.type === "tds_new" || f.type === "tds_update").length})</SectionTitle>
              {feed.filter(f => f.type === "customer_update" || f.type === "new_customer" || f.type === "new_material" || f.type === "material_update" || f.type === "tds_new" || f.type === "tds_update").map((item, i) => <FeedItem key={`c${i}`} item={item} />)}
            </Card>
          )}
          {feed.some(f => f.type === "parse_error") && (
            <Card style={{ marginBottom: 10, borderColor: C.rd + "33" }}>
              <SectionTitle>⚠️ Greške parsiranja</SectionTitle>
              {feed.filter(f => f.type === "parse_error").map((item, i) => <FeedItem key={`e${i}`} item={item} />)}
            </Card>
          )}
          <Card>
            <SectionTitle>📄 Dokumenti ({feed.filter(f => f.type === "new_file").length})</SectionTitle>
            {(() => {
              const byFolder = {};
              for (const f of feed.filter(f => f.type === "new_file")) {
                const key = f.folder || "Ostalo";
                if (!byFolder[key]) byFolder[key] = [];
                byFolder[key].push(f);
              }
              return Object.entries(byFolder).sort((a, b) => b[1].length - a[1].length).map(([folder, files]) => (
                <div key={folder} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.brd}` }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.bl }}>📁 {folder}</span>
                    <Badge color={C.bl} sm>{files.length}</Badge>
                  </div>
                  {files.map((f, i) => <FeedItem key={`f${i}`} item={f} />)}
                </div>
              ));
            })()}
          </Card>
        </div>
      )}

      {phase === "idle" && feed.length === 0 && (
        <Card style={{ textAlign: "center", padding: 30 }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>⚡</div>
          <div style={{ fontSize: 13, color: C.tx, fontWeight: 600, marginBottom: 4 }}>Auto Sync Pipeline</div>
          <div style={{ fontSize: 11, color: C.txM, lineHeight: 1.6 }}>
            📡 Skenira Drive → 🧠 Parsira Invoice/Offer/Rechnung/Angebot (2021+) → 🏭 Ažurira kupce<br/>
            🔬 TDS Sync: Skenira CALDE tehničke listove → 📋 Izvlači specifikacije → 🧱 Povezuje materijale<br/>
            <span style={{ color: C.or, fontWeight: 700 }}>⚡ AUTO SYNC</span> za fakture · <span style={{ color: C.cy, fontWeight: 700 }}>🔬 TDS SYNC</span> za tehničke listove
          </div>
        </Card>
      )}

      {phase === "done" && feed.length === 0 && (
        <Card style={{ textAlign: "center", padding: 20 }}>
          <div style={{ fontSize: 11, color: C.txM }}>✅ Nema novih dokumenata u COMMERCIAL folderu (2021-2026).</div>
        </Card>
      )}
    </div>
  );
}
