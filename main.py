import os, math, re, PyPDF2, sqlite3, json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
from fpdf import FPDF
from datetime import datetime
import openpyxl
from openpyxl.styles import Font, PatternFill, Border, Side, Alignment

# Google Drive biblioteke
from google.oauth2 import service_account
from googleapiclient.discovery import build

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# --- KONFIGURACIJA ---
PDF_FOLDER_NAME = os.getenv("PDF_FOLDER", "tehnicki_listovi")
PDF_FOLDER = os.path.join(os.getcwd(), PDF_FOLDER_NAME)
DB_FILE = "molty.db"
ROOT_FOLDER_ID = "1zsDeckOseY0gMerBHU8nG0p-qKXDV8bN"

# Globalna promenljiva za keširanje materijala
CACHED_MATERIALS = [] 

# --- DATABASE INIT ---
def init_db():
    try:
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS projects
                     (id INTEGER PRIMARY KEY AUTOINCREMENT,
                      client TEXT, date TEXT, metal TEXT,
                      total_weight REAL, total_cost REAL, data TEXT)''')
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"DB Error: {e}")

init_db()

# --- POMOĆNE FUNKCIJE ---

def get_drive_service():
    try:
        creds_json = os.getenv("GOOGLE_CREDENTIALS")
        if not creds_json:
            return None
        info = json.loads(creds_json)
        creds = service_account.Credentials.from_service_account_info(info)
        return build('drive', 'v3', credentials=creds)
    except Exception as e:
        print(f"Drive Auth Error: {e}")
        return None

def get_mats():
    global CACHED_MATERIALS
    if CACHED_MATERIALS:
        return CACHED_MATERIALS

    mats = [{"name": "STEEL SHELL (S235)", "density": 7850, "lambda_val": 50.0, "price": 1000},
            {"name": "AIR GAP", "density": 1, "lambda_val": 0.05, "price": 0}]
    
    possible_folders = [PDF_FOLDER_NAME, "tds", "tehnicki_listovi", "TDS"]
    found_folder = None
    for f in possible_folders:
        path = os.path.join(os.getcwd(), f)
        if os.path.exists(path):
            found_folder = path
            break

    if found_folder:
        for f in os.listdir(found_folder):
            if f.lower().endswith(".pdf"):
                try:
                    r = PyPDF2.PdfReader(os.path.join(found_folder, f))
                    txt = r.pages[0].extract_text() or ""
                    dm = re.search(r"(\d+[.,]?\d*)\s*(kg/m3|g/cm3)", txt, re.IGNORECASE)
                    den = 2300
                    if dm:
                        val = float(dm.group(1).replace(",", "."))
                        den = val * 1000 if val < 10 else val
                    mats.append({"name": f[:-4].upper(), "density": int(den), "lambda_val": 1.5, "price": 800})
                except:
                    try: mats.append({"name": f[:-4].upper(), "density": 2300, "lambda_val": 1.5, "price": 800})
                    except: pass
    
    CACHED_MATERIALS = sorted(mats, key=lambda x: x["name"])
    return CACHED_MATERIALS

# --- MODELI ---
class Layer(BaseModel):
    material: str; thickness: float; lambda_val: float; density: float; price: float
class SimReq(BaseModel):
    metal: str; target_temp: float; ambient_temp: float; layers: List[Layer]; geometry: dict; client: Optional[str] = ""

# --- API RUTE ---

@app.get("/api/init")
def init_data():
    return {"materials": get_mats(), "metals": {
        "Celik (Low C)": 1510, "Sivi Liv": 1200, "Nodularni Liv": 1150,
        "Bakar": 1085, "Mesing": 930, "Bronza": 950, "Aluminijum": 660
    }, "clients": ["METALFER", "HBIS GROUP", "ZIJIN BOR", "US STEEL", "ARCELLOR MITTAL"]}

# DRIVE: Osnovni scan (Klijenti)
@app.get("/api/drive/test-scan")
def test_drive_scan():
    service = get_drive_service()
    if not service: return {"status": "error", "message": "Auth error"}
    query = f"'{ROOT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder'"
    results = service.files().list(q=query, fields="files(id, name)").execute().get('files', [])
    return {"status": "success", "found_clients": results}

# DRIVE: Duboki scan (Fakture po klijentu)
@app.get("/api/drive/scan-deep/{folder_id}")
def scan_deep(folder_id: str):
    service = get_drive_service()
    if not service: return {"status": "error", "message": "Auth error"}
    
    # 1. Tražimo godine (podfoldere klijenta)
    q_years = f"'{folder_id}' in parents and mimeType = 'application/vnd.google-apps.folder'"
    years = service.files().list(q=q_years, fields="files(id, name)").execute().get('files', [])
    
    all_files = []
    for year in years:
        # 2. Tražimo foldere Fakture/Ponude
        q_docs = f"'{year['id']}' in parents and (name contains 'Fakture' or name contains 'Racuni' or name contains 'Ponude')"
        doc_folders = service.files().list(q=q_docs, fields="files(id, name)").execute().get('files', [])
        
        for df in doc_folders:
            # 3. Izlistavamo PDF-ove
            q_pdfs = f"'{df['id']}' in parents and mimeType = 'application/pdf'"
            pdfs = service.files().list(q=q_pdfs, fields="files(id, name)").execute().get('files', [])
            for p in pdfs:
                all_files.append({"godina": year['name'], "tip": df['name'], "ime": p['name'], "id": p['id']})
    
    return {"status": "success", "count": len(all_files), "files": all_files}

@app.post("/api/simulate")
def calc(r: SimReq):
    t_hot = r.target_temp; t_amb = r.ambient_temp
    temps = [t_hot]
    for _ in range(3):
        total_r = 0.12
        r_vals = []
        for i, l in enumerate(r.layers):
            t_mean = (temps[i] if i < len(temps) else t_hot) * 0.9 
            lam = (l.lambda_val or 1.0) * (1 + (t_mean/2000)*0.1)
            res = (l.thickness/1000.0) / lam
            r_vals.append(res); total_r += res
        flux = (t_hot - t_amb) / total_r
        curr = t_hot; temps = [curr]
        for rv in r_vals: curr -= flux * rv; temps.append(curr)

    bom = []; tw = 0; tc = 0
    for i, l in enumerate(r.layers):
        w = (l.thickness/1000.0) * l.density # Pojednostavljeno za ravan zid
        bom.append({"name":l.material, "th":l.thickness, "temp":round(temps[i+1]), "w":round(w,1), "cost":round(w/1000*l.price,1)})
        tw += w; tc += w/1000*l.price

    return {"shell_temp": round(temps[-1], 1), "bom": bom, "total_weight": round(tw, 1), "total_cost": round(tc, 1)}

@app.get("/", response_class=HTMLResponse)
def root(): 
    if os.path.exists("dashboard.html"): return open("dashboard.html", encoding="utf-8").read()
    return "MOLTY PRO API LIVE"

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
