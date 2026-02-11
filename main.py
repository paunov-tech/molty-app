import os, math, re, PyPDF2, sqlite3, json, io
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import List
import uvicorn

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Putanja do tvog foldera sa TDS-ovima
TDS_PATH = "tehnicki_listovi"

def get_materials_from_folder():
    """Skenira folder tehnicki_listovi i izvlači podatke iz PDF-ova"""
    mats = [
        {"name": "STEEL SHELL", "density": 7850, "lambda_val": 50.0, "price": 1000},
        {"name": "AIR GAP", "density": 1, "lambda_val": 0.05, "price": 0}
    ]
    
    if not os.path.exists(TDS_PATH):
        os.makedirs(TDS_PATH) # Pravi folder ako ne postoji
        return mats

    for file in os.listdir(TDS_PATH):
        if file.endswith(".pdf"):
            try:
                with open(os.path.join(TDS_PATH, file), "rb") as f:
                    reader = PyPDF2.PdfReader(f)
                    text = "".join([p.extract_text() or "" for p in reader.pages]).upper()
                    
                    # Regex za izvlačenje Gustine (tražimo npr. 2950 kg/m3 ili 2.95 g/cm3)
                    den_match = re.search(r"(\d+[.,]?\d*)\s*(KG/M3|G/CM3)", text)
                    density = 2500 # Default
                    if den_match:
                        val = float(den_match.group(1).replace(",", "."))
                        density = val if val > 100 else val * 1000
                    
                    # Lambda (tražimo npr. 1.45 W/mK)
                    lam_match = re.search(r"(\d+[.,]?\d*)\s*(W/MK|W/M K)", text)
                    lambda_val = float(lam_match.group(1).replace(",", ".")) if lam_match else 1.2
                    
                    mats.append({
                        "name": file.replace(".pdf", "").upper(),
                        "density": int(density),
                        "lambda_val": lambda_val,
                        "price": 950 # Ovo možeš ručno menjati ili dodati u bazu
                    })
            except Exception as e:
                print(f"Greška kod fajla {file}: {e}")
    return mats

@app.get("/api/init")
def init_data():
    return {
        "materials": get_materials_from_folder(),
        "metals": {"Celik": 1510, "Sivi liv": 1200, "Nodularni liv": 1150, "Bakar": 1085},
        "status": "online"
    }

# --- Ostatak simulacije i Drive skeniranja ostaje isti kao u stabilnoj verziji ---
@app.get("/", response_class=HTMLResponse)
def root():
    return open("dashboard.html", encoding="utf-8").read()
