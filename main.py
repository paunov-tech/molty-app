from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from typing import List, Optional
import uvicorn, os, math, re, PyPDF2, sqlite3, json
from fpdf import FPDF
from datetime import datetime
import openpyxl
from openpyxl.styles import Font, PatternFill, Border, Side, Alignment

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# --- KONFIGURACIJA (SQLite + tvoj folder) ---
PDF_FOLDER = os.path.join(os.getcwd(), "tehnicki_listovi")
DB_FILE = "molty.db"

# --- GLOBALNA PROMENLJIVA ZA KESIRANJE ---
CACHED_MATERIALS = [] 

# --- DATABASE INIT (SQLite) ---
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
    except: pass

init_db()

# --- DATA MOCK ---
CLIENTS_DB = ["METALFER STEEL MILL", "HBIS GROUP", "ZIJIN BOR COPPER", "US STEEL KOSICE", "ARCELLOR MITTAL"]
METALS_DB = {
    "Celik (Low C)": 1510, "Sivi Liv": 1200, "Nodularni Liv": 1150,
    "Bakar": 1085, "Mesing": 930, "Bronza": 950, "Aluminijum": 660
}

# --- OVO JE UNIVERZALNO RESENJE ---
def get_mats():
    global CACHED_MATERIALS
    
    # 1. KESIRANJE (Brzina)
    if CACHED_MATERIALS:
        return CACHED_MATERIALS

    # 2. DEFAULT LISTA
    mats = [{"name": "STEEL SHELL (S235)", "density": 7850, "lambda_val": 50.0, "price": 1000},
            {"name": "AIR GAP", "density": 1, "lambda_val": 0.05, "price": 0}]
    
    # 3. DETEKTIV ZA FOLDER (Trazi gde su PDF-ovi)
    # Ovo resava dilemu "tds" ili "tehnicki_listovi" jednom zauvek
    possible_folders = ["tds", "tehnicki_listovi", "TDS", "Tehnicki_listovi"]
    
    found_folder = None
    cwd = os.getcwd()
    
    for f in possible_folders:
        full_path = os.path.join(cwd, f)
        if os.path.exists(full_path):
            found_folder = full_path
            break
            
    # 4. UCITAVANJE (Ako smo nasli folder)
    if found_folder:
        print(f"BINGO! Nasao sam materijale u: {found_folder}")
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
                    # Fallback samo na ime fajla ako PDF pukne
                    try: mats.append({"name": f[:-4].upper(), "density": 2300, "lambda_val": 1.5, "price": 800})
                    except: pass
    
    # 5. SACUVAJ U MEMORIJU
    CACHED_MATERIALS = sorted(mats, key=lambda x: x["name"])
    return CACHED_MATERIALS
# --- MODELS ---
class Layer(BaseModel):
    material: str; thickness: float; lambda_val: float; density: float; price: float
class SimReq(BaseModel):
    metal: str; target_temp: float; ambient_temp: float; layers: List[Layer]; geometry: dict; client: Optional[str] = ""
class ExpReq(BaseModel):
    bom: List[dict]; total_weight: float; total_cost: float; shell_temp: float; heat_flux: float; client: str

# --- API ROUTES ---
@app.get("/api/init")
def init_data():
    return {"materials": get_mats(), "metals": METALS_DB, "clients": CLIENTS_DB}

@app.post("/api/db/save")
def save_project(r: SimReq):
    try:
        w = sum([l.thickness * l.density for l in r.layers])
        cost = sum([l.price for l in r.layers])
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute("INSERT INTO projects (client, date, metal, total_weight, total_cost, data) VALUES (?, ?, ?, ?, ?, ?)",
                  (r.client, datetime.now().strftime("%Y-%m-%d %H:%M"), r.metal, w, cost, json.dumps(r.dict())))
        conn.commit()
        lid = c.lastrowid
        conn.close()
        return {"status": "saved", "id": lid}
    except: return {"status": "error"}

@app.get("/api/db/list")
def list_projects():
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT id, client, date, metal FROM projects ORDER BY id DESC")
        rows = c.fetchall()
        conn.close()
        return rows
    except: return []

@app.get("/api/db/load/{pid}")
def load_project(pid: int):
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT data FROM projects WHERE id=?", (pid,))
        row = c.fetchone()
        conn.close()
        return json.loads(row['data']) if row else {}
    except: return {}

@app.post("/api/simulate")
def calc(r: SimReq):
    t_hot = r.target_temp; t_amb = r.ambient_temp
    temps = [t_hot]
    
    # 1. Iteracija
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

    bom = []; acc_th = 0; cid = r.geometry.get('dim2', 0); tw = 0; tc = 0
    liquidus = METALS_DB.get(r.metal, 0)
    freeze_depth = -1
    
    # 2. Finalni proracun
    for i, l in enumerate(r.layers):
        if i+1 < len(temps):
            if temps[i] >= liquidus and temps[i+1] <= liquidus:
                ratio = (temps[i] - liquidus) / (temps[i] - temps[i+1])
                freeze_depth = acc_th + (l.thickness * ratio)
        acc_th += l.thickness

        w = 0
        dim1 = r.geometry.get('dim1', 1)
        
        if r.geometry.get('type') == 'cylinder':
            od = cid + 2*l.thickness
            w = math.pi * dim1 * ((od/1000/2)**2 - (cid/1000/2)**2) * l.density
            bom.append({"name":l.material, "th":l.thickness, "temp":round(temps[i+1]), "id":round(cid), "od":round(od), "w":round(w,1), "cost":round(w/1000*l.price,1)})
            cid = od
        else:
            w = dim1 * (l.thickness/1000.0) * l.density
            bom.append({"name":l.material, "th":l.thickness, "temp":round(temps[i+1]), "id":"-", "od":"-", "w":round(w,1), "cost":round(w/1000*l.price,1)})
        tw += w; tc += w/1000*l.price

    status = "SAFE"
    if freeze_depth < 0: status = "CRITICAL (Proboj)"
    elif freeze_depth > (acc_th - (bom[-1]['th'] if bom else 0)): status = "WARNING (Plašt)"

    return {
        "shell_temp": round(temps[-1], 1), "heat_flux": round(flux, 1),
        "profile": [{"pos": 0, "temp": t_hot}] + [{"pos": sum(x['th'] for x in bom[:i+1]), "temp": t} for i,t in enumerate(temps[1:])],
        "bom": bom, "total_weight": round(tw, 1), "total_cost": round(tc, 1),
        "liquidus": liquidus, "freeze_depth": round(freeze_depth, 1) if freeze_depth > 0 else -1, 
        "safety": status,
        "req_shell": round(cid) if r.geometry.get('type')=='cylinder' else "-"
    }

# --- EXPORT ---
@app.post("/api/export-excel")
def excel(d: ExpReq):
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Specifikacija"
    ws.append(["PROJEKAT:", d.client, "DATUM:", datetime.now().strftime("%Y-%m-%d")])
    ws.append(["POZICIJA", "MATERIJAL", "DEBLJINA", "TEMP", "KG", "EUR"])
    for i, r in enumerate(d.bom, 1):
        ws.append([i, r['name'], r['th'], r['temp'], r['w'], r['cost']])
    ws.append(["TOTAL", "", "", "", d.total_weight, f"=SUM(F3:F{2+len(d.bom)})"])
    wb.save("spec.xlsx"); return FileResponse("spec.xlsx", filename="spec.xlsx")

@app.post("/api/export-pdf")
def pdf(d: ExpReq):
    pdf = FPDF(); pdf.add_page(); pdf.set_font("Arial","B",16); pdf.cell(0,10,f"PROJECT: {d.client}",0,1)
    pdf.set_font("Arial","",12); pdf.cell(0,10,f"Total Weight: {d.total_weight} kg",0,1)
    pdf.output("r.pdf"); return FileResponse("r.pdf", filename="report.pdf")

@app.get("/", response_class=HTMLResponse)
def root(): 
    if os.path.exists("dashboard.html"): return open("dashboard.html", encoding="utf-8").read()
    return "Error"

if __name__ == "__main__": uvicorn.run(app, host="0.0.0.0", port=8000)
