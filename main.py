<<<<<<< HEAD
import os, math, re, PyPDF2, json, psycopg2
=======
import os, math, re, PyPDF2, sqlite3, json, io
>>>>>>> c2306dd482351ab7be04e63acadd862f703f3ace
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from typing import List, Optional
<<<<<<< HEAD
=======
import uvicorn
from fpdf import FPDF
>>>>>>> c2306dd482351ab7be04e63acadd862f703f3ace
from datetime import datetime
from psycopg2.extras import RealDictCursor

# Google Drive biblioteke
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

<<<<<<< HEAD
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
=======
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
        # Projekti (Tehnički deo)
        c.execute('''CREATE TABLE IF NOT EXISTS projects
                     (id INTEGER PRIMARY KEY AUTOINCREMENT,
                      client TEXT, date TEXT, metal TEXT,
                      total_weight REAL, total_cost REAL, data TEXT)''')
        
        # Analitika (Komercijalni deo)
        c.execute('''CREATE TABLE IF NOT EXISTS sales_analytics
                     (id INTEGER PRIMARY KEY AUTOINCREMENT,
                      file_id TEXT UNIQUE, client_name TEXT, 
                      doc_date TEXT, material_name TEXT, 
                      quantity REAL, price_per_unit REAL, total_val REAL)''')
        
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"DB Error: {e}")

# OBAVEZNO POZIVAMO BAZU PRI STARTU
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

# --- API RUTE ---

@app.get("/api/init")
def init_data():
    return {"materials": get_mats(), "metals": {
        "Celik (Low C)": 1510, "Sivi Liv": 1200, "Nodularni Liv": 1150,
        "Bakar": 1085, "Mesing": 930, "Bronza": 950, "Aluminijum": 660
    }, "clients": ["METALFER", "HBIS GROUP", "ZIJIN BOR", "US STEEL", "ARCELLOR MITTAL"]}

# DRIVE: Osnovni scan
@app.get("/api/drive/test-scan")
def test_drive_scan():
    service = get_drive_service()
    if not service: return {"status": "error", "message": "Auth error"}
    query = f"'{ROOT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder'"
    results = service.files().list(q=query, fields="files(id, name)").execute().get('files', [])
    return {"status": "success", "found_clients": results}

# DRIVE: Duboki scan
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

# --- NOVO: AI ANALITIČAR ---
@app.get("/api/drive/analyze-file/{file_id}")
def analyze_file(file_id: str, client_name: str = "Nepoznat"):
    service = get_drive_service()
    if not service: return {"status": "error", "message": "Auth error"}
    try:
        request = service.files().get_media(fileId=file_id)
        file_io = io.BytesIO(request.execute())
        
        pdf_reader = PyPDF2.PdfReader(file_io)
        full_text = ""
        for page in pdf_reader.pages:
            full_text += page.extract_text() or ""

        # AI LOGIKA - Ekstrakcija podataka
        weight_match = re.search(r"(\d+[.,]?\d*)\s*(t|tn|tona|kg)", full_text, re.IGNORECASE)
        price_match = re.search(r"(\d+[.,]?\d*)\s*(EUR|€|USD|\$)", full_text, re.IGNORECASE)
        
        res = {
            "weight": float(weight_match.group(1).replace(",", ".")) if weight_match else 0,
            "price": float(price_match.group(1).replace(",", ".")) if price_match else 0,
            "date": datetime.now().strftime("%Y-%m-%d")
        }

        # Upis u bazu za dashboard
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute("""INSERT OR IGNORE INTO sales_analytics 
                     (file_id, client_name, doc_date, material_name, quantity, price_per_unit, total_val) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)""",
                  (file_id, client_name, res['date'], "MATERIJAL", res['weight'], res['price'], res['weight']*res['price']))
        conn.commit()
        conn.close()
        return {"status": "success", "extracted": res}
    except Exception as e:
        return {"status": "error", "message": str(e)}
>>>>>>> c2306dd482351ab7be04e63acadd862f703f3ace

@app.post("/api/simulate")
def simulate(r: SimReq):
    # TVOJA LOGIKA KALKULACIJE
    t_hot = r.target_temp; t_amb = r.ambient_temp
    temps = [t_hot]
<<<<<<< HEAD
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
=======
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
        w = (l.thickness/1000.0) * l.density
        bom.append({"name":l.material, "th":l.thickness, "temp":round(temps[i+1]), "w":round(w,1), "cost":round(w/1000*l.price,1)})
        tw += w; tc += w/1000*l.price

    return {"shell_temp": round(temps[-1], 1), "bom": bom, "total_weight": round(tw, 1), "total_cost": round(tc, 1)}

@app.get("/", response_class=HTMLResponse)
def root(): 
    if os.path.exists("dashboard.html"): return open("dashboard.html", encoding="utf-8").read()
    return "MOLTY PRO API LIVE"

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
>>>>>>> c2306dd482351ab7be04e63acadd862f703f3ace
