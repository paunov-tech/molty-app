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

TDS_PATH = "tehnicki_listovi"
DB_FILE = "molty.db"
ROOT_FOLDER_ID = os.getenv("ROOT_FOLDER_ID", "1zsDeckOseY0gMerBHU8nG0p-qKXDV8bN")

def get_mats_from_tds():
    """Skenira folder tehnicki_listovi i pravi listu materijala na osnovu PDF specifikacija"""
    mats = [
        {"name": "STEEL SHELL", "density": 7850, "lambda_val": 50.0, "price": 1000},
        {"name": "AIR GAP", "density": 1, "lambda_val": 0.05, "price": 0}
    ]
    
    if not os.path.exists(TDS_PATH):
        os.makedirs(TDS_PATH)
        return mats

    for filename in os.listdir(TDS_PATH):
        if filename.lower().endswith(".pdf"):
            try:
                path = os.path.join(TDS_PATH, filename)
                with open(path, "rb") as f:
                    reader = PyPDF2.PdfReader(f)
                    text = "".join([p.extract_text() or "" for p in reader.pages]).upper()
                    
                    # Tražimo gustinu (kg/m3) - npr: 2950 kg/m3 ili 2.95 g/cm3
                    density_match = re.search(r"(\d+[.,]?\d*)\s*(KG/M3|G/CM3)", text)
                    den = 2500 
                    if density_match:
                        val = float(density_match.group(1).replace(",", "."))
                        den = val if val > 100 else val * 1000
                    
                    # Tražimo Lambdu (W/mK) - npr: 1.45 W/mK
                    lam_match = re.search(r"(\d+[.,]?\d*)\s*(W/MK|W/M K)", text)
                    l_val = float(lam_match.group(1).replace(",", ".")) if lam_match else 1.2
                    
                    mats.append({
                        "name": filename.replace(".pdf", "").upper(),
                        "density": int(den),
                        "lambda_val": l_val,
                        "price": 900
                    })
            except Exception as e:
                print(f"Greška pri čitanju {filename}: {e}")
                
    return sorted(mats, key=lambda x: x["name"])

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
        "metals": {"Celik (Low C)": 1510, "Sivi Liv": 1200, "Nodularni Liv": 1150, "Bakar": 1085}
    }

@app.get("/api/drive/test-scan")
def test_drive_scan():
    service = get_drive_service()
    if not service: return {"status": "error"}
    query = f"'{ROOT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder'"
    res = service.files().list(q=query, fields="files(id, name)").execute().get('files', [])
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
def analyze_file(file_id: str):
    service = get_drive_service()
    try:
        request = service.files().get_media(fileId=file_id)
        f_io = io.BytesIO(request.execute())
        reader = PyPDF2.PdfReader(f_io)
        txt = "".join([p.extract_text() or "" for p in reader.pages]).upper()
        mat = next((m for m in ["MAGNIT", "ALKON", "BARYT", "CALDE"] if m in txt), "NEPOZNATO")
        w = re.search(r"(\d+[.,]?\d*)\s*(T|TN|TONA|KG)", txt)
        p = re.search(r"(\d+[.,]?\d*)\s*(EUR|€|USD|\$)", txt)
        return {"status": "success", "extracted": {"material": mat, "weight": w.group(1).replace(",", ".") if w else "0", "price": p.group(1).replace(",", ".") if p else "0"}}
    except Exception as e: return {"status": "error", "message": str(e)}

@app.post("/api/simulate")
def simulate(r: SimReq):
    total_r = 0.12; tw = 0; tc = 0; bom = []
    for l in r.layers:
        total_r += (l.thickness/1000) / (l.lambda_val if l.lambda_val > 0 else 0.01)
        w = (l.thickness/1000) * l.density
        cost = (w/1000) * l.price
        tw += w; tc += cost
        bom.append({"name": l.material, "th": l.thickness, "w": round(w, 1), "cost": round(cost, 1)})
    flux = (r.target_temp - r.ambient_temp) / total_r
    shell_t = r.ambient_temp + (flux * 0.12)
    return {"shell_temp": round(shell_t, 1), "total_weight": round(tw, 1), "total_cost": round(tc, 1), "bom": bom}

@app.get("/", response_class=HTMLResponse)
def root(): return open("dashboard.html", encoding="utf-8").read()
