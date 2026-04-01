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
              { inline_data: { mime_type: "image/jpeg", data: image.replace(/^data:image\/\w+;base64,/, "") } },
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
      const jsonMatch = text.match(/\{[\s\S]*\}/);
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
