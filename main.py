import os, math, re, PyPDF2, sqlite3, json, io
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import List
from google.oauth2 import service_account
from googleapiclient.discovery import build

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# --- KONFIGURACIJA ---
TDS_PATH = "tehnicki_listovi"
DB_FILE = "molty.db"
ROOT_FOLDER_ID = os.getenv("ROOT_FOLDER_ID", "1zsDeckOseY0gMerBHU8nG0p-qKXDV8bN")

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
    metal: str; target_temp: float; ambient_temp: float; layers: List[Layer]

# --- TEHNIČKI LISTOVI (TDS) ---
def get_mats_from_tds():
    mats = [{"name": "STEEL SHELL", "density": 7850, "lambda_val": 50.0, "price": 1000}]
    if not os.path.exists(TDS_PATH): 
        os.makedirs(TDS_PATH)
        return mats
    for file in os.listdir(TDS_PATH):
        if file.lower().endswith(".pdf"):
            try:
                with open(os.path.join(TDS_PATH, file), "rb") as f:
                    reader = PyPDF2.PdfReader(f)
                    txt = "".join([p.extract_text() or "" for p in reader.pages]).upper()
                    # Ekstrakcija gustine (kg/m3)
                    den_match = re.search(r"(\d+[.,]?\d*)\s*(KG/M3|G/CM3)", txt)
                    density = float(den_match.group(1).replace(",", ".")) if den_match else 2500
                    if density < 100: density *= 1000
                    # Ekstrakcija Lambde (W/mK)
                    lam_match = re.search(r"(\d+[.,]?\d*)\s*(W/MK|W/M K)", txt)
                    l_val = float(lam_match.group(1).replace(",", ".")) if lam_match else 1.4
                    mats.append({"name": file.replace(".pdf", "").upper(), "density": int(density), "lambda_val": l_val, "price": 950})
            except: continue
    return mats

# --- DRIVE & AI ---
def get_drive_service():
    try:
        creds_json = os.getenv("GOOGLE_CREDENTIALS")
        if not creds_json: return None
        info = json.loads(creds_json)
        creds = service_account.Credentials.from_service_account_info(info)
        return build('drive', 'v3', credentials=creds)
    except: return None

@app.get("/api/init")
def init_data():
    return {
        "materials": get_mats_from_tds(),
        "metals": {"Sivi Liv": 1200, "Nodularni Liv": 1150, "Celik (Low C)": 1510, "Bakar": 1085, "Aluminijum": 660}
    }

@app.get("/api/drive/scan-deep/{fid}")
def scan_deep(fid: str):
    service = get_drive_service()
    if not service: return {"status": "error"}
    # Duboko skeniranje 2020+
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

@app.post("/api/simulate")
def simulate(r: SimReq):
    total_r = 0.12 # Otpor spoljnog vazduha
    tw = 0; tc = 0; bom = []
    for l in r.layers:
        # Proračun težine: Debljina (m) * Gustina (kg/m3)
        weight = (l.thickness / 1000) * l.density
        # Proračun cene: (Težina / 1000) * Cena po toni
        cost = (weight / 1000) * l.price
        
        total_r += (l.thickness / 1000) / (l.lambda_val if l.lambda_val > 0 else 0.01)
        tw += weight; tc += cost
        bom.append({"name": l.material, "th": l.thickness, "w": round(weight, 1), "cost": round(cost, 1)})
        
    shell_t = r.ambient_temp + ((r.target_temp - r.ambient_temp) / total_r) * 0.12
    return {"shell_temp": round(shell_t, 1), "total_weight": round(tw, 1), "total_cost": round(tc, 1), "bom": bom}

@app.get("/", response_class=HTMLResponse)
def root(): return open("dashboard.html", encoding="utf-8").read()
