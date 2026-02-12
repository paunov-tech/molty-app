import os, math, re, sqlite3, json, io
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import List
import PyPDF2
from google.oauth2 import service_account
from googleapiclient.discovery import build

# --- CORE ---
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

TDS_PATH = "tehnicki_listovi"
if not os.path.exists(TDS_PATH): os.makedirs(TDS_PATH)

def init_db():
    conn = sqlite3.connect("molty.db")
    conn.execute('CREATE TABLE IF NOT EXISTS sales_analytics (id INTEGER PRIMARY KEY AUTOINCREMENT, file_id TEXT UNIQUE, client_name TEXT, doc_date TEXT, material_name TEXT, quantity REAL, total_val REAL)')
    conn.close()

init_db()

class Layer(BaseModel):
    material: str; thickness: float; lambda_val: float; density: float; price: float
class SimReq(BaseModel):
    metal: str; target_temp: float; ambient_temp: float; layers: List[Layer]

# --- TDS LOGIKA ---
def get_mats():
    mats = [{"name": "STEEL SHELL", "density": 7850, "lambda_val": 50.0, "price": 1000}]
    for file in os.listdir(TDS_PATH):
        if file.endswith(".pdf"):
            try:
                with open(os.path.join(TDS_PATH, file), "rb") as f:
                    txt = "".join([p.extract_text() or "" for p in PyPDF2.PdfReader(f).pages]).upper()
                    den = re.search(r"(\d+[.,]?\d*)\s*(KG/M3|G/CM3)", txt)
                    d_val = float(den.group(1).replace(",", ".")) if den else 2500
                    if d_val < 100: d_val *= 1000
                    mats.append({"name": file.replace(".pdf", "").upper(), "density": int(d_val), "lambda_val": 1.4, "price": 950})
            except: continue
    return mats

# --- ROUTES ---
@app.get("/api/init")
def init():
    return {"materials": get_mats(), "metals": {"Sivi Liv": 1200, "Nodularni Liv": 1150, "Celik": 1510}}

@app.post("/api/simulate")
def simulate(r: SimReq):
    total_r = 0.12; tw = 0; tc = 0; bom = []
    for l in r.layers:
        d_m = l.thickness / 1000
        total_r += d_m / (l.lambda_val or 0.01)
        weight = d_m * l.density
        cost = (weight / 1000) * l.price
        tw += weight; tc += cost
        bom.append({"name": l.material, "th": l.thickness, "w": round(weight, 1), "cost": round(cost, 1)})
    
    q = (r.target_temp - r.ambient_temp) / total_r
    shell_t = r.ambient_temp + (q * 0.12)
    return {"shell_temp": round(shell_t, 1), "total_weight": round(tw, 1), "total_cost": round(tc, 1), "bom": bom}

@app.get("/", response_class=HTMLResponse)
def root(): return open("dashboard.html", encoding="utf-8").read()
