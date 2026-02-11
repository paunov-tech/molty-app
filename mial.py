from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel
from typing import List
import uvicorn
import os
import math
import re
import PyPDF2
from fpdf import FPDF
from datetime import datetime

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- SKENER I SETUP ---
BACKUP_MATERIALS = [
    {"name": "CALDE CAST F 60", "density": 2450, "lambda_val": 1.45, "price": 950},
    {"name": "CALDE INSUL 1000", "density": 800, "lambda_val": 0.22, "price": 450},
]

CURRENT_DIR = os.getcwd()
PDF_FOLDER = os.path.join(CURRENT_DIR, "tehnicki_listovi")

def get_all_materials():
    materials = []
    if os.path.exists(PDF_FOLDER):
        for filename in os.listdir(PDF_FOLDER):
            if filename.lower().endswith(".pdf"):
                try:
                    mat_name = filename[:-4].replace("_", " ").replace("-", " ")
                    den, lam, price = 2400, 1.5, 800 
                    reader = PyPDF2.PdfReader(os.path.join(PDF_FOLDER, filename))
                    if len(reader.pages) > 0:
                        text = reader.pages[0].extract_text() or ""
                        dm = re.search(r"(\d+[.,]\d+)\s*(g/cm3|kg/dm3|kg/m3)", text)
                        if dm: 
                            val = float(dm.group(1).replace(",", "."))
                            den = val * 1000 if val < 10 else val
                        if den < 1500: lam, price = 0.25, 450
                        elif den > 2700: lam, price = 2.2, 1200
                    materials.append({"name": mat_name, "density": int(den), "lambda_val": lam, "price": price})
                except: materials.append({"name": filename[:-4], "density": 2400, "lambda_val": 1.5, "price": 800})
    if len(materials) < 5: materials.extend(BACKUP_MATERIALS)
    unique = {m['name']: m for m in materials}.values()
    return sorted(list(unique), key=lambda x: x["name"])

CACHED_MATERIALS = get_all_materials()

# --- MODELI ---
class Layer(BaseModel):
    material: str
    thickness: float
    lambda_val: float
    density: float
    price: float

class Geometry(BaseModel):
    type: str; dim1: float; dim2: float

class SimReq(BaseModel):
    target_temp: float; ambient_temp: float
    layers: List[Layer]; geometry: Geometry

# --- LOGIKA ---
@app.post("/api/simulate")
def calculate(req: SimReq):
    # 1. Termika
    total_r = 0.1
    for l in req.layers:
        total_r += (l.thickness/1000.0) / (l.lambda_val if l.lambda_val>0 else 1)
    flux = (req.target_temp - req.ambient_temp) / total_r
    
    curr = req.target_temp; profile = [{"pos":0, "temp":round(curr)}]; temps = []
    acc = 0
    for l in req.layers:
        curr -= flux * ((l.thickness/1000.0)/(l.lambda_val if l.lambda_val>0 else 1))
        acc += l.thickness
        profile.append({"pos":acc, "temp":round(curr)})
        temps.append(round(curr))
    
    # 2. Geometrija
    bom = []; tw = 0; tc = 0
    if req.geometry.type == "cylinder":
        L_m = req.geometry.dim1; curr_id = req.geometry.dim2
        for i, l in enumerate(req.layers):
            od = curr_id + 2*l.thickness
            vol = (math.pi * L_m * ((od/1000)**2 - (curr_id/1000)**2))/4
            w = vol * l.density; c = (w/1000)*l.price
            bom.append({"name":l.material, "th":l.thickness, "temp":temps[i], "id":round(curr_id), "od":round(od), "w":round(w,1), "cost":round(c,1)})
            tw+=w; tc+=c; curr_id=od
    else:
        A = req.geometry.dim1
        for i, l in enumerate(req.layers):
            vol = A * (l.thickness/1000)
            w = vol * l.density; c = (w/1000)*l.price
            bom.append({"name":l.material, "th":l.thickness, "temp":temps[i], "id":"-", "od":"-", "w":round(w,1), "cost":round(c,1)})
            tw+=w; tc+=c

    return {"shell_temp": round(curr,1), "heat_flux": round(flux,1), "profile": profile, "bom": bom, "total_weight": round(tw,1), "total_cost": round(tc,1), "req_shell": bom[-1]["od"] if req.geometry.type=="cylinder" else "-"}

# --- PDF EXPORT (ISPRAVLJEN) ---
class PDFReq(BaseModel):
    bom: List[dict]; total_weight: float; total_cost: float; shell_temp: float; flux: float

def clean_text(text):
    # Menja naša slova u engleska da PDF ne pukne
    replacements = {'č': 'c', 'ć': 'c', 'ž': 'z', 'š': 's', 'đ': 'dj', 'Č': 'C', 'Ć': 'C', 'Ž': 'Z', 'Š': 'S', 'Đ': 'Dj'}
    for k, v in replacements.items():
        text = text.replace(k, v)
    return text.encode('latin-1', 'replace').decode('latin-1')

@app.post("/api/export-pdf")
def export_pdf(data: PDFReq):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", "B", 16)
    pdf.cell(0, 10, "MOLTY CALC REPORT", 0, 1, "C")
    
    pdf.set_font("Arial", "", 10)
    pdf.cell(0, 10, f"Date: {datetime.now().strftime('%Y-%m-%d')}", 0, 1, "C")
    pdf.ln(10)
    
    # Header
    pdf.set_font("Arial", "B", 9)
    pdf.set_fill_color(220, 220, 220)
    
    # Prilagođene širine kolona da sve stane
    pdf.cell(80, 10, "Material", 1, 0, "C", True)
    pdf.cell(20, 10, "Thk(mm)", 1, 0, "C", True)
    pdf.cell(25, 10, "Temp(C)", 1, 0, "C", True)
    pdf.cell(30, 10, "Weight(kg)", 1, 0, "C", True)
    pdf.cell(30, 10, "Cost(EUR)", 1, 1, "C", True) # 1 na kraju znači novi red
    
    # Podaci
    pdf.set_font("Arial", "", 9)
    for row in data.bom:
        name = clean_text(row['name'])[:35] # Skrati ime ako je predugo
        pdf.cell(80, 8, name, 1)
        pdf.cell(20, 8, str(row['th']), 1, 0, "R")
        pdf.cell(25, 8, str(row['temp']), 1, 0, "R")
        pdf.cell(30, 8, str(row['w']), 1, 0, "R")
        pdf.cell(30, 8, str(row['cost']), 1, 1, "R")

    pdf.ln(10)
    pdf.set_font("Arial", "B", 12)
    pdf.cell(0, 10, f"TOTAL WEIGHT: {data.total_weight} kg", 0, 1)
    pdf.cell(0, 10, f"TOTAL COST: {data.total_cost} EUR", 0, 1)
    pdf.cell(0, 10, f"SHELL TEMP: {data.shell_temp} C", 0, 1)
    
    filename = "report.pdf"
    pdf.output(filename)
    return FileResponse(filename, filename="molty_report.pdf", media_type='application/pdf')

@app.get("/api/materials")
def get_mats(): return CACHED_MATERIALS

@app.get("/", response_class=HTMLResponse)
def root():
    try:
        with open("dashboard.html", "r", encoding="utf-8") as f: return f.read()
    except: return "<h1>Error: Missing dashboard.html</h1>"

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
