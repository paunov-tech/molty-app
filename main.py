import os, math, re, PyPDF2, json, psycopg2
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from psycopg2.extras import RealDictCursor

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# --- POVEZIVANJE SA PRO BAZOM ---
DB_URL = os.environ.get("DATABASE_URL")

def get_db_conn():
    return psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)

def init_db():
    conn = get_db_conn(); c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS projects
                 (id SERIAL PRIMARY KEY, client TEXT, date TEXT, metal TEXT, 
                  total_weight REAL, total_cost REAL, data JSONB)''')
    conn.commit(); c.close(); conn.close()

# Inicijalizacija pri paljenju
if DB_URL:
    init_db()

# --- GLOBALNI KES ZA MATERIJALE (Da ne bi cekao 4 minuta) ---
CACHED_MATERIALS = []

def load_materials_once():
    global CACHED_MATERIALS
    if CACHED_MATERIALS: return CACHED_MATERIALS
    
    mats = [{"name": "STEEL SHELL (S235)", "density": 7850, "lambda_val": 50.0, "price": 1000},
            {"name": "AIR GAP", "density": 1, "lambda_val": 0.05, "price": 0}]
    
    tds_path = os.path.join(os.getcwd(), "tds")
    if os.path.exists(tds_path):
        for f in os.listdir(tds_path):
            if f.lower().endswith(".pdf"):
                mats.append({"name": f[:-4].upper(), "density": 2300, "lambda_val": 1.5, "price": 850})
    
    CACHED_MATERIALS = sorted(mats, key=lambda x: x["name"])
    return CACHED_MATERIALS

# --- API RUTE ---
from fastapi.responses import FileResponse

@app.get("/", response_class=HTMLResponse)
def root():
    # Pokušavamo da nađemo dashboard.html u root folderu
    file_path = os.path.join(os.getcwd(), "dashboard.html")
    if os.path.exists(file_path):
        return FileResponse(file_path)
    return "<h1>Greška: dashboard.html nije pronađen na serveru!</h1>"
    }

@app.post("/api/db/save")
def save_project(r: dict):
    conn = get_db_conn(); c = conn.cursor()
    c.execute("INSERT INTO projects (client, date, metal, data) VALUES (%s, %s, %s, %s)",
              (r.get('client'), datetime.now().strftime("%Y-%m-%d"), r.get('metal'), json.dumps(r)))
    conn.commit(); c.close(); conn.close()
    return {"status": "success"}

@app.get("/api/db/list")
def list_projects():
    conn = get_db_conn(); c = conn.cursor()
    c.execute("SELECT id, client, date, metal FROM projects ORDER BY id DESC")
    rows = c.fetchall(); c.close(); conn.close()
    return rows
