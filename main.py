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
    # TVOJA LOGIKA KALKULACIJE
    t_hot = r.target_temp; t_amb = r.ambient_temp
    temps = [t_hot]
    total_r = 0.12
    r_vals = []
    for l in r.layers:
        lam = l.lambda_val or 1.5
        res = (l.thickness/1000.0) / lam
        r_vals.append(res); total_r += res
    flux = (t_hot - t_amb) / total_r
    curr = t_hot
    for rv in r_vals:
        curr -= flux * rv
        temps.append(curr)
    
    bom = []
    tw = 0; tc = 0
    for i, l in enumerate(r.layers):
        w = r.geometry.get('dim1', 1) * (l.thickness/1000.0) * l.density
        bom.append({"name": l.material, "th": l.thickness, "temp": round(temps[i+1]), "w": round(w,1), "cost": round(w/1000*l.price, 1)})
        tw += w; tc += w/1000*l.price

    return {
        "shell_temp": round(temps[-1], 1), "heat_flux": round(flux, 1),
        "bom": bom, "total_weight": round(tw, 1), "total_cost": round(tc, 1),
        "safety": "SAFE" if temps[-1] < 350 else "WARNING",
        "profile": [{"pos": i*10, "temp": t} for i, t in enumerate(temps)]
    }

@app.get("/", response_class=HTMLResponse)
def root():
    return FileResponse("dashboard.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
