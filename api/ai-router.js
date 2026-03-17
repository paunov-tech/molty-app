// ═══════════════════════════════════════════════════════════════
// api/ai-router.js — ANVIL™ Multi-Model AI Router
//
// Centralni router koji bira pravi model za svaki zadatak:
//   Gemini Flash 2.0 → PDF ekstrakcija, Drive scan, bulk klasifikacija
//   Claude Sonnet    → Chain-of-thought odluke, srpski tekst, brifing
//   Gemini Pro Vision → IR termogrami, tehničke slike
//
// Ensemble mod: oba modela → konsenzus → veća pouzdanost
// ═══════════════════════════════════════════════════════════════

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_KEY    = process.env.GEMINI_API_KEY;  // ← dodati u Vercel env

// ── Model konfiguracija ─────────────────────────────────────────
const MODELS = {
  claude_sonnet:  "claude-sonnet-4-20250514",
  gemini_flash:   "gemini-2.0-flash-exp",
  gemini_pro:     "gemini-1.5-pro",
};

// ── Task router — koji model za koji zadatak ────────────────────
const TASK_MODEL = {
  // Ekstrakcija podataka iz PDF-a (faktura, TDS, CMR)
  pdf_extract:      "gemini_flash",   // native PDF, 4× jeftiniji
  // Klasifikacija tipa dokumenta (bulk)
  doc_classify:     "gemini_flash",   // brz, jeftin za rutinske zadatke
  // Drive scanning (stari fajlovi)
  drive_scan:       "gemini_flash",   // direktan Drive API access
  // Poslovne odluke, CoT analiza (agent orchestrator)
  business_decision: "claude_sonnet", // Claude superioran za srpski + CoT
  // Jutarnji brifing, preporuke
  morning_brief:    "claude_sonnet",
  // IR termogram analiza (Sevojno peći)
  ir_analysis:      "gemini_pro",     // Vision superioran za tehničke slike
  // Ensemble: oba modela, konsenzus
  ensemble:         "both",
};

// ── Claude poziv ────────────────────────────────────────────────
async function callClaude(prompt, systemPrompt, maxTokens = 1000) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODELS.claude_sonnet,
      max_tokens: maxTokens,
      system: systemPrompt || undefined,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error("Claude: " + data.error.message);
  return data.content?.[0]?.text || "";
}

// ── Gemini poziv ────────────────────────────────────────────────
async function callGemini(prompt, model = "gemini_flash", fileUri = null) {
  const modelId = MODELS[model];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${GEMINI_KEY}`;
  
  const parts = [];
  
  // Dodaj fajl ako postoji (PDF, slika)
  if (fileUri) {
    parts.push({ fileData: { fileUri, mimeType: "application/pdf" } });
  }
  
  parts.push({ text: prompt });
  
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    }),
  });
  
  const data = await res.json();
  if (data.error) throw new Error("Gemini: " + data.error.message);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ── Gemini File Upload (za PDF) ──────────────────────────────────
async function uploadToGemini(buffer, mimeType = "application/pdf", displayName = "doc.pdf") {
  // Gemini Files API — uploaduje fajl za analizu
  const formData = new FormData();
  const blob = new Blob([buffer], { type: mimeType });
  formData.append("file", blob, displayName);
  
  const res = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_KEY}`,
    { method: "POST", body: formData }
  );
  const data = await res.json();
  return data.file?.uri; // fileUri za dalji poziv
}

// ── Ensemble konsenzus ──────────────────────────────────────────
async function ensembleDecision(prompt, systemPrompt) {
  // Paralelni pozivi
  const [claudeResult, geminiResult] = await Promise.allSettled([
    callClaude(prompt, systemPrompt),
    callGemini(prompt, "gemini_flash"),
  ]);
  
  const claudeText = claudeResult.status === "fulfilled" ? claudeResult.value : "";
  const geminiText = geminiResult.status === "fulfilled" ? geminiResult.value : "";
  
  // Parsiranje JSON odgovora
  function parseJson(text) {
    try {
      const m = text.match(/\{[\s\S]*\}/);
      return m ? JSON.parse(m[0]) : null;
    } catch { return null; }
  }
  
  const claudeJson = parseJson(claudeText);
  const geminiJson = parseJson(geminiText);
  
  // Konsenzus logika
  if (claudeJson && geminiJson) {
    const sameAction = claudeJson.action === geminiJson.action;
    const avgConfidence = ((claudeJson.confidence || 0) + (geminiJson.confidence || 0)) / 2;
    const consensusConfidence = sameAction ? Math.min(avgConfidence * 1.15, 99) : avgConfidence * 0.8;
    
    return {
      action: sameAction ? claudeJson.action : "needs_review",
      confidence: Math.round(consensusConfidence),
      consensus: sameAction,
      claude: claudeJson,
      gemini: geminiJson,
      reasoning: sameAction
        ? `Konsenzus (oba modela): ${claudeJson.action}`
        : `Neslaganje: Claude=${claudeJson.action}, Gemini=${geminiJson.action} → čeka odobrenje`,
    };
  }
  
  // Fallback na Claude
  return claudeJson || { action: "unknown", confidence: 0, reasoning: "Parse error" };
}

// ── Specijalizovani taskovi ─────────────────────────────────────

// PDF ekstrakcija — Gemini nativno čita PDF
async function extractPdf(pdfBuffer, docContext = "") {
  const fileUri = await uploadToGemini(pdfBuffer, "application/pdf", "invoice.pdf");
  if (!fileUri) throw new Error("Gemini file upload failed");
  
  const prompt = `Analiziraj ovaj PDF dokument i ekstrahuj podatke.
${docContext}

Odgovori ISKLJUČIVO u JSON:
{
  "type": "invoice|po|offer|dn|tds|cmr|proforma|credit|other",
  "customer": "ime kupca",
  "customerCountry": "zemlja",
  "documentNumber": "broj dokumenta",
  "date": "datum",
  "totalAmount": 0.0,
  "currency": "EUR",
  "items": [{"description":"", "quantity":0, "unit":"", "price":0, "total":0}],
  "confidence": 0-100,
  "isBusinessRelevant": true,
  "language": "sr|en|de|hr",
  "reasoning": "1 rečenica obrazloženja"
}`;

  const result = await callGemini(prompt, "gemini_flash", fileUri);
  try {
    const m = result.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : { type: "unknown", confidence: 0 };
  } catch { return { type: "unknown", confidence: 0 }; }
}

// IR termogram analiza — Gemini Vision
async function analyzeIrImage(imageBuffer, mimeType = "image/png", furnaceContext = "") {
  const fileUri = await uploadToGemini(imageBuffer, mimeType, "ir_scan.png");
  if (!fileUri) throw new Error("IR image upload failed");
  
  const prompt = `Analiziraj ovaj IR termogram industrijskog postrojenja.
${furnaceContext}

Identifikuj:
1. Hot-spot zone (koordinate i temperatura ako je vidljivo)
2. Normalne zone (temperatura)
3. Anomalije (zona, opis, urgentnost)
4. Preporuku za akciju

Odgovori u JSON:
{
  "hotspots": [{"x_pct": 0-100, "y_pct": 0-100, "temp_est": "°C ili opseg", "description": ""}],
  "max_temp_zone": "opis",
  "anomalies": [{"zone": "", "description": "", "severity": "critical|warning|info"}],
  "recommendation": "konkretna preporuka",
  "confidence": 0-100,
  "urgency": "immediate|within_24h|routine"
}`;

  const result = await callGemini(prompt, "gemini_pro", fileUri);
  try {
    const m = result.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : { anomalies: [], confidence: 0 };
  } catch { return { anomalies: [], confidence: 0 }; }
}

// ── Glavni handler ──────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if ((req.headers.authorization || "") !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { task, prompt, systemPrompt, pdfBase64, imageBase64, imageMimeType, context } = req.body || {};
  if (!task) return res.status(400).json({ error: "task required" });

  try {
    let result;

    switch (task) {
      case "pdf_extract": {
        const buffer = Buffer.from(pdfBase64, "base64");
        result = await extractPdf(buffer, context);
        result._model = "gemini_flash";
        break;
      }

      case "ir_analysis": {
        const buffer = Buffer.from(imageBase64, "base64");
        result = { analysis: await analyzeIrImage(buffer, imageMimeType || "image/png", context) };
        result._model = "gemini_pro";
        break;
      }

      case "ensemble": {
        result = await ensembleDecision(prompt, systemPrompt);
        result._model = "claude+gemini";
        break;
      }

      case "business_decision":
      case "morning_brief": {
        const text = await callClaude(prompt, systemPrompt, 2000);
        result = { text, _model: "claude_sonnet" };
        break;
      }

      case "doc_classify": {
        const text = await callGemini(prompt, "gemini_flash");
        result = { text, _model: "gemini_flash" };
        break;
      }

      default:
        return res.status(400).json({ error: `Unknown task: ${task}` });
    }

    return res.status(200).json({ ok: true, task, ...result });

  } catch (e) {
    console.error("[ai-router]", e.message);
    return res.status(500).json({ error: e.message });
  }
}
