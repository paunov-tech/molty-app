import os, math, re, PyPDF2, sqlite3, json, io
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
from fpdf import FPDF
from datetime import datetime

# Google Drive biblioteke
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

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
        c.execute('''CREATE TABLE IF NOT EXISTS sales_analytics
                     (id INTEGER PRIMARY KEY AUTOINCREMENT,
                      file_id TEXT UNIQUE, client_name TEXT, 
                      doc_date TEXT, material_name TEXT, 
                      quantity REAL, price_per_unit REAL, total_val REAL)''')
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"DB Error: {e}")

init_db()

# --- MODELI ZA API ---
class Layer(BaseModel):
    material: str; thickness: float; lambda_val: float; density: float; price: float
class SimReq(BaseModel):
    metal: str; target_temp: float; ambient_temp: float; layers: List[Layer]; geometry: dict; client: Optional[str] = ""

# --- POMOĆNE FUNKCIJE ---
def get_drive_service():
    try:
        creds_json = os.getenv("GOOGLE_CREDENTIALS")
        if not creds_json: return None
        info = json.loads(creds_json)
        creds = service_account.Credentials.from_service_account_info(info)
        return build('drive', 'v3', credentials=creds)
    except Exception as e:
        print(f"Drive Auth Error: {e}"); return None

def get_mats():
    global CACHED_MATERIALS
    if CACHED_MATERIALS: return CACHED_MATERIALS
    mats = [{"name": "STEEL SHELL (S235)", "density": 7850, "lambda_val": 50.0, "price": 1000},
            {"name": "AIR GAP", "density": 1, "lambda_val": 0.05, "price": 0}]
    CACHED_MATERIALS = sorted(mats, key=lambda x: x["name"])
    return CACHED_MATERIALS

# --- API RUTE ---
@app.get("/api/init")
def init_data():
    return {"materials": get_mats(), "metals": {"Celik": 1510, "Aluminijum": 660}, "clients": ["METALFER", "HBIS", "ZIJIN"]}

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
    if not service: return {"status": "error", "message": "Auth error"}
    q_years = f"'{folder_id}' in parents and mimeType = 'application/vnd.google-apps.folder'"
    years = service.files().list(q=q_years, fields="files(id, name)").execute().get('files', [])
    all_files = []
    for year in years:
        q_docs = f"'{year['id']}' in parents and (name contains 'Fakture' or name contains 'Racuni' or name contains 'Ponude')"
        doc_folders = service.files().list(q=q_docs, fields="files(id, name)").execute().get('files', [])
        for df in doc_folders:
            q_pdfs = f"'{df['id']}' in parents and mimeType = 'application/pdf'"
            pdfs = service.files().list(q=q_pdfs, fields="files(id, name)").execute().get('files', [])
            for p in pdfs:
                all_files.append({"godina": year['name'], "tip": df['name'], "ime": p['name'], "id": p['id']})
    return {"status": "success", "count": len(all_files), "files": all_files}

@app.get("/api/drive/analyze-file/{file_id}")
def analyze_file(file_id: str, client_name: str = "Nepoznat"):
    service = get_drive_service()
    if not service: return {"status": "error", "message": "Auth error"}
    try:
        request = service.files().get_media(fileId=file_id)
        file_io = io.BytesIO(request.execute())
        pdf_reader = PyPDF2.PdfReader(file_io)
        full_text = "".join([p.extract_text() or "" for p in pdf_reader.pages])
        w_m = re.search(r"(\d+[.,]?\d*)\s*(t|tn|tona|kg)", full_text, re.IGNORECASE)
        p_m = re.search(r"(\d+[.,]?\d*)\s*(EUR|€|USD|\$)", full_text, re.IGNORECASE)
        res = {"weight": float(w_m.group(1).replace(",", ".")) if w_m else 0, "price": float(p_m.group(1).replace(",", ".")) if p_m else 0, "date": datetime.now().strftime("%Y-%m-%d")}
        conn = sqlite3.connect(DB_FILE); c = conn.cursor()
        c.execute("INSERT OR IGNORE INTO sales_analytics (file_id, client_name, doc_date, material_name, quantity, price_per_unit, total_val) VALUES (?,?,?,?,?,?,?)", (file_id, client_name, res['date'], "MATERIJAL", res['weight'], res['price'], res['weight']*res['price']))
        conn.commit(); conn.close()
        return {"status": "success", "extracted": res}
    except Exception as e: return {"status": "error", "message": str(e)}

@app.post("/api/simulate")
def simulate(r: SimReq):
    return {"shell_temp": 150, "bom": [], "total_weight": 0, "total_cost": 0}

@app.get("/", response_class=HTMLResponse)
def root(): 
    if os.path.exists("dashboard.html"): return open("dashboard.html", encoding="utf-8").read()
    return "MOLTY PRO API LIVE"

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
