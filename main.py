import os, math, re, PyPDF2, json, psycopg2
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from psycopg2.extras import RealDictCursor

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DB_URL = os.environ.get("DATABASE_URL")

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

@app.get("/api/init")
def init_data():
    return {
        "materials": load_materials_once(),
        "metals": {"Celik (Low C)": 1510, "Bakar": 1085, "Aluminijum": 660},
        "clients": ["METALFER STEEL MILL", "HBIS GROUP", "ZIJIN BOR"]
    }

@app.get("/", response_class=HTMLResponse)
def root():
    file_path = os.path.join(os.getcwd(), "dashboard.html")
    if os.path.exists(file_path):
        return FileResponse(file_path)
    return "<h1>Greska: dashboard.html nije pronadjen!</h1>"

# Ostale rute (save/list) ostaju iste...
