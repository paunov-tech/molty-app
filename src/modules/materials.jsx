import { useState } from "react";
import { C, fe, fm } from "../core/theme.js";
import { Card, Input } from "../core/ui.jsx";
import { useMaterials } from "../core/store.js";

const norm = (m) => ({
  ...m,
  _name: m.name || "",
  _code: m.productCode || m.code || "",
  _cat: m.category || m.cat || "other",
  _maxTemp: m.maxTemp || m.tMax || null,
  _density: m.density || null,
  _application: m.application || "",
  _installMethod: m.installMethod || null,
  _chemistry: m.chemistry || m.chemicalComposition || {},
  _price: m.price || m.lastPrice || null,
  _priceDate: m.lastPriceDate || null,
  _unit: m.unit || "t",
  _totalEur: m.totalEur || 0,
  _sales: m.sales || 0,
  _source: m.source || "seed",
  _hasTds: !!(m.source === "tds-sync" || m.maxTemp || m.chemistry),
});

const catLabel = {
  castable: "Castable", gunning: "Gunning", ramming: "Ramming",
  trowelling: "Trowel", patching: "Patch", flow: "Flow",
  spray: "Spray", plaster: "Plast", mix: "Mix",
  brick: "Brick", other: "Ostalo",
};

function ChemBar({ chem }) {
  const entries = Object.entries(chem || {}).filter(([, v]) => v != null && v > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
      {entries.slice(0, 5).map(([k, v]) => (
        <span key={k} style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: C.cy + "18", color: C.cy }}>
          {k} {v}%
        </span>
      ))}
    </div>
  );
}

function MaterialCard({ m, expanded, onToggle, onAddToQuote }) {
  const n = norm(m);
  const hasTds = n._hasTds;

  return (
    <Card style={{ padding: "10px 14px", cursor: "pointer", borderColor: hasTds ? C.cy + "33" : C.brd }}
      onClick={onToggle}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n._name}</span>
            {hasTds && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: C.cy + "18", color: C.cy, fontWeight: 700 }}>TDS</span>}
            {n._price && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: C.or + "18", color: C.or, fontWeight: 700 }}>€</span>}
          </div>
          <div style={{ fontSize: 9, color: C.txD, marginTop: 2 }}>
            {n._code && <span>{n._code} · </span>}
            {catLabel[n._cat] || n._cat}
            {n._maxTemp && <span style={{ color: C.or }}> · {n._maxTemp}°C</span>}
            {n._sales > 0 && <span> · {n._sales}x prodato</span>}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {n._price ? (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.or }}>{fe(n._price)}/{n._unit}</div>
              {n._priceDate && <div style={{ fontSize: 8, color: C.txD }}>{n._priceDate}</div>}
              {n._totalEur > 0 && <div style={{ fontSize: 8, color: C.txD }}>Tot {fe(n._totalEur)}</div>}
            </div>
          ) : (
            n._density && <div style={{ fontSize: 10, color: C.txM }}>{n._density} kg/m³</div>
          )}
        </div>
        {onAddToQuote && (
          <button onClick={(e) => { e.stopPropagation(); onAddToQuote({
            id: m.id, name: n._name, code: n._code, price: n._price || 0,
            unit: n._unit, cat: n._cat, maxTemp: n._maxTemp
          }); }}
            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid " + C.or + "44",
              background: C.or + "0d", color: C.or, fontSize: 9, cursor: "pointer", fontWeight: 700, flexShrink: 0 }}>+Ponuda</button>
        )}
      </div>

      {expanded && hasTds && (
        <div style={{ marginTop: 8, padding: "8px 0", borderTop: "1px solid " + C.brd }}>
          {n._application && (
            <div style={{ fontSize: 10, color: C.txM, marginBottom: 4 }}>Primena: {n._application}</div>
          )}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 10, color: C.txM }}>
            {n._maxTemp && <span>Max: <strong style={{ color: C.or }}>{n._maxTemp}°C</strong></span>}
            {n._density && <span>Gustina: <strong>{n._density} kg/m³</strong></span>}
            {n._installMethod && <span>Ugradnja: <strong>{n._installMethod}</strong></span>}
            {n.porosity && <span>Poroznost: <strong>{n.porosity}%</strong></span>}
            {n.crushingStrength && <span>CCS: <strong>{n.crushingStrength} MPa</strong></span>}
            {n.grainSize && <span>Zrno: <strong>{n.grainSize}</strong></span>}
            {n.waterAddition && <span>Voda: <strong>{n.waterAddition}</strong></span>}
            {n.packaging && <span>Pakovanje: <strong>{n.packaging}</strong></span>}
            {n.shelfLife && <span>Rok: <strong>{n.shelfLife}</strong></span>}
          </div>
          <ChemBar chem={n._chemistry} />
          {n.driveFileName && (
            <div style={{ fontSize: 8, color: C.txD, marginTop: 4 }}>{n.driveFileName}</div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function Materials({ onAddToQuote }) {
  const materials = useMaterials();
  const [q, setQ] = useState("");
  const [catF, setCatF] = useState("");
  const [sourceF, setSourceF] = useState("");
  const [expanded, setExpanded] = useState(null);

  const normed = materials.map(norm);
  const cats = [...new Set(normed.map(m => m._cat))].sort();
  const tdsCount = normed.filter(m => m._hasTds).length;
  const seedCount = normed.filter(m => !m._hasTds).length;
  const pricedCount = normed.filter(m => m._price).length;

  const filt = normed.filter(m => {
    if (catF && m._cat !== catF) return false;
    if (sourceF === "tds" && !m._hasTds) return false;
    if (sourceF === "seed" && m._hasTds) return false;
    if (sourceF === "priced" && !m._price) return false;
    if (q && !m._name.toLowerCase().includes(q.toLowerCase()) && !m._code.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  filt.sort((a, b) => {
    if (a._price && !b._price) return -1;
    if (!a._price && b._price) return 1;
    if (a._hasTds !== b._hasTds) return a._hasTds ? -1 : 1;
    return a._name.localeCompare(b._name);
  });

  return <>
    {/* Source filter */}
    <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
      {[["", "Sve (" + normed.length + ")"], ["tds", "TDS (" + tdsCount + ")"], ["priced", "Sa cenom (" + pricedCount + ")"], ["seed", "Komercijalni (" + seedCount + ")"]].map(([v, label]) => (
        <button key={v} onClick={() => setSourceF(v)} style={{ padding: "4px 10px", borderRadius: 5,
          border: "1px solid " + (sourceF === v ? C.cy : C.brd),
          background: sourceF === v ? C.cy + "18" : "transparent",
          color: sourceF === v ? C.cy : C.txM, fontSize: 10, cursor: "pointer" }}>{label}</button>
      ))}
    </div>

    {/* Category filter */}
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
      {["", ...cats].map(ct => (
        <button key={ct} onClick={() => setCatF(ct)} style={{ padding: "4px 10px", borderRadius: 5,
          border: "1px solid " + (catF === ct ? C.or : C.brd),
          background: catF === ct ? C.or + "18" : "transparent",
          color: catF === ct ? C.or : C.txM, fontSize: 10, cursor: "pointer" }}>{catLabel[ct] || ct || "Sve"}</button>
      ))}
    </div>

    <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Pretrazi po nazivu ili sifri..." style={{ width: "100%", marginBottom: 10 }} />

    <div style={{ fontSize: 10, color: C.txD, marginBottom: 8 }}>
      {filt.length} materijala
    </div>

    <div style={{ display: "grid", gap: 6 }}>
      {filt.map(m => (
        <MaterialCard key={m.id} m={m}
          expanded={expanded === m.id}
          onToggle={() => setExpanded(expanded === m.id ? null : m.id)}
          onAddToQuote={onAddToQuote} />
      ))}
    </div>
  </>;
}
