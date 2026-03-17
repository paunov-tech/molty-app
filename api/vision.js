// ═══════════════════════════════════════════════════════════════
// api/vision.js — ANVIL™ Industrial Vision
// Port iz Jadran AI vision.js (Gemini 2.0 Flash multimodal)
//
// Primjena u ANVIL:
//   • IR termogrami (Sevojno peći) → hot-spot detekcija
//   • FurnaceScan slike → zona analiza
//   • PPE kamera (HSE verifikacija) → oprema prepoznavanje
//   • Montaža fotodokumentacija → AI analiza stanja
// ═══════════════════════════════════════════════════════════════

// Rate limiting — Gemini je skuplje od Claude-a za slike
const _ipRL = new Map();
const IP_LIMIT = 100; // 100 poziva/dan per IP (interni alat, nema zloupotrebe)
const WIN = 86400000;

function rateOk(ip) {
  const now = Date.now();
  for (const [k, v] of _ipRL) { if (now > v.r) _ipRL.delete(k); }
  const e = _ipRL.get(ip);
  if (!e || now > e.r) { _ipRL.set(ip, { c: 1, r: now + WIN }); return true; }
  if (e.c >= IP_LIMIT) return false;
  e.c++; return true;
}

// ── ANALIZA TIPOVI ───────────────────────────────────────────────
const ANALYSIS_TYPES = {
  // IR termogram — najvažniji za ANVIL
  ir_thermogram: {
    prompt: (ctx) => `Ti si industrijski AI sistem za analizu IR termograma vatrostalnih peći.
KONTEKST: ${ctx || "Kanalna indukciona peć"}

Analiziraj ovaj IR termogram i identifikuj:
1. Hot-spot zone (visoke temperature — potencijalno tanka obloga ili proboj)
2. Normalne zone (referentna temperatura kućišta)
3. Anomalije (gradijenti, asimetrije, neočekivani obrasci)
4. Urgentnost akcije

ODGOVORI ISKLJUČIVO u JSON:
{
  "hotspots": [
    {"location": "opis zone (npr. donji desni kanal)", "severity": "critical|warning|info", "temp_relative": "visoka|srednja|referentna", "description": "opis"}
  ],
  "max_temp_zone": "opis najtoplije zone",
  "anomalies": [
    {"zone": "opis", "type": "hot_spot|cold_spot|gradient|asymmetry", "description": "opis", "severity": "critical|warning|info"}
  ],
  "lining_status": "ok|monitor|inspect_soon|urgent",
  "recommendation": "konkretna preporuka na srpskom",
  "confidence": 0-100,
  "urgency": "immediate|within_24h|within_week|routine"
}`,
  },

  // PPE verifikacija (HSE) — već koristi Claude, prebaciti na Gemini
  ppe_check: {
    prompt: (ctx) => `Ti si HSE AI sistem za verifikaciju lične zaštitne opreme (PPE).
KONTEKST: ${ctx || "Industrijska lokacija — vatrostalna obloga"}

Analiziraj sliku i provjeri da li radnik nosi svu obaveznu PPE opremu:
- Zaštitna kaciga/šlem ✓/✗
- Zaštitne naočale ili vizir ✓/✗
- Zaštitne rukavice ✓/✗
- Zaštitne cipele/čizme ✓/✗
- Reflektivni prsluk ✓/✗
- (opciono) Zaštitna maska za prašinu

ODGOVORI ISKLJUČIVO u JSON:
{
  "helmet": true/false,
  "glasses": true/false,
  "gloves": true/false,
  "boots": true/false,
  "vest": true/false,
  "mask": true/false/null,
  "overall_pass": true/false,
  "missing": ["lista nedostajuće opreme"],
  "confidence": 0-100,
  "notes": "opcionalna napomena"
}`,
  },

  // FurnaceScan — opšta analiza slike peći
  furnace_scan: {
    prompt: (ctx) => `Ti si industrijski AI sistem za analizu stanja vatrostalnih peći.
KONTEKST: ${ctx || "Indukciona peć — vatrostalna obloga"}

Analiziraj ovu sliku unutrašnjosti peći/kanala i procijeni:
1. Vidljivo stanje obloge (pukotine, erozija, deponovanje)
2. Kritične zone
3. Preporučene akcije

ODGOVORI ISKLJUČIVO u JSON:
{
  "lining_condition": "good|fair|poor|critical",
  "visible_issues": [
    {"zone": "opis zone", "issue": "opis problema", "severity": "critical|warning|info"}
  ],
  "erosion_estimate_pct": 0-100,
  "recommendation": "konkretna preporuka na srpskom",
  "requires_immediate_action": true/false,
  "confidence": 0-100,
  "next_inspection": "immediately|1_week|1_month|next_campaign"
}`,
  },

  // Fotodokumentacija montaže
  installation_photo: {
    prompt: (ctx) => `Ti si AI sistem za kontrolu kvaliteta vatrostalne montaže.
KONTEKST: ${ctx || "Vatrostalna montaža — instalacija"}

Analiziraj fotodokumentaciju i provjeri:
1. Kvalitet ugradnje (vidljivi defekti, loše spajanje, nepravilne dimenzije)
2. Usklađenost sa standardom (pravilna geometrija, bez praznina)
3. Status faze instalacije

ODGOVORI ISKLJUČIVO u JSON:
{
  "installation_phase": "demolition|preparation|installation|anchoring|dryout|completed",
  "quality": "good|acceptable|poor|rejected",
  "defects": [{"location": "", "type": "", "severity": "critical|warning|minor"}],
  "recommendation": "konkretna preporuka na srpskom",
  "requires_rework": true/false,
  "confidence": 0-100
}`,
  },

  // Generalna analiza dokumenta/slike (fallback)
  general: {
    prompt: (ctx) => `Ti si ANVIL™ AI sistem za industrijsku analizu slika.
KONTEKST: ${ctx || "Industrijsko postrojenje"}

Analiziraj ovu sliku i daj relevantne industrijske informacije.
Fokus: stanje opreme, sigurnost, preporučene akcije.

ODGOVORI u JSON:
{
  "identified": "šta je prikazano na slici",
  "condition": "good|fair|poor|critical|unknown",
  "observations": ["lista opažanja"],
  "recommendation": "preporuka na srpskom",
  "confidence": 0-100
}`,
  },
};

// ── MAIN HANDLER ─────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Auth — interni pozivi
  if ((req.headers.authorization || "") !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const clientIp = (req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  if (!rateOk(clientIp)) {
    return res.status(429).json({ error: "Rate limit — max 100 vision poziva/dan" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY nije konfigurisan" });

  try {
    const {
      image,           // base64 string (bez prefix)
      mimeType,        // "image/jpeg" | "image/png"
      analysisType,    // "ir_thermogram" | "ppe_check" | "furnace_scan" | "installation_photo" | "general"
      context,         // dodatni kontekst (naziv peći, zona, datum)
    } = req.body || {};

    if (!image || typeof image !== "string") {
      return res.status(400).json({ error: "image required (base64)" });
    }
    if (image.length > 8000000) { // 6MB base64 limit
      return res.status(413).json({ error: "Slika prevelika (max 6MB)" });
    }

    // Odaberi prompt
    const analysis = ANALYSIS_TYPES[analysisType] || ANALYSIS_TYPES.general;
    const systemPrompt = analysis.prompt(context);

    const body = {
      contents: [{
        parts: [
          { inlineData: { mimeType: mimeType || "image/jpeg", data: image } },
          { text: "Analiziraj ovu sliku prema datim uputama." },
        ],
      }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature: 0.2,          // Niska temperatura = konzistentni JSON
        maxOutputTokens: 1000,
        responseMimeType: "application/json",
      },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (data.error) {
      console.error("[vision] Gemini error:", data.error);
      return res.status(200).json({
        error: data.error.message,
        fallback: true,
        analysisType,
      });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Parse JSON odgovor
    let result;
    try {
      result = typeof text === "string" ? JSON.parse(text) : text;
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : { raw: text, parseError: true };
    }

    console.log(`[vision] ${analysisType} — confidence: ${result.confidence || "?"}`);

    return res.status(200).json({
      ok: true,
      analysisType,
      result,
      model: "gemini-2.0-flash",
    });

  } catch (err) {
    console.error("[vision] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
