import os, math, re, PyPDF2, sqlite3, json, io
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from google.oauth2 import service_account
from googleapiclient.discovery import build

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DB_FILE = "molty.db"
ROOT_FOLDER_ID = "1zsDeckOseY0gMerBHU8nG0p-qKXDV8bN"

# Inicijalizacija baze podataka
def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS sales_analytics 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, file_id TEXT UNIQUE, 
                  client_name TEXT, doc_date TEXT, material_name TEXT, 
                  quantity REAL, price_per_unit REAL, total_val REAL)''')
    conn.commit()
    conn.close()

init_db()

# Model za podatke
class Layer(BaseModel):
    material: str; thickness: float; lambda_val: float; density: float; price: float
class SimReq(BaseModel):
    metal: str; target_temp: float; ambient_temp: float; layers: List[Layer]

# Google Drive Service
def get_drive_service():
    creds_json = os.getenv("GOOGLE_CREDENTIALS")
    if not creds_json: return None
    info = json.loads(creds_json)
    creds = service_account.Credentials.from_service_account_info(info)
    return build('drive', 'v3', credentials=creds)

@app.get("/api/init")
def init_data():
    return {
        "materials": [
            {"name": "MAGNIT B75", "density": 2950, "lambda_val": 4.5, "price": 1150},
            {"name": "ALKON 60", "density": 2550, "lambda_val": 1.8, "price": 850},
            {"name": "STEEL SHELL", "density": 7850, "lambda_val": 50.0, "price": 1000},
            {"name": "AIR GAP", "density": 1, "lambda_val": 0.05, "price": 0}
        ],
        "metals": {"Celik": 1510, "Sivi Liv": 1200, "Nodularni Liv": 1150, "Bakar": 1085},
        "clients": ["METALFER", "HBIS", "ZIJIN", "ARCELLOR MITTAL"]
    }

@app.get("/api/drive/test-scan")
def test_drive_scan():
    service = get_drive_service()
    if not service: return {"status": "error", "message": "Auth error"}
    query = f"'{ROOT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder'"
    results = service.files().list(q=query, fields="files(id, name)").execute().get('files', [])
    return {"status": "success", "found_clients": results}

@app.get("/api/drive/scan-deep/{folder_id}")
def scan_deep(folder_id: str):
    service = get_drive_service()
    q_years = f"'{folder_id}' in parents and mimeType = 'application/vnd.google-apps.folder'"
    years = service.files().list(q=q_years, fields="files(id, name)").execute().get('files', [])
    all_files = []
    for year in years:
        try:
            if int(re.sub(r'\D', '', year['name'])) < 2020: continue
        except: continue
        q_pdfs = f"'{year['id']}' in parents and mimeType = 'application/pdf'"
        pdfs = service.files().list(q=q_pdfs, fields="files(id, name)").execute().get('files', [])
        for p in pdfs:
            all_files.append({"godina": year['name'], "ime": p['name'], "id": p['id']})
    return {"status": "success", "files": all_files}

@app.post("/api/simulate")
def simulate(r: SimReq):
    # Logika proračuna: Totalni termički otpor R = d/lambda
    total_r = 0.12 # Spoljni koeficijent
    tw = 0; tc = 0; bom = []
    for l in r.layers:
        res = (l.thickness/1000) / l.lambda_val
        total_r += res
        w = (l.thickness/1000) * l.density
        cost = (w/1000) * l.price
        tw += w; tc += cost
        bom.append({"name": l.material, "th": l.thickness, "w": round(w, 1), "cost": round(cost, 1)})
    
    flux = (r.target_temp - r.ambient_temp) / total_r
    shell_t = r.ambient_temp + (flux * 0.12)
    return {"shell_temp": round(shell_t, 1), "total_weight": round(tw, 1), "total_cost": round(tc, 1), "bom": bom}

@app.get("/", response_class=HTMLResponse)
def root():
    return open("dashboard.html", encoding="utf-8").read()
