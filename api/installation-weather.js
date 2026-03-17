// ═══════════════════════════════════════════════════════════════
// api/installation-weather.js — ANVIL™ Vreme za instalacije
// Port iz Jadran AI weather.js (Open-Meteo, besplatno, bez ključa)
//
// Primjena u ANVIL:
//   • InstallWorkflow — uslovi za ugradnju vatrostalne obloge
//   • Temperatura < 5°C → produžiti sušenje
//   • Kiša/vlaga → odložiti ugradnju
//   • Jak vjetar → sigurnosno upozorenje
// ═══════════════════════════════════════════════════════════════

// ── REFRACTORY INSTALLATION LIMITS ──────────────────────────────
// Naučni temelj: vatrostalna obloga mora se ugraditi u kontroliranim uslovima
// Reference: Calderys Installation Manual + ISO 10399 (refractory installation)
const INSTALL_LIMITS = {
  temp_min_C: 5,          // Ispod 5°C → sušenje produžiti min 50%
  temp_optimal_min_C: 10, // Optimalni opseg za ugradnju
  temp_optimal_max_C: 35, // Iznad 35°C → brzo sušenje, rizik pucanja
  temp_max_C: 40,         // Iznad 40°C → odložiti ugradnju
  humidity_max_pct: 85,   // Iznad 85% → MgO obloga apsorbuje vlagu (kritično!)
  wind_max_kmh: 50,       // Jak vjetar → sigurnosni rizik na visini
  rain_threshold_mm: 0.5, // Bilo kakva kiša → nije preporučljivo
};

// ── LOKACIJE FABRIKA/KUPACA ──────────────────────────────────────
// GPS koordinate za automatsko određivanje vremenskih uslova
export const CUSTOMER_LOCATIONS = {
  "HBIS": { lat: 44.6639, lon: 20.9271, name: "HBIS Group — Smederevo" },
  "ArcelorMittal": { lat: 44.8125, lon: 20.4612, name: "ArcelorMittal — Beograd" },
  "Makstil": { lat: 41.9981, lon: 21.4254, name: "Makstil A.D. — Skoplje" },
  "Metalfer": { lat: 44.1333, lon: 20.7167, name: "Metalfer — Gornji Milanovac" },
  "Sevojno": { lat: 43.8347, lon: 19.8964, name: "IAS/INDUGA — Sevojno" },
  "Lafarge BiH": { lat: 43.8564, lon: 18.4131, name: "Lafarge — Sarajevo" },
  "Talum": { lat: 46.3924, lon: 15.8791, name: "Talum — Kidričevo" },
  "INA Rijeka": { lat: 45.3271, lon: 14.4422, name: "INA — Rijeka" },
};

// ── PROCJENA USLOVA ZA UGRADNJU ──────────────────────────────────
function assessInstallConditions(weather) {
  const warnings = [];
  const critical = [];
  let canInstall = true;
  let delayReason = null;

  const t = weather.temp;
  const hum = weather.humidity;
  const wind = weather.windSpeed;
  const rain = weather.rainMm || 0;
  const linings = weather.liningType || "all";

  // Temperatura
  if (t < INSTALL_LIMITS.temp_min_C) {
    critical.push(`❄️ Temperatura ${t}°C ispod minimuma (${INSTALL_LIMITS.temp_min_C}°C)`);
    canInstall = false;
    delayReason = `Temperatura premala — sušenje će biti neravnomjerno`;
  } else if (t < INSTALL_LIMITS.temp_optimal_min_C) {
    warnings.push(`🌡️ Temperatura ${t}°C — produžiti sušenje za 30-50%`);
  } else if (t > INSTALL_LIMITS.temp_max_C) {
    critical.push(`🔥 Temperatura ${t}°C — prevelika, ubrzano isparavanje vode`);
    canInstall = false;
    delayReason = "Pregrijavanje — ugraditi rano ujutro ili uvečer";
  } else if (t > INSTALL_LIMITS.temp_optimal_max_C) {
    warnings.push(`☀️ Temperatura ${t}°C visoka — ugraditi rano ili navečer`);
  }

  // Vlažnost — kritično za MgO (bazične obloge)
  if (hum > INSTALL_LIMITS.humidity_max_pct) {
    if (linings === "basic" || linings === "MgO") {
      critical.push(`💧 Vlažnost ${hum}% — MgO APSORBUJE vlagu! Ugradnju odložiti`);
      canInstall = false;
      delayReason = "Visoka vlažnost kritična za MgO oblogu";
    } else {
      warnings.push(`💧 Vlažnost ${hum}% — praćenje sušenja potrebno`);
    }
  } else if (hum > 70) {
    warnings.push(`🌫️ Vlažnost ${hum}% — produžiti sušenje`);
  }

  // Kiša
  if (rain > INSTALL_LIMITS.rain_threshold_mm) {
    critical.push(`🌧️ Aktivna padavina (${rain}mm) — ugradnju odložiti`);
    canInstall = false;
    delayReason = "Kiša — vlaga u materijalu uzrokuje defekte";
  }

  // Vjetar
  if (wind > INSTALL_LIMITS.wind_max_kmh) {
    warnings.push(`💨 Jak vjetar ${wind} km/h — sigurnosni rizik na visini`);
    if (wind > 70) {
      critical.push(`🌪️ Olujni vjetar ${wind} km/h — STOP rad na visini`);
      canInstall = false;
    }
  }

  // Preporuka za sušenje
  let dryoutFactor = 1.0;
  if (t < 10) dryoutFactor = 1.5;
  else if (t < 15) dryoutFactor = 1.2;
  if (hum > 70) dryoutFactor = Math.max(dryoutFactor, 1.3);

  return {
    canInstall,
    status: critical.length > 0 ? "STOP" : warnings.length > 0 ? "UPOZORENJE" : "OK",
    statusEmoji: critical.length > 0 ? "🔴" : warnings.length > 0 ? "🟡" : "🟢",
    critical,
    warnings,
    delayReason,
    dryoutFactor: Math.round(dryoutFactor * 10) / 10,
    recommendation: canInstall
      ? warnings.length > 0
        ? `Ugradnja moguća uz oprez. ${warnings.join("; ")}.`
        : "Idealni uslovi za ugradnju."
      : `Ugradnju odložiti: ${delayReason || "nepovoljni vremenski uslovi"}.`,
  };
}

// ── MAIN HANDLER ─────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // Koordinate — iz query params ili iz poznatih lokacija
    let lat, lon, locationName;

    const customer = req.query?.customer;
    if (customer && CUSTOMER_LOCATIONS[customer]) {
      lat = CUSTOMER_LOCATIONS[customer].lat;
      lon = CUSTOMER_LOCATIONS[customer].lon;
      locationName = CUSTOMER_LOCATIONS[customer].name;
    } else {
      lat = parseFloat(req.query?.lat) || 44.6639; // default: Smederevo (HBIS)
      lon = parseFloat(req.query?.lon) || 20.9271;
      locationName = req.query?.loc || "Lokacija";
    }

    const liningType = req.query?.lining || "all"; // "acid" | "basic" | "neutral" | "all"

    // Open-Meteo poziv — besplatno, bez API ključa
    const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,` +
      `wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,precipitation` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max` +
      `&timezone=Europe/Belgrade&forecast_days=3`;

    const wxRes = await fetch(wxUrl);
    const wx = await wxRes.json();

    if (wx.error) throw new Error("Open-Meteo error: " + wx.reason);

    // WMO weather code → emoji
    const wmoEmoji = (code) => {
      if (!code) return "❓";
      if (code <= 1) return "☀️";
      if (code <= 3) return "⛅";
      if (code <= 48) return "🌫️";
      if (code <= 67) return "🌧️";
      if (code <= 77) return "🌨️";
      if (code <= 82) return "🌧️";
      if (code >= 95) return "⛈️";
      return "☁️";
    };

    const windDirName = (deg) => {
      if (!deg) return "N/A";
      const dirs = ["S","SSZ","SZ","ZSZ","Z","ZJZ","JZ","JJZ","J","JJI","JI","IJI","I","ISI","SI","SSI"];
      return dirs[Math.round(deg / 22.5) % 16];
    };

    // Trenutni uslovi
    const current = {
      temp: Math.round(wx.current?.temperature_2m || 20),
      feelsLike: Math.round(wx.current?.apparent_temperature || 20),
      humidity: Math.round(wx.current?.relative_humidity_2m || 50),
      windSpeed: Math.round(wx.current?.wind_speed_10m || 0),
      windDir: windDirName(wx.current?.wind_direction_10m),
      windGusts: Math.round(wx.current?.wind_gusts_10m || 0),
      rainMm: Math.round((wx.current?.precipitation || 0) * 10) / 10,
      icon: wmoEmoji(wx.current?.weather_code),
      uv: Math.round(wx.current?.uv_index || 0),
      locationName,
      liningType,
    };

    // Procjena uslova za ugradnju
    const installAssessment = assessInstallConditions(current);

    // 3-dnevna prognoza
    const forecast = (wx.daily?.temperature_2m_max || []).slice(0, 3).map((maxT, i) => {
      const dayWeather = {
        temp: Math.round((maxT + (wx.daily.temperature_2m_min[i] || maxT - 8)) / 2),
        humidity: current.humidity, // Open-Meteo daily nema humidity, koristimo current
        windSpeed: Math.round(wx.daily.wind_speed_10m_max?.[i] || 0),
        rainMm: Math.round((wx.daily.precipitation_sum?.[i] || 0) * 10) / 10,
        liningType,
      };
      const dayAssess = assessInstallConditions(dayWeather);
      return {
        day: ["Danas", "Sutra", "Prekosutra"][i],
        icon: wmoEmoji(wx.daily.weather_code?.[i]),
        maxTemp: Math.round(maxT),
        minTemp: Math.round(wx.daily.temperature_2m_min?.[i] || maxT - 8),
        rain: dayWeather.rainMm,
        windMax: dayWeather.windSpeed,
        installStatus: dayAssess.status,
        installStatusEmoji: dayAssess.statusEmoji,
        canInstall: dayAssess.canInstall,
      };
    });

    // Optimalni dan za ugradnju u naredna 3 dana
    const bestDay = forecast.find(d => d.canInstall) || null;

    return res.status(200).json({
      ok: true,
      location: locationName,
      current,
      install: installAssessment,
      forecast,
      bestInstallDay: bestDay ? bestDay.day : "Pratiti prognozu",
      updatedAt: new Date().toISOString(),
    });

  } catch (err) {
    console.error("[install-weather] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
