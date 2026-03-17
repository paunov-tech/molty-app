// ═══════════════════════════════════════════════════
// MOLTY v8.3 — LIVE JOB MAP
// Modul: src/modules/jobmap.jsx
// Leaflet mapa aktivnih instalacija sa fazama i GPS
// Auto-refresh: 30min | Klik → popup supervisor+faza+progress
// ═══════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from "react";
import { C } from "../core/theme.js";
import { Card, SectionTitle, Badge } from "../core/ui.jsx";
import { useStore, store } from "../core/store.js";

// ── FAZE ──
const PHASES = [
  { id: "hse_prep",     label: "HSE Priprema", short: "HSE",   color: "#3b82f6", icon: "🦺", order: 0 },
  { id: "demolition",   label: "Rušenje",      short: "RUŠ",   color: "#ef4444", icon: "🔨", order: 1 },
  { id: "installation", label: "Instalacija",  short: "INS",   color: "#f59e0b", icon: "🧱", order: 2 },
  { id: "dryout",       label: "Sušenje",      short: "SUŠ",   color: "#f97316", icon: "🔥", order: 3 },
  { id: "verification", label: "Verifikacija", short: "VER",   color: "#22c55e", icon: "✅", order: 4 },
];

const PHASE_MAP = Object.fromEntries(PHASES.map(p => [p.id, p]));

const STATUS_COLOR = { active: C.gr, paused: "#f59e0b", completed: "#6b7280" };
const STATUS_LABEL = { active: "AKTIVAN", paused: "PAUZA", completed: "ZAVRŠEN" };

function phaseProgress(jobs) {
  const total = PHASES.length;
  const done = PHASES.filter(p => {
    const idx = PHASES.findIndex(x => x.id === jobs.phase);
    return p.order < idx || (p.order === idx && jobs.progress >= 100);
  }).length;
  return Math.round((done / total) * 100);
}

// ── LEAFLET CSS INJECT ──
function useLeafletCSS() {
  useEffect(() => {
    if (document.getElementById("leaflet-css")) return;
    const link = document.createElement("link");
    link.id = "leaflet-css";
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
  }, []);
}

// ── REFRESH TIMER ──
const REFRESH_MS = 30 * 60 * 1000; // 30 min

export default function JobMap() {
  useLeafletCSS();
  const jobs = useStore("jobs");
  const [selJob, setSelJob] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [nextRefresh, setNextRefresh] = useState(REFRESH_MS);
  const [viewMode, setViewMode] = useState("map"); // "map" | "list"
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const markersRef = useRef([]);

  const activeJobs = jobs.filter(j => j.status !== "completed");

  // ── COUNTDOWN ──
  useEffect(() => {
    const iv = setInterval(() => {
      setNextRefresh(prev => {
        if (prev <= 1000) {
          setLastRefresh(Date.now());
          return REFRESH_MS;
        }
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const fmCountdown = (ms) => {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ── LEAFLET MAP INIT ──
  useEffect(() => {
    if (viewMode !== "map") return;
    if (!mapRef.current) return;
    if (leafletMapRef.current) return;

    import("leaflet").then(L => {
      // Fix default icon paths
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current, {
        zoomControl: true,
        attributionControl: false,
      }).setView([44.0, 20.5], 6);

      // Dark tile layer
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
      }).addTo(map);

      leafletMapRef.current = map;
      renderMarkers(L, map);
    });

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, [viewMode]);

  // ── UPDATE MARKERS on jobs change ──
  useEffect(() => {
    if (!leafletMapRef.current) return;
    import("leaflet").then(L => {
      // Clear old markers
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      renderMarkers(L, leafletMapRef.current);
    });
  }, [jobs, lastRefresh]);

  const renderMarkers = useCallback((L, map) => {
    activeJobs.forEach(job => {
      if (!job.lat || !job.lng) return;
      const phase = PHASE_MAP[job.phase] || PHASES[0];
      const overallPct = getOverallProgress(job);

      const icon = L.divIcon({
        className: "",
        html: `
          <div style="
            width:38px; height:38px;
            background:${phase.color};
            border-radius:50% 50% 50% 0;
            transform:rotate(-45deg);
            border:2px solid #fff;
            box-shadow:0 2px 12px ${phase.color}88;
            display:flex; align-items:center; justify-content:center;
          ">
            <span style="transform:rotate(45deg);font-size:16px;line-height:1">${phase.icon}</span>
          </div>
          <div style="
            position:absolute;top:-6px;right:-6px;
            width:18px;height:18px;border-radius:50%;
            background:${job.status==='active'?C.gr:'#f59e0b'};
            border:2px solid #000;
            font-size:8px;color:#000;font-weight:900;
            display:flex;align-items:center;justify-content:center;
          ">${overallPct}</div>
        `,
        iconSize: [38, 38],
        iconAnchor: [19, 38],
      });

      const marker = L.marker([job.lat, job.lng], { icon })
        .addTo(map)
        .on("click", () => setSelJob(job));

      markersRef.current.push(marker);
    });
  }, [activeJobs]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* ── HEADER BAR ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: -.3 }}>
            📍 LIVE JOB MAP
          </div>
          <div style={{
            padding: "2px 8px", borderRadius: 4,
            background: `${C.gr}22`, border: `1px solid ${C.gr}44`,
            fontSize: 9, color: C.gr, fontWeight: 700, letterSpacing: 1,
            display: "flex", alignItems: "center", gap: 4
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.gr, display: "inline-block", animation: "pulse 2s infinite" }} />
            LIVE · {activeJobs.length} aktivan{activeJobs.length !== 1 ? "a" : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div style={{ fontSize: 9, color: C.txD }}>
            Refresh za: <span style={{ color: C.or, fontWeight: 700 }}>{fmCountdown(nextRefresh)}</span>
          </div>
          {["map", "list"].map(m => (
            <button key={m} onClick={() => setViewMode(m)} style={{
              padding: "5px 12px", borderRadius: 5, cursor: "pointer", fontSize: 10, fontWeight: 700,
              background: viewMode === m ? C.or : "transparent",
              color: viewMode === m ? "#000" : C.txM,
              border: `1px solid ${viewMode === m ? C.or : C.brd}`,
            }}>
              {m === "map" ? "🗺 Mapa" : "📋 Lista"}
            </button>
          ))}
        </div>
      </div>

      {/* ── STATS ROW ── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {PHASES.map(p => {
          const count = jobs.filter(j => j.phase === p.id).length;
          return (
            <div key={p.id} style={{
              padding: "6px 12px", borderRadius: 6,
              background: `${p.color}15`, border: `1px solid ${p.color}33`,
              display: "flex", alignItems: "center", gap: 6
            }}>
              <span style={{ fontSize: 13 }}>{p.icon}</span>
              <div>
                <div style={{ fontSize: 9, color: p.color, fontWeight: 700, letterSpacing: .5 }}>{p.short}</div>
                <div style={{ fontSize: 14, fontWeight: 900, color: p.color, lineHeight: 1 }}>{count}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── MAP VIEW ── */}
      {viewMode === "map" && (
        <div style={{ display: "flex", gap: 10 }}>
          {/* Map container */}
          <div style={{
            flex: 1, height: 480, borderRadius: 10,
            border: `1px solid ${C.brd}`, overflow: "hidden",
            position: "relative"
          }}>
            <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
          </div>

          {/* Job detail panel */}
          {selJob && (
            <div style={{ width: 280, flexShrink: 0 }}>
              <JobDetailPanel job={selJob} onClose={() => setSelJob(null)} />
            </div>
          )}
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {viewMode === "list" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
          {jobs.map(job => (
            <JobCard key={job.id} job={job} onSelect={setSelJob} selected={selJob?.id === job.id} />
          ))}
        </div>
      )}

      {/* List-mode detail panel */}
      {viewMode === "list" && selJob && (
        <JobDetailPanel job={selJob} onClose={() => setSelJob(null)} />
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .leaflet-container { background: #0c0c0e !important; }
      `}</style>
    </div>
  );
}

// ── JOB CARD (list view) ──
function JobCard({ job, onSelect, selected }) {
  const phase = PHASE_MAP[job.phase] || PHASES[0];
  const ovPct = getOverallProgress(job);
  return (
    <div onClick={() => onSelect(job)} style={{
      padding: 14, borderRadius: 8,
      background: selected ? `${phase.color}18` : C.card,
      border: `1px solid ${selected ? phase.color : C.brd}`,
      cursor: "pointer", transition: "all .15s"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 2 }}>{job.customer}</div>
          <div style={{ fontSize: 9, color: C.txD }}>{job.city} · {job.supervisor}</div>
        </div>
        <div style={{
          padding: "2px 7px", borderRadius: 4, fontSize: 8, fontWeight: 800, letterSpacing: .5,
          background: `${STATUS_COLOR[job.status]}22`,
          color: STATUS_COLOR[job.status],
          border: `1px solid ${STATUS_COLOR[job.status]}44`,
        }}>{STATUS_LABEL[job.status]}</div>
      </div>

      <PhaseStepper currentPhase={job.phase} progress={job.progress} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <div style={{ fontSize: 9, color: C.txD }}>
          👷 {job.workerName} · {fmAgo(job.workerLastSeen)}
        </div>
        <div style={{ fontSize: 12, fontWeight: 800, color: phase.color }}>{ovPct}%</div>
      </div>
    </div>
  );
}

// ── JOB DETAIL PANEL ──
function JobDetailPanel({ job, onClose }) {
  const phase = PHASE_MAP[job.phase] || PHASES[0];
  const ovPct = getOverallProgress(job);

  return (
    <Card style={{ border: `1px solid ${phase.color}55` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 900, color: C.tx, marginBottom: 2 }}>{job.customer}</div>
          <div style={{ fontSize: 10, color: C.txD }}>📍 {job.city} · {job.country}</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.txD, cursor: "pointer", fontSize: 16, padding: 0 }}>✕</button>
      </div>

      {/* Overall progress circle */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
        <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
          <svg width="64" height="64" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="32" cy="32" r="26" fill="none" stroke={C.sf} strokeWidth="6" />
            <circle cx="32" cy="32" r="26" fill="none" stroke={phase.color} strokeWidth="6"
              strokeDasharray={`${2 * Math.PI * 26}`}
              strokeDashoffset={`${2 * Math.PI * 26 * (1 - ovPct / 100)}`}
              strokeLinecap="round" style={{ transition: "stroke-dashoffset .5s" }}
            />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: phase.color }}>{ovPct}%</span>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: C.txD, marginBottom: 2 }}>TRENUTNA FAZA</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 18 }}>{phase.icon}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: phase.color }}>{phase.label}</span>
          </div>
          <div style={{
            height: 6, borderRadius: 3, background: C.sf, overflow: "hidden"
          }}>
            <div style={{ height: "100%", width: `${job.progress}%`, background: phase.color, borderRadius: 3, transition: "width .5s" }} />
          </div>
          <div style={{ fontSize: 9, color: C.txD, marginTop: 2 }}>{job.progress}% faze završeno</div>
        </div>
      </div>

      {/* Phase stepper */}
      <div style={{ marginBottom: 14 }}>
        <SectionTitle>Tok posla</SectionTitle>
        <PhaseStepper currentPhase={job.phase} progress={job.progress} />
      </div>

      {/* Info grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        {[
          ["👷 RADNIK", job.workerName],
          ["👤 SUPERVIZOR", job.supervisor],
          ["🧱 MATERIJAL", job.material],
          ["📅 PLAN ZAVRŠ.", job.plannedEnd],
          ["⏱ POSL. SIGNAL", fmAgo(job.workerLastSeen)],
          ["📍 GPS", job.lat ? `${job.lat.toFixed(4)}, ${job.lng.toFixed(4)}` : "N/A"],
        ].map(([l, v]) => (
          <div key={l} style={{ background: C.sf, padding: "7px 9px", borderRadius: 6 }}>
            <div style={{ fontSize: 8, color: C.txD, marginBottom: 1 }}>{l}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.tx }}>{v || "—"}</div>
          </div>
        ))}
      </div>

      {/* Status badge */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{
          padding: "4px 10px", borderRadius: 5, fontSize: 9, fontWeight: 800, letterSpacing: .8,
          background: `${STATUS_COLOR[job.status]}22`,
          color: STATUS_COLOR[job.status],
          border: `1px solid ${STATUS_COLOR[job.status]}44`,
        }}>{STATUS_LABEL[job.status]}</div>
        {job.notes && (
          <div style={{ fontSize: 9, color: C.txM, maxWidth: 160, textAlign: "right", lineHeight: 1.4 }}>
            {job.notes}
          </div>
        )}
      </div>
    </Card>
  );
}

// ── PHASE STEPPER ──
function PhaseStepper({ currentPhase, progress }) {
  const curIdx = PHASES.findIndex(p => p.id === currentPhase);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginTop: 6 }}>
      {PHASES.map((p, i) => {
        const done = i < curIdx;
        const active = i === curIdx;
        const pct = active ? progress : done ? 100 : 0;
        return (
          <div key={p.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            {/* connector line before */}
            <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
              {i > 0 && (
                <div style={{ flex: 1, height: 2, background: done || active ? p.color : C.brd }} />
              )}
              {i === 0 && <div style={{ flex: 1 }} />}
              {/* dot */}
              <div style={{
                width: active ? 22 : 16, height: active ? 22 : 16,
                borderRadius: "50%",
                background: done ? p.color : active ? `${p.color}33` : C.sf,
                border: `2px solid ${done || active ? p.color : C.brd}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: active ? 11 : 9, transition: "all .2s",
                flexShrink: 0,
              }}>
                {done ? "✓" : active ? p.icon : ""}
              </div>
              {i < PHASES.length - 1 && (
                <div style={{ flex: 1, height: 2, background: done ? p.color : C.brd }} />
              )}
              {i === PHASES.length - 1 && <div style={{ flex: 1 }} />}
            </div>
            <div style={{ fontSize: 7, color: active ? p.color : done ? C.txM : C.txD, fontWeight: active ? 800 : 500, textAlign: "center", lineHeight: 1.2 }}>
              {p.short}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── HELPERS ──
function getOverallProgress(job) {
  const curIdx = PHASES.findIndex(p => p.id === job.phase);
  if (curIdx < 0) return 0;
  const done = curIdx;
  const total = PHASES.length;
  return Math.round(((done + (job.progress / 100)) / total) * 100);
}

function fmAgo(isoStr) {
  if (!isoStr) return "N/A";
  const diff = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "upravo";
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
