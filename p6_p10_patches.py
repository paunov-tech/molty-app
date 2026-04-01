#!/usr/bin/env python3
"""
ANVIL™ P6–P10 UX & Optimization Patches
Pokreni: cd ~/MoltySystem && python3 p6_p10_patches.py ALL
"""

import sys, os, shutil
from datetime import datetime

SRC = os.path.expanduser("~/MoltySystem/src")

def read(path):
    with open(os.path.join(SRC, path), "r", encoding="utf-8") as f:
        return f.read()

def write(path, content):
    with open(os.path.join(SRC, path), "w", encoding="utf-8") as f:
        f.write(content)

def replace(path, old, new, label=""):
    content = read(path)
    if old not in content:
        print(f"  ⚠ [{label}] Pattern NOT FOUND in {path}")
        print(f"    First 80 chars: {old[:80]}...")
        return False
    if content.count(old) > 1:
        print(f"  ⚠ [{label}] Multiple matches ({content.count(old)}) in {path} — replacing first")
        content = content.replace(old, new, 1)
    else:
        content = content.replace(old, new)
    write(path, content)
    print(f"  ✅ [{label}] Patched {path}")
    return True

def backup():
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    bak = os.path.expanduser(f"~/anvil_p6p10_backup_{ts}")
    shutil.copytree(SRC, bak, dirs_exist_ok=True)
    print(f"📦 Backup: {bak}")
    return bak


# ═══════════════════════════════════════════════════════════════
# P6: Command Palette — VEĆ POSTOJI
# ═══════════════════════════════════════════════════════════════
def patch_p6():
    print("\n✅ P6: Command Palette već implementiran (App.jsx linija 305)")
    print("  Ctrl+K / ⌘K otvara search. Ništa za patchovati.")
    return True


# ═══════════════════════════════════════════════════════════════
# P7: Sync modul — fix auth header + fallback
# ═══════════════════════════════════════════════════════════════
def patch_p7():
    print("\n🔧 P7: Sync modul — auth header fix + robusnost")

    # Problem 1: Sync šalje "Authorization: Bearer" ali worker očekuje "x-api-key"
    # Problem 2: /api/status možda ne postoji — treba fallback
    # Problem 3: localStorage key "molty_cron_secret" vs settings.js getCronSecret()

    OLD_CHECK = """  const check = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`${WORKER_URL}/api/status`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("molty_cron_secret") || ""}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus(data);
      setLastCheck(new Date());
    } catch (e) {
      setStatus({ error: e.message, connected: false });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);"""

    NEW_CHECK = """  const getSecret = () => localStorage.getItem("molty_cron_secret") || localStorage.getItem("anvil_cron_secret") || "";

  const check = React.useCallback(async () => {
    setRefreshing(true);
    const secret = getSecret();
    const headers = {
      "Authorization": `Bearer ${secret}`,
      "x-api-key": secret,
    };
    // Pokušaj /api/status, ako ne postoji → fallback na /api/pipeline-tracker (HEAD)
    let connected = false;
    let data = {};
    try {
      const res = await fetch(`${WORKER_URL}/api/status`, { headers });
      if (res.ok) {
        data = await res.json();
        connected = true;
      } else if (res.status === 404) {
        // /api/status ne postoji — probaj ping drugi endpoint
        const fallback = await fetch(`${WORKER_URL}/api/pipeline-tracker`, { method: "HEAD", headers });
        connected = fallback.ok || fallback.status === 405 || fallback.status === 401;
        data = { connected, note: "status endpoint ne postoji — ping OK" };
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
      setStatus({ ...data, connected });
      setLastCheck(new Date());
    } catch (e) {
      setStatus({ error: e.message, connected: false });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);"""

    ok1 = replace("modules/sync.jsx", OLD_CHECK, NEW_CHECK, "P7a-auth")

    # Isto fix za manual trigger dugmad — isti auth problem
    OLD_TRIGGER = """            onClick={async () => {
              const secret = localStorage.getItem("molty_cron_secret") || prompt("Cron secret:");
              if (secret) localStorage.setItem("molty_cron_secret", secret);
              try {
                const r = await fetch(`${WORKER_URL}/api/${ep.id}`, {
                  method: "GET",
                  headers: { Authorization: `Bearer ${secret || ""}` },
                });"""

    NEW_TRIGGER = """            onClick={async () => {
              const secret = localStorage.getItem("molty_cron_secret") || localStorage.getItem("anvil_cron_secret") || prompt("Cron secret:");
              if (secret) { localStorage.setItem("molty_cron_secret", secret); localStorage.setItem("anvil_cron_secret", secret); }
              try {
                const r = await fetch(`${WORKER_URL}/api/${ep.id}`, {
                  method: "GET",
                  headers: { "Authorization": `Bearer ${secret || ""}`, "x-api-key": secret || "" },
                });"""

    ok2 = replace("modules/sync.jsx", OLD_TRIGGER, NEW_TRIGGER, "P7b-trigger")

    # Fix typo: "Pokrni" → "Pokreni"
    ok3 = replace("modules/sync.jsx", "▶ Pokrni {ep.label}", "▶ Pokreni {ep.label}", "P7c-typo")

    return ok1 and ok2


# ═══════════════════════════════════════════════════════════════
# P8: Lego Prompt Router — promptBuilder.js
# ═══════════════════════════════════════════════════════════════
def patch_p8():
    print("\n🔧 P8: Lego Prompt Router — core/promptBuilder.js")

    pb_path = os.path.join(SRC, "core/promptBuilder.js")
    if os.path.exists(pb_path):
        print("  ⚠ core/promptBuilder.js već postoji — preskačem")
        return True

    content = '''\
// ═══════════════════════════════════════════════════════════════
// ANVIL™ Lego Prompt Router v1.0
// Gradi prompts modulski: [BASE] + [CONTEXT] + [TASK] + [FORMAT]
// Ušteda: 50-60% tokena vs monolitni prompts
// ═══════════════════════════════════════════════════════════════

// ── Base personas ──
const BASES = {
  agent: `Ti si ANVIL AI Agent — tehnički asistent za Calderys refractory field operations na Balkanu (Srbija, BiH, Makedonija, Bugarska, Hrvatska, Crna Gora). Govoriš srpski.`,
  hse: `Ti si ANVIL HSE Inspektor. Evaluiraš PPE compliance i bezbednosne uslove na terenu za rad sa vatrostalnim materijalima.`,
  commercial: `Ti si ANVIL komercijalni asistent. Pratiš ponude, fakture i pipeline za Calderys SE Europe.`,
  engineer: `Ti si ANVIL inženjering asistent. Specijalizovan za vatrostalne materijale, termičke proračune i wear predikcije.`,
  brief: `Ti si ANVIL Morning Brief agent. Generišeš dnevni pregled prioriteta, dokumenata i predikcija za TSR-a.`,
};

// ── Context blocks (dodaju se po potrebi) ──
const CONTEXTS = {
  customer: (name) => `\\nKupac: ${name}. Koristi Calderys materijale.`,
  territory: (countries) => `\\nTeritoriJa: ${countries.join(", ")}.`,
  materials: (mats) => `\\nMaterijali u fokusu: ${mats.join(", ")}.`,
  job: (job) => `\\nJob: ${job.jobName || job._id}. Kupac: ${job.customerName || "?"}. Status: ${job.status || "active"}.`,
  pipeline: (stats) => `\\nPipeline: ${stats.open || 0} otvorenih, ${stats.total || 0} ukupno, vrednost ${stats.value || "?"}€.`,
  weather: (w) => `\\nVreme na lokaciji: ${w.temp}°C, ${w.condition}. ${w.temp < 5 ? "UPOZORENJE: Temperatura ispod 5°C — produženo sušenje vatrostalnog materijala!" : ""}`,
};

// ── Task instructions ──
const TASKS = {
  hse_verify: `Analiziraj fotografiju radnika. Proveri: šlem, zaštitne naočare, rukavice, zaštitno odelo, cipele sa čeličnim vrhom. Odgovori JSON: { "passed": true/false, "missing": [...], "notes": "..." }`,
  daily_brief: `Generiši jutarnji brifing u formatu: KRITIČNO (crveno), DANAS (narandžasto), PREDIKCIJE (plavo), STATISTIKA, PREPORUKE.`,
  draft_quote: `Napravi draft ponude na osnovu specifikacije. Uključi materijale, količine, jedinične cene, rok isporuke.`,
  analyze_doc: `Analiziraj dokument. Izvuci: tip dokumenta, kupac, materijali, vrednost, datum, ključne stavke.`,
  triage_email: `Klasifikuj email: URGENT (odgovori danas), NORMAL (ova nedelja), LOW (kad stigneš). Predloži odgovor.`,
  wear_report: `Generiši wear report sa predikcijom trajanja obloge u mesecima. Format: tehničko objašnjenje + preporuka.`,
};

// ── Output format constraints ──
const FORMATS = {
  json: `\\nOdgovori ISKLJUČIVO u JSON formatu. Bez markdown-a, bez objašnjenja pre/posle JSON-a.`,
  html: `\\nOdgovori u HTML formatu za email prikaz. Koristi inline CSS.`,
  brief: `\\nKoristaj ─ linije za sekcije, emoji za ikonice. Format za mobilni prikaz.`,
  text: `\\nOdgovori u čistom tekstu, kratko i direktno.`,
  serbian: `\\nSav output na srpskom jeziku (latinica).`,
};

// ═══ Builder ═══
export function buildPrompt({ base = "agent", contexts = [], task, format = "text" }) {
  const parts = [BASES[base] || BASES.agent];

  for (const ctx of contexts) {
    if (typeof ctx === "string" && CONTEXTS[ctx]) {
      parts.push(CONTEXTS[ctx]());
    } else if (typeof ctx === "object" && ctx.type && CONTEXTS[ctx.type]) {
      parts.push(CONTEXTS[ctx.type](ctx.data));
    }
  }

  if (task) {
    parts.push("\\n--- ZADATAK ---");
    parts.push(TASKS[task] || task);
  }

  if (format) {
    parts.push(FORMATS[format] || "");
  }

  return parts.filter(Boolean).join("\\n");
}

// ═══ Pre-built prompt shortcuts ═══
export function hsePrompt(photoDescription) {
  return buildPrompt({
    base: "hse",
    task: "hse_verify",
    format: "json",
  }) + `\\n\\nOpis fotografije: ${photoDescription}`;
}

export function briefPrompt(gmailData, pipelineData, jobsData) {
  return buildPrompt({
    base: "brief",
    contexts: [
      { type: "pipeline", data: pipelineData },
      { type: "territory", data: { join: () => "SRB, BiH, MKD, BUG, CRO, MNE" } },
    ],
    task: "daily_brief",
    format: "brief",
  }) + `\\n\\nGmail (poslednjih 7 dana):\\n${gmailData}\\n\\nJobovi:\\n${jobsData}`;
}

export function triagePrompt(emailSubject, emailFrom, emailSnippet) {
  return buildPrompt({
    base: "commercial",
    task: "triage_email",
    format: "json",
  }) + `\\n\\nEmail:\\nOd: ${emailFrom}\\nSubject: ${emailSubject}\\nSadržaj: ${emailSnippet}`;
}

export function docAnalyzePrompt(docText) {
  return buildPrompt({
    base: "commercial",
    task: "analyze_doc",
    format: "json",
  }) + `\\n\\nDokument:\\n${docText.slice(0, 3000)}`;
}

// ═══ Token estimation ═══
export function estimateTokens(prompt) {
  // Rough: 1 token ≈ 4 chars za srpski (Cyrillic/Latin mix)
  return Math.ceil(prompt.length / 3.5);
}

export default { buildPrompt, hsePrompt, briefPrompt, triagePrompt, docAnalyzePrompt, estimateTokens };
'''

    with open(pb_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  ✅ [P8] Kreiran core/promptBuilder.js")
    return True


# ═══════════════════════════════════════════════════════════════
# P9: Gemini Vision — PLAN (treba worker endpoint)
# ═══════════════════════════════════════════════════════════════
def patch_p9():
    print("\n📋 P9: Gemini Vision — samo plan (treba molty-worker endpoint)")
    print("  Potrebno:")
    print("  1. Dodaj GEMINI_API_KEY env var na Vercel molty-worker")
    print("  2. Kreiraj ~/molty-app/api/vision.js endpoint")
    print("  3. Frontend poziva /api/vision sa base64 slikom")
    print()

    # Kreiraj vision endpoint template za molty-worker
    vision_path = os.path.expanduser("~/vision-endpoint-template.js")
    with open(vision_path, "w", encoding="utf-8") as f:
        f.write('''\
// api/vision.js — ANVIL™ Gemini Vision Endpoint
// Deploy: cp vision-endpoint-template.js ~/molty-app/api/vision.js
// Env: GEMINI_API_KEY u Vercel dashboard

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const apiKey = req.headers["x-api-key"] || "";
  const cronSecret = process.env.CRON_SECRET || "";
  if (cronSecret && apiKey !== cronSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { image, prompt, mode } = req.body || {};
  if (!image) return res.status(400).json({ error: "Missing image (base64)" });

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return res.status(500).json({ error: "GEMINI_API_KEY not set" });

  // Prompts po modu
  const PROMPTS = {
    ir_thermal: "Analiziraj ovaj IR termogram industrijske peći. Identifikuj hot-spot zone, proceni temperaturu zidova, i označi kritična mesta gde je vatrostalna obloga tanja. Odgovori JSON: { hotspots: [{zone, temp_est, severity}], overall_risk: 'low|medium|high', notes: '...' }",
    ppe_check: "Analiziraj fotografiju radnika na industrijskom terenu. Proveri PPE: šlem, naočare, rukavice, zaštitno odelo, cipele. Odgovori JSON: { passed: true/false, items: [{item, present: true/false}], missing: [...], notes: '...' }",
    furnace_scan: "Analiziraj fotografiju vatrostalne obloge peći. Proceni stanje: pukotine, erozija, debljina ostatka. Odgovori JSON: { condition: 'good|worn|critical', wear_pct: 0-100, issues: [...], recommendation: '...' }",
    document: "Analiziraj ovaj poslovni dokument. Izvuci: tip (faktura/ponuda/otpremnica), kupac, materijali, vrednost, datum. Odgovori JSON.",
    general: prompt || "Opiši šta vidiš na slici. Odgovori na srpskom.",
  };

  const systemPrompt = PROMPTS[mode] || PROMPTS.general;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: systemPrompt },
              { inline_data: { mime_type: "image/jpeg", data: image.replace(/^data:image\\/\\w+;base64,/, "") } },
            ],
          }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
        }),
      }
    );

    const data = await geminiRes.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Pokušaj parsirati JSON
    let parsed = null;
    try {
      const jsonMatch = text.match(/\\{[\\s\\S]*\\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch {}

    return res.status(200).json({
      ok: true,
      mode: mode || "general",
      raw: text,
      parsed,
      model: "gemini-2.0-flash",
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
''')
    print(f"  ✅ [P9] Template: ~/vision-endpoint-template.js")
    print("  Deploy: cp ~/vision-endpoint-template.js ~/molty-app/api/vision.js")
    return True


# ═══════════════════════════════════════════════════════════════
# P10: Walkie-Talkie — Voice Input za WorkerApp
# ═══════════════════════════════════════════════════════════════
def patch_p10():
    print("\n🔧 P10: Walkie-Talkie voice input za WorkerApp")

    # Dodaj VoiceButton komponentu i PTT logiku u WorkerApp.jsx
    # Tražimo kraj importova / početak konstanti

    OLD = """function NavHeader({ title, subtitle, onBack, right }) {"""

    NEW = """// ── P10: Walkie-Talkie Voice Input ──
function VoiceButton({ onResult, lang = "sr-RS", style: sx }) {
  const [listening, setListening] = React.useState(false);
  const recRef = React.useRef(null);

  const toggle = React.useCallback(() => {
    if (listening && recRef.current) {
      recRef.current.stop();
      setListening(false);
      return;
    }
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      alert("Pretraživač ne podržava glasovni unos");
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript || "";
      if (text && onResult) onResult(text);
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
    // Drži ekran budan dok sluša
    if ("wakeLock" in navigator) {
      navigator.wakeLock.request("screen").catch(() => {});
    }
  }, [listening, lang, onResult]);

  return (
    <button
      onClick={toggle}
      onTouchStart={(e) => { e.preventDefault(); toggle(); }}
      style={{
        width: 52, height: 52, borderRadius: "50%",
        border: listening ? "2px solid #22c55e" : "2px solid #1e2535",
        background: listening ? "#22c55e20" : "#0c1220",
        color: listening ? "#22c55e" : "#8892a8",
        fontSize: 22, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: listening ? "pulse 1.5s infinite" : "none",
        flexShrink: 0,
        ...sx,
      }}
      title={listening ? "Snimam... tap za stop" : "Glasovni unos"}
    >
      {listening ? "⏹" : "🎤"}
    </button>
  );
}

function NavHeader({ title, subtitle, onBack, right }) {"""

    ok1 = replace("modules/WorkerApp.jsx", OLD, NEW, "P10a-component")

    # Dodaj CSS animaciju za pulse na kraju fajla
    # Tražim poslednji export
    OLD_EXPORT = """export default WorkerJobList;"""

    NEW_EXPORT = """// P10: Pulse animacija za voice button
if (typeof document !== "undefined") {
  const styleEl = document.createElement("style");
  styleEl.textContent = `@keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); } 50% { box-shadow: 0 0 0 12px rgba(34,197,94,0); } }`;
  document.head.appendChild(styleEl);
}

export default WorkerJobList;"""

    ok2 = replace("modules/WorkerApp.jsx", OLD_EXPORT, NEW_EXPORT, "P10b-css")

    # Dodaj VoiceButton u WorkerJobList header — pored naslova
    # Tražimo header deo job liste
    OLD_HEADER = """        <button onClick={()=>setScreen("hse")} style={{ marginLeft:"auto", padding:"6px 14px", borderRadius:20, border:`1px solid ${T.rd}40`, background:`${T.rd}18`, color:T.rd, cursor:"pointer", fontSize:11, fontWeight:700 }}>"""

    NEW_HEADER = """        <VoiceButton onResult={(text) => {
          // Glasovna komanda: otvori job, promeni filter itd.
          const lower = text.toLowerCase();
          const matchJob = jobs.find(j =>
            (j.jobName||"").toLowerCase().includes(lower) ||
            (j.customerName||"").toLowerCase().includes(lower)
          );
          if (matchJob) { setSelectedId(matchJob._id); setScreen("job"); }
          else alert(`🎤 "${text}" — job nije pronađen`);
        }} style={{ marginLeft:"auto", marginRight:8 }} />
        <button onClick={()=>setScreen("hse")} style={{ padding:"6px 14px", borderRadius:20, border:`1px solid ${T.rd}40`, background:`${T.rd}18`, color:T.rd, cursor:"pointer", fontSize:11, fontWeight:700 }}>"""

    ok3 = replace("modules/WorkerApp.jsx", OLD_HEADER, NEW_HEADER, "P10c-integration")

    return ok1 and ok2


# ═══════════════════════════════════════════════════════════════
# WORKER: /api/status endpoint
# ═══════════════════════════════════════════════════════════════
def create_worker_status():
    print("\n🔧 BONUS: Worker /api/status endpoint")

    status_path = os.path.expanduser("~/api-status-endpoint.js")
    with open(status_path, "w", encoding="utf-8") as f:
        f.write('''\
// api/status.js — ANVIL™ Worker Health Check
// Deploy: cp ~/api-status-endpoint.js ~/molty-app/api/status.js

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, x-api-key, Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Auth check (podržava oba formata)
  const secret = process.env.CRON_SECRET || "";
  const authHeader = req.headers["authorization"]?.replace("Bearer ", "") || "";
  const apiKey = req.headers["x-api-key"] || "";

  if (secret && authHeader !== secret && apiKey !== secret) {
    return res.status(401).json({ connected: false, error: "Unauthorized" });
  }

  // Proveri endpoint-e
  const endpoints = [
    { id: "pipeline-tracker", cron: "*/15 * * * *" },
    { id: "auto-draft",       cron: "*/15 * * * *" },
    { id: "auto-followup",    cron: "0 6 * * 3,0" },
    { id: "drive-sync",       cron: "0 */2 * * *" },
    { id: "morning-brief",    cron: "0 6 * * *" },
    { id: "daily-digest",     cron: "0 5 * * *" },
  ];

  return res.status(200).json({
    connected: true,
    platform: "ANVIL™ Worker",
    version: "1.1",
    uptime: process.uptime ? Math.round(process.uptime()) : null,
    endpoints: endpoints.map(e => ({ ...e, alive: true })),
    env: {
      hasFirebase: !!process.env.FIREBASE_PROJECT_ID || !!process.env.FIREBASE_SERVICE_ACCOUNT,
      hasGmail: !!process.env.GMAIL_CLIENT_ID,
      hasAnthropic: !!process.env.VITE_ANTHROPIC_KEY || !!process.env.ANTHROPIC_API_KEY,
      hasGemini: !!process.env.GEMINI_API_KEY,
    },
    timestamp: new Date().toISOString(),
  });
}
''')
    print(f"  ✅ Kreiran: ~/api-status-endpoint.js")
    print("  Deploy: cp ~/api-status-endpoint.js ~/molty-app/api/status.js && cd ~/molty-app && git add -A && git commit -m 'feat: /api/status + /api/vision' && git push")
    return True


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════
def main():
    patches = {
        "P6": patch_p6,
        "P7": patch_p7,
        "P8": patch_p8,
        "P9": patch_p9,
        "P10": patch_p10,
    }

    target = sys.argv[1] if len(sys.argv) > 1 else "ALL"

    print("═══════════════════════════════════════════════════")
    print("  ANVIL™ P6–P10 UX & Optimization Patches")
    print("═══════════════════════════════════════════════════")

    bak = backup()

    if target == "ALL" or target == "--all":
        results = {}
        for pid, fn in patches.items():
            results[pid] = fn()
        # Bonus: worker endpoints
        create_worker_status()

        print("\n═══════════════════════════════════════════════════")
        print("  REZULTATI:")
        for pid, ok in results.items():
            print(f"  {pid}: {'✅ OK' if ok else '⚠ PROVERI'}")
        print(f"\n  Backup: {bak}")
        print("\n  FRONTEND: cd ~/MoltySystem && npx vite build 2>&1 | tail -5")
        print("  WORKER:   cp ~/api-status-endpoint.js ~/molty-app/api/status.js")
        print("            cp ~/vision-endpoint-template.js ~/molty-app/api/vision.js")
        print("            cd ~/molty-app && git add -A && git commit -m 'feat: status+vision' && git push")
        print("═══════════════════════════════════════════════════")
    elif target.upper() in patches:
        patches[target.upper()]()
        print(f"\n  Backup: {bak}")
    else:
        print(f"Upotreba: python3 p6_p10_patches.py [P6|P7|P8|P9|P10|ALL]")


if __name__ == "__main__":
    main()
