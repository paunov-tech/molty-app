import { useState, useCallback } from "react";
import { MODULES } from "./core/registry.js";
import { C, fm } from "./core/theme.js";
import { Badge } from "./core/ui.jsx";
import { store, useCustomers, useMaterials } from "./core/store.js";

// ═══════════════════════════════════════════════════
// MOLTY v8.3 — THIN SHELL
// Ovaj fajl NE TREBA da se menja.
// Novi modul = novi fajl u modules/ + 1 linija u registry.js
// ═══════════════════════════════════════════════════

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [navPayload, setNavPayload] = useState(null); // za cross-module navigaciju
  const [quoteItems, setQuoteItems] = useState({ items: [], _customer: "" });
  const customers = useCustomers();
  const materials = useMaterials();

  // Cross-module navigation
  const navigate = useCallback((tabId, payload) => {
    setActiveTab(tabId);
    setNavPayload(payload || null);
  }, []);

  // Add material to quote
  const addToQuote = useCallback((mat) => {
    setQuoteItems(prev => {
      const name = mat.name || "";
      if (prev.items.find(x => x.name === name)) return prev;
      return { ...prev, items: [...prev.items, {
        id: mat.id, name, code: mat.code || mat.productCode || "",
        price: mat.price || 0, unit: mat.unit || "t", qty: 1,
        cat: mat.cat || mat.category || "", maxTemp: mat.maxTemp || mat.tMax || null,
      }] };
    });
  }, []);

  // Current module
  const activeMod = MODULES.find(m => m.id === activeTab);
  const Comp = activeMod?.component;

  // Build store object for badge functions
  const storeData = { customers, materials, pipeline: store.get("pipeline"), actions: store.get("actions") };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.tx, fontFamily: "'Segoe UI','SF Pro Display',system-ui,sans-serif" }}>
      {/* HEADER */}
      <header style={{ background: "linear-gradient(135deg,#0c0c0e,#1a1308)", borderBottom: `1px solid ${C.brd}`, padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(16px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: `linear-gradient(135deg,${C.or},${C.orD})`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 15, color: "#fff", boxShadow: `0 2px 12px ${C.or}44` }}>M</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: -.3 }}>MOLTY <span style={{ color: C.or }}>v8.3</span></div>
            <div style={{ fontSize: 8, color: C.txD, letterSpacing: 1.5, textTransform: "uppercase" }}>Calderys Serbia · Plugin Architecture</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Badge color={C.gr}>LIVE</Badge>
          <Badge color={C.pu}>NEURAL</Badge>
          <Badge color={C.cy}>DYNAMIC</Badge>
        </div>
      </header>

      {/* NAV — auto-generated from registry */}
      <nav style={{ display: "flex", gap: 3, padding: "6px 12px", overflowX: "auto", background: C.sf, borderBottom: `1px solid ${C.brd}`, WebkitOverflowScrolling: "touch" }}>
        {MODULES.map(m => {
          const badge = m.badge ? m.badge(storeData) : null;
          return (
            <button key={m.id} onClick={() => { setActiveTab(m.id); setNavPayload(null); }}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 6, border: activeTab === m.id ? `1px solid ${C.or}33` : "1px solid transparent", cursor: "pointer", fontSize: 11, fontWeight: activeTab === m.id ? 700 : 500, whiteSpace: "nowrap", background: activeTab === m.id ? C.or + "15" : "transparent", color: activeTab === m.id ? C.or : C.txM, transition: "all .15s", flexShrink: 0 }}>
              <span style={{ fontSize: 13 }}>{m.icon}</span>
              {m.label}{badge != null ? ` (${badge})` : ""}
            </button>
          );
        })}
      </nav>

      {/* CONTENT — renders active module */}
      <main style={{ padding: "14px 16px", maxWidth: 1200, margin: "0 auto" }}>
        {Comp && <Comp
          onNavigate={navigate}
          selectedItem={navPayload}
          quoteItems={quoteItems}
          setQuoteItems={setQuoteItems}
          onAddToQuote={addToQuote}
        />}
      </main>

      {/* FOOTER */}
      <footer style={{ textAlign: "center", padding: "16px 0", borderTop: `1px solid ${C.brd}`, margin: "16px 20px 0" }}>
        <span style={{ fontSize: 9, color: C.txD }}>
          MOLTY v8.3 · Excel Ponude + TDS Intelligence + Drive Sync · {fm(customers.reduce((s,c) => s + c.revenue, 0))} EUR · {customers.length} kupaca · {materials.length} mat · 🧠 Neural Net
        </span>
      </footer>
    </div>
  );
}
