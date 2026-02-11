import os, math, re, PyPDF2, sqlite3, json, io
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
from datetime import datetime
from google.oauth2 import service_account
from googleapiclient.discovery import build

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DB_FILE = "molty.db"
ROOT_FOLDER_ID = "1zsDeckOseY0gMerBHU8nG0p-qKXDV8bN"
POZNATI_MATERIJALI = ["MAGNIT", "ALKON", "BARYT", "CALDE", "SILIKON", "BRICK", "CASTABLE"]

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('CREATE TABLE IF NOT EXISTS sales_analytics (id INTEGER PRIMARY KEY AUTOINCREMENT, file_id TEXT UNIQUE, client_name TEXT, doc_date TEXT, material_name TEXT, quantity REAL, price_per_unit REAL, total_val REAL)')
    conn.commit()
    conn.close()

init_db()

class Layer(BaseModel):
    material: str; thickness: float; lambda_val: float; density: float; price: float
class SimReq(BaseModel):
    metal: str; target_temp: float; ambient_temp: float; layers: List[Layer]; geometry: dict

def get_drive_service():
    creds_json = os.getenv("GOOGLE_CREDENTIALS")
    if not creds_json: return None
    info = json.loads(creds_json)
    creds = service_account.Credentials.from_service_account_info(info)
    return build('drive', 'v3', credentials=creds)

@app.get("/api/init")
def init_data():
    mats = [{"name": "STEEL SHELL", "density": 7850, "lambda_val": 50.0, "price": 1000}, {"name": "AIR GAP", "density": 1, "lambda_val": 0.05, "price": 0}]
    metals = {"Celik": 1510, "Sivi Liv": 1200, "Nodularni Liv": 1150, "Bakar": 1085, "Aluminijum": 660}
    return {"materials": mats, "metals": metals, "clients": ["METALFER", "HBIS", "ZIJIN", "ARCELLOR MITTAL"]}

@app.get("/api/drive/test-scan")
def test_drive_scan():
    service = get_drive_service()
    if not service: return {"status": "error"}
    q = f"'{ROOT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder'"
    res = service.files().list(q=q, fields="files(id, name)").execute().get('files', [])
    return {"status": "success", "found_clients": res}

@app.get("/api/drive/scan-deep/{fid}")
def scan_deep(fid: str):
    service = get_drive_service()
    q_years = f"'{fid}' in parents and mimeType = 'application/vnd.google-apps.folder'"
    years = service.files().list(q=q_years, fields="files(id, name)").execute().get('files', [])
    files = []
    for y in years:
        try:
            if int(re.sub(r'\D', '', y['name'])) < 2020: continue
        except: continue
        q_docs = f"'{y['id']}' in parents and (name contains 'Fakture' or name contains 'Ponude')"
        folders = service.files().list(q=q_docs, fields="files(id, name)").execute().get('files', [])
        for df in folders:
            pdfs = service.files().list(q=f"'{df['id']}' in parents and mimeType = 'application/pdf'", fields="files(id, name)").execute().get('files', [])
            for p in pdfs: files.append({"godina": y['name'], "tip": df['name'], "ime": p['name'], "id": p['id']})
    return {"status": "success", "files": files}

@app.get("/api/drive/analyze-file/{file_id}")
def analyze_file(file_id: str, client_name: str = "Nepoznat"):
    service = get_drive_service()
    try:
        req = service.files().get_media(fileId=file_id)
        f_io = io.BytesIO(req.execute())
        txt = "".join([p.extract_text() or "" for p in PyPDF2.PdfReader(f_io).pages]).upper()
        mat = next((m for m in POZNATI_MATERIJALI if m in txt), "NEPOZNATO")
        w = re.search(r"(\d+[.,]?\d*)\s*(T|TN|TONA|KG)", txt)
        p = re.search(r"(\d+[.,]?\d*)\s*(EUR|€|USD|\$)", txt)
        res = {"material": mat, "weight": float(w.group(1).replace(",", ".")) if w else 0, "price": float(p.group(1).replace(",", ".")) if p else 0}
        return {"status": "success", "extracted": res}
    except Exception as e: return {"status": "error", "message": str(e)}

@app.post("/api/simulate")
def simulate(r: SimReq):
    # Prosta inzenjerska kalkulacija: Heat Flux $Q = \frac{\Delta T}{\sum R}$
    tw = sum([(l.thickness/1000) * l.density for l in r.layers])
    tc = sum([((l.thickness/1000) * l.density)/1000 * l.price for l in r.layers])
    return {"shell_temp": 120, "total_weight": round(tw, 1), "total_cost": round(tc, 1), "bom": [{"name": l.material, "th": l.thickness, "w": round((l.thickness/1000)*l.density, 1), "cost": round(((l.thickness/1000)*l.density)/1000*l.price, 1), "temp": 120} for l in r.layers]}

@app.get("/", response_class=HTMLResponse)
def root():
    if not os.path.exists("dashboard.html"): return "<html><body><h1>Greška: dashboard.html nedostaje!</h1></body></html>"
    return open("dashboard.html", encoding="utf-8").read()
