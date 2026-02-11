import os, math, re, PyPDF2, json, psycopg2
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from psycopg2.extras import RealDictCursor

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DB_URL = os.environ.get("DATABASE_URL")

# --- MODELS ---
class Layer(BaseModel):
    material: str; thickness: float; lambda_val: float; density: float; price: float
class SimReq(BaseModel):
    metal: str; target_temp: float; ambient_temp: float; layers: List[Layer]; geometry: dict; client: Optional[str] = ""

# --- DATABASE ---
def get_db_conn():
    return psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)

def init_db():
    if not DB_URL: return
    try:
        conn = get_db_conn(); c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS projects
                     (id SERIAL PRIMARY KEY, client TEXT, date TEXT, metal TEXT, data JSONB)''')
        conn.commit(); c.close(); conn.close()
    except: pass
init_db()

# --- MATERIALS ---
METALS_DB = {
    "Čelik (Low C)": 1510, "Sivi liv": 1150, "Nodularni liv": 1180,
    "Bakar": 1085, "Mesing": 930, "Bronza": 950, "Aluminijum": 660,
    "Al legura (Si)": 580, "Cink": 419
}

CACHED_MATERIALS = []
def load_mats():
    global CACHED_MATERIALS
    if CACHED_MATERIALS: return CACHED_MATERIALS
    mats = [{"name": "STEEL SHELL (S235)", "density": 7850, "lambda_val": 50.0, "price": 1000},
            {"name": "AIR GAP", "density": 1, "lambda_val": 0.05, "price": 0}]
    tp = os.path.join(os.getcwd(), "tds")
    if os.path.exists(tp):
        for f in os.listdir(tp):
            if f.lower().endswith(".pdf"):
                mats.append({"name": f[:-4].upper(), "density": 2300, "lambda_val": 1.5, "price": 850})
    CACHED_MATERIALS = sorted(mats, key=lambda x: x["name"])
    return CACHED_MATERIALS

# --- ROUTES ---
@app.get("/api/init")
def init_data():
    return {"materials": load_mats(), "metals": METALS_DB, "clients": ["METALFER", "HBIS", "ZIJIN", "LIVNICA KIKINDA"]}

@app.post("/api/simulate")
def simulate(r: SimReq):
    # 1. OSNOVNI PODACI
    liquidus = METALS_DB.get(r.metal, 0)
    t_hot = r.target_temp
    t_amb = r.ambient_temp
    
    # 2. GEOMETRIJA - DETEKCIJA
    # Ako frontend ne posalje tip, podrazumevamo "flat" (ravan zid)
    geo_type = r.geometry.get("type", "flat") 
    
    # dim1: Za "flat" ovo je Povrsina (m2). Za "cylinder" ovo je Visina/Duzina (m).
    dim1 = float(r.geometry.get("dim1", 1.0)) 
    
    # diameter: Bitno samo za cilindar (unutrasnji precnik u mm od kog krecemo)
    current_dia = float(r.geometry.get("diameter", 2000)) 

    temps = [t_hot]
    r_vals = []         # Otpori svakog sloja
    layer_stats = []    # Ovde cuvamo tezine i cene da ih ne racunamo dvaput

    # Otpor prenosu toplote na spoljnoj povrsini (vazduh/konvekcija)
    # R_se aproksimativno 0.12 m2K/W za ravan zid
    total_r_abs = 0 # Apsolutni otpor u K/W
    
    # --- PRORACUN PO SLOJEVIMA ---
    # Idemo od unutra (t_hot) ka spolja
    
    temp_radius = current_dia / 2.0 # Poluprecnik u mm

    for l in r.layers:
        lam = l.lambda_val or 1.5
        th_mm = l.thickness
        th_m = th_mm / 1000.0
        
        if geo_type == "cylinder":
            # --- FIZIKA ZA CILINDAR (Lonci, peci, cevi) ---
            r_in = temp_radius
            r_out = temp_radius + th_mm
            
            # Termicki Otpor: ln(r_out/r_in) / (2 * pi * L * lambda)
            # Ovo je jedina tacna formula za radijalno prostiranje toplote
            res = math.log(r_out / r_in) / (2 * math.pi * dim1 * lam)
            
            # Zapremina prstena: V = pi * L * (R_out^2 - R_in^2)
            # Sve prebacujemo u metre za zapreminu
            r_out_m = r_out / 1000.0
            r_in_m = r_in / 1000.0
            vol = math.pi * dim1 * (r_out_m**2 - r_in_m**2)
            
            temp_radius = r_out # Pomeramo radijus za sledeci sloj
            
        else:
            # --- FIZIKA ZA RAVAN ZID ---
            # Otpor: d / (lambda * A)
            # Ovde dim1 glumi povrsinu (Area)
            res = th_m / (lam * dim1)
            vol = dim1 * th_m

        # Dodajemo otpor sloja u ukupni zbir
        r_vals.append(res)
        total_r_abs += res
        
        # Racunamo tezinu i cenu odmah
        weight = vol * l.density
        cost = (weight / 1000.0) * l.price
        
        layer_stats.append({
            "name": l.material,
            "th": l.thickness,
            "weight": weight,
            "cost": cost
        })

    # Dodajemo otpor vazdusnog filma na kraju (spolja)
    if geo_type == "cylinder":
        # Povrsina spoljnog plast: 2 * pi * R_outer * L
        area_outer = 2 * math.pi * (temp_radius / 1000.0) * dim1
        r_film = 1.0 / (10.0 * area_outer) # alpha=10 W/m2K (konvekcija)
    else:
        # Povrsina je dim1
        area_outer = dim1
        r_film = 0.12 / area_outer # Standardnih 0.12 m2K/W podeljeno sa povrsinom
        
    total_r_abs += r_film

    # 3. FINALNI PRORACUN TEMPERATURA I FLUKSA
    # Q (Snaga u Watima) = Delta T / Ukupni Apsolutni Otpor
    q_watts = (t_hot - t_amb) / total_r_abs
    
    # Flux (W/m2) - uvek ga prikazujemo u odnosu na SPOLJNU povrsinu (radna bezbednost)
    heat_flux = q_watts / area_outer

    # Racunanje pada temperature kroz slojeve
    curr_t = t_hot
    for rv in r_vals:
        curr_t -= q_watts * rv # Pad T = Q * R
        temps.append(curr_t)

    # 4. PAKOVANJE ZA FRONTEND
    bom = []
    tw = 0; tc = 0
    
    for i, stats in enumerate(layer_stats):
        bom.append({
            "name": stats["name"],
            "th": stats["th"],
            "temp": round(temps[i+1]), # Temp na spoju sa sledecim slojem
            "w": round(stats["weight"], 1),
            "cost": round(stats["cost"], 1)
        })
        tw += stats["weight"]
        tc += stats["cost"]

    return {
        "liquidus_temp": liquidus,
        "shell_temp": round(temps[-1], 1),
        "heat_flux": round(heat_flux, 1),
        "bom": bom,
        "total_weight": round(tw, 1),
        "total_cost": round(tc, 1),
        "safety": "SAFE" if temps[-1] < 350 else "WARNING",
        "profile": [{"pos": i*10, "temp": round(t, 1)} for i, t in enumerate(temps)]
    }

@app.get("/", response_class=HTMLResponse)
def root():
    return FileResponse("dashboard.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
