"""
MOLTY PRO V3.2 — Čist Backend (FastAPI)
========================================
Autor: Claude (Handoff od Gemini projekta)
Opis: Centralni server za MOLTY platformu.
  - Google Drive skeniranje (fakture/ponude >= 2020)
  - SQLite baza (sales_analytics)
  - Inženjerski proračuni (toplotni fluks)
  - REST API za dashboard
"""

import os
import json
import re
import sqlite3
import math
import logging
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# ──────────────────────────────────────────────
# Logging
# ──────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("molty")

# ──────────────────────────────────────────────
# Konstante
# ──────────────────────────────────────────────
DB_PATH = "molty.db"
DRIVE_ROOT_ID = "1zsDeckOseY0gMerBHU8nG0p-qKXDV8bN"
MIN_YEAR = 2020

# Poznati klijenti (MOLTY 18 kupaca + prošireni spisak)
KNOWN_CLIENTS = [
    "AMZ", "Autoflex", "Bamex", "BamexMetalBG", "BergMontana",
    "Cimos", "Cranfield", "FerroPreis", "HBIS", "Lafarge BFC",
    "Livar", "LivarnaGorica", "MIV", "Moravacem", "OSSAM",
    "Progress", "Valji", "ValjaonicaSevojno", "Metalfer",
    "LTH Ohrid", "Impol Seval", "INA", "ArcelorMittal Zenica"
]

# Poznati materijali (Calderys portfolio)
KNOWN_MATERIALS = [
    "Magnit", "Alkon", "Caldercast", "Caldergun", "Caldermix",
    "Calderflow", "Caldertrowel", "Calderpatch", "Ermag", "Erspin",
    "Silica Mix", "Calderplast", "Calde", "Refracast", "Refragun"
]


# ──────────────────────────────────────────────
# SQLite Inicijalizacija
# ──────────────────────────────────────────────
def init_db():
    """Kreira tabelu sales_analytics ako ne postoji."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sales_analytics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id TEXT UNIQUE,
            client_name TEXT,
            material_name TEXT,
            total_val REAL,
            invoice_date TEXT,
            file_name TEXT,
            folder_path TEXT,
            scan_date TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.commit()
    conn.close()
    logger.info("✅ Baza inicijalizovana: %s", DB_PATH)


def get_db():
    """Vraća SQLite konekciju sa row_factory."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ──────────────────────────────────────────────
# Google Drive Servis
# ──────────────────────────────────────────────
_drive_service = None


def get_drive_service():
    """Lazy inicijalizacija Google Drive servisa iz env varijable."""
    global _drive_service
    if _drive_service is not None:
        return _drive_service

    creds_json = os.environ.get("GOOGLE_CREDENTIALS")
    if not creds_json:
        logger.warning("⚠️ GOOGLE_CREDENTIALS nije postavljeno. Drive funkcije neće raditi.")
        return None

    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build

        creds_info = json.loads(creds_json)
        credentials = service_account.Credentials.from_service_account_info(
            creds_info,
            scopes=["https://www.googleapis.com/auth/drive.readonly"]
        )
        _drive_service = build("drive", "v3", credentials=credentials)
        logger.info("✅ Google Drive servis inicijalizovan.")
        return _drive_service
    except Exception as e:
        logger.error("❌ Greška pri inicijalizaciji Drive servisa: %s", e)
        return None


def list_drive_folder(folder_id: str, mime_filter: str = None) -> list:
    """Lista fajlove/foldere u datom Drive folderu."""
    service = get_drive_service()
    if not service:
        return []

    query = f"'{folder_id}' in parents and trashed = false"
    if mime_filter:
        query += f" and mimeType = '{mime_filter}'"

    try:
        results = service.files().list(
            q=query,
            fields="files(id, name, mimeType, modifiedTime, size)",
            pageSize=200,
            orderBy="name"
        ).execute()
        return results.get("files", [])
    except Exception as e:
        logger.error("Drive list error za folder %s: %s", folder_id, e)
        return []


def extract_year_from_name(name: str) -> Optional[int]:
    """Pokušava da izvuče godinu iz naziva foldera."""
    match = re.search(r"(20[12]\d)", name)
    if match:
        return int(match.group(1))
    return None


def detect_client_name(path_parts: list) -> str:
    """Pokušava da detektuje ime klijenta iz putanje foldera."""
    for part in path_parts:
        for client in KNOWN_CLIENTS:
            if client.lower() in part.lower():
                return client
    return path_parts[0] if path_parts else "Nepoznat"


def detect_material(filename: str) -> str:
    """Pokušava da prepozna materijal iz naziva fajla."""
    name_lower = filename.lower()
    for mat in KNOWN_MATERIALS:
        if mat.lower() in name_lower:
            return mat
    return "Neidentifikovan"


async def deep_scan_drive(root_id: str = DRIVE_ROOT_ID) -> list:
    """
    Rekurzivno skenira Drive strukturu:
    Root -> Klijent -> Godina (>= 2020) -> Tip (Fakture/Ponude) -> PDF
    """
    service = get_drive_service()
    if not service:
        return []

    results = []
    client_folders = list_drive_folder(root_id, "application/vnd.google-apps.folder")

    for client_folder in client_folders:
        client_name = client_folder["name"]
        year_folders = list_drive_folder(client_folder["id"], "application/vnd.google-apps.folder")

        for year_folder in year_folders:
            year = extract_year_from_name(year_folder["name"])
            if year and year < MIN_YEAR:
                continue  # Preskoči stare godine

            type_folders = list_drive_folder(year_folder["id"], "application/vnd.google-apps.folder")

            for type_folder in type_folders:
                folder_type = type_folder["name"]
                pdf_files = list_drive_folder(type_folder["id"], "application/pdf")

                for pdf in pdf_files:
                    material = detect_material(pdf["name"])
                    results.append({
                        "file_id": pdf["id"],
                        "file_name": pdf["name"],
                        "client_name": detect_client_name([client_name]),
                        "material_name": material,
                        "folder_path": f"{client_name}/{year_folder['name']}/{folder_type}",
                        "modified": pdf.get("modifiedTime", ""),
                        "size": pdf.get("size", "0"),
                        "folder_type": folder_type
                    })

    logger.info("📂 Deep scan završen: %d dokumenata pronađeno.", len(results))
    return results


def save_scan_to_db(documents: list):
    """Čuva rezultate skena u SQLite bazu."""
    conn = get_db()
    cursor = conn.cursor()
    inserted = 0
    for doc in documents:
        try:
            cursor.execute("""
                INSERT OR REPLACE INTO sales_analytics
                (file_id, client_name, material_name, total_val, file_name, folder_path)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                doc["file_id"],
                doc["client_name"],
                doc["material_name"],
                0.0,  # total_val se popunjava kasnije iz PDF ekstrakcije
                doc["file_name"],
                doc["folder_path"]
            ))
            inserted += 1
        except Exception as e:
            logger.error("DB insert error: %s", e)
    conn.commit()
    conn.close()
    return inserted


# ──────────────────────────────────────────────
# Inženjerski Proračuni
# ──────────────────────────────────────────────
def calculate_heat_flux(
    t_in: float,
    t_amb: float,
    layers: list[dict],
    h_conv: float = 10.0
) -> dict:
    """
    Proračun toplotnog fluksa kroz višeslojni zid peći.
    
    Q = (T_in - T_amb) / (R_total + R_conv)
    
    R_total = Σ (d_i / λ_i)  — termički otpor slojeva
    R_conv  = 1 / h_conv      — konvektivni otpor
    
    Parametri:
        t_in    : Unutrašnja temperatura [°C]
        t_amb   : Ambijentalna temperatura [°C]
        layers  : Lista slojeva [{"name": str, "thickness_m": float, "lambda_w_mk": float}]
        h_conv  : Koeficijent konvekcije [W/m²K], default 10
    
    Vraća:
        dict sa Q, R_total, R_conv, T na svakom interfejsu
    """
    if not layers:
        raise ValueError("Morate definisati bar jedan sloj.")

    # Termički otpor slojeva
    r_total = 0.0
    layer_details = []
    for layer in layers:
        d = layer["thickness_m"]
        lam = layer["lambda_w_mk"]
        if lam <= 0:
            raise ValueError(f"Lambda mora biti > 0 za sloj '{layer['name']}'")
        r_layer = d / lam
        r_total += r_layer
        layer_details.append({
            "name": layer["name"],
            "thickness_mm": round(d * 1000, 1),
            "lambda": lam,
            "R": round(r_layer, 6)
        })

    # Konvektivni otpor
    r_conv = 1.0 / h_conv if h_conv > 0 else 0.0

    # Ukupni otpor
    r_total_system = r_total + r_conv

    # Toplotni fluks [W/m²]
    if r_total_system <= 0:
        raise ValueError("Ukupni termički otpor mora biti > 0.")
    q = (t_in - t_amb) / r_total_system

    # Temperaturni profil
    temperatures = [t_in]
    t_current = t_in
    for detail in layer_details:
        t_drop = q * detail["R"]
        t_current -= t_drop
        temperatures.append(round(t_current, 2))

    # Temperatura spoljne površine (pre konvekcije)
    t_surface = temperatures[-1]
    # Verifikacija: T_amb ≈ T_surface - Q * R_conv
    t_check = t_surface - q * r_conv

    return {
        "Q_w_m2": round(q, 2),
        "R_total_layers": round(r_total, 6),
        "R_convection": round(r_conv, 6),
        "R_total_system": round(r_total_system, 6),
        "T_inner_C": t_in,
        "T_ambient_C": t_amb,
        "T_surface_C": round(t_surface, 2),
        "temperature_profile_C": temperatures,
        "layers": layer_details,
        "h_conv": h_conv
    }


# ──────────────────────────────────────────────
# FastAPI Aplikacija
# ──────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: inicijalizuj bazu."""
    init_db()
    logger.info("🚀 MOLTY PRO V3.2 pokrenut.")
    yield
    logger.info("🛑 MOLTY PRO V3.2 ugašen.")


app = FastAPI(
    title="MOLTY PRO V3.2",
    description="Refractory Business Intelligence Platform",
    version="3.2.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Dashboard (Frontend) ──────────────────────
@app.get("/", response_class=HTMLResponse)
async def serve_dashboard():
    """Servira glavni dashboard HTML."""
    html_path = os.path.join(os.path.dirname(__file__), "dashboard.html")
    if not os.path.exists(html_path):
        raise HTTPException(status_code=500, detail="dashboard.html nije pronađen.")
    with open(html_path, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())


# ── Health Check ───────────────────────────────
@app.get("/api/health")
async def health_check():
    """Status servera i konekcija."""
    drive_ok = get_drive_service() is not None
    db_ok = os.path.exists(DB_PATH)
    return {
        "status": "online",
        "version": "3.2.0",
        "drive_connected": drive_ok,
        "database_exists": db_ok,
        "drive_root_id": DRIVE_ROOT_ID
    }


# ── Skeniranje Drive Arhive ───────────────────
@app.get("/api/scan")
async def scan_archive():
    """Pokreće deep scan Google Drive-a i čuva u bazu."""
    try:
        documents = await deep_scan_drive()
        if not documents:
            return {
                "status": "warning",
                "message": "Nema dokumenata ili Drive nije konfigurisan.",
                "count": 0
            }
        inserted = save_scan_to_db(documents)
        return {
            "status": "success",
            "message": f"Skenirano {len(documents)} dokumenata, {inserted} sačuvano/ažurirano.",
            "count": len(documents),
            "documents": documents[:50]  # Prvih 50 za preview
        }
    except Exception as e:
        logger.error("Scan error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ── Pretraga Klijentske Arhive ─────────────────
@app.get("/api/archive/search")
async def search_archive(
    client: str = Query(default="", description="Filter po klijentu"),
    material: str = Query(default="", description="Filter po materijalu"),
    year_from: int = Query(default=MIN_YEAR, description="Od godine"),
    year_to: int = Query(default=2026, description="Do godine"),
    limit: int = Query(default=100, description="Max rezultata")
):
    """Pretraga skeniranih dokumenata iz baze."""
    conn = get_db()
    query = "SELECT * FROM sales_analytics WHERE 1=1"
    params = []

    if client:
        query += " AND client_name LIKE ?"
        params.append(f"%{client}%")
    if material:
        query += " AND material_name LIKE ?"
        params.append(f"%{material}%")

    query += " ORDER BY scan_date DESC LIMIT ?"
    params.append(limit)

    rows = conn.execute(query, params).fetchall()
    conn.close()

    return {
        "count": len(rows),
        "results": [dict(row) for row in rows]
    }


# ── Statistike po Klijentima ──────────────────
@app.get("/api/stats/clients")
async def client_stats():
    """Agregacija podataka po klijentima."""
    conn = get_db()
    rows = conn.execute("""
        SELECT 
            client_name,
            COUNT(*) as doc_count,
            ROUND(SUM(total_val), 2) as total_value,
            GROUP_CONCAT(DISTINCT material_name) as materials
        FROM sales_analytics
        GROUP BY client_name
        ORDER BY doc_count DESC
    """).fetchall()
    conn.close()
    return {"clients": [dict(r) for r in rows]}


# ── Statistike po Materijalima ─────────────────
@app.get("/api/stats/materials")
async def material_stats():
    """Agregacija podataka po materijalima."""
    conn = get_db()
    rows = conn.execute("""
        SELECT 
            material_name,
            COUNT(*) as doc_count,
            ROUND(SUM(total_val), 2) as total_value,
            GROUP_CONCAT(DISTINCT client_name) as clients
        FROM sales_analytics
        GROUP BY material_name
        ORDER BY doc_count DESC
    """).fetchall()
    conn.close()
    return {"materials": [dict(r) for r in rows]}


# ── Inženjerski Proračun ──────────────────────
@app.post("/api/engineering/heat-flux")
async def api_heat_flux(request: Request):
    """
    Proračun toplotnog fluksa.
    Body:
    {
        "t_inner": 1200,
        "t_ambient": 25,
        "h_conv": 10,
        "layers": [
            {"name": "Magnit MK90", "thickness_m": 0.23, "lambda_w_mk": 3.5},
            {"name": "Caldercast 155AL", "thickness_m": 0.10, "lambda_w_mk": 1.2},
            {"name": "Izolacija", "thickness_m": 0.05, "lambda_w_mk": 0.15}
        ]
    }
    """
    try:
        body = await request.json()
        result = calculate_heat_flux(
            t_in=body["t_inner"],
            t_amb=body["t_ambient"],
            layers=body["layers"],
            h_conv=body.get("h_conv", 10.0)
        )
        return {"status": "success", "result": result}
    except (KeyError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Heat flux error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ── Lista Poznatih Klijenata ──────────────────
@app.get("/api/clients")
async def list_clients():
    """Vraća listu poznatih MOLTY klijenata."""
    return {"clients": KNOWN_CLIENTS}


# ── Lista Poznatih Materijala ──────────────────
@app.get("/api/materials")
async def list_materials():
    """Vraća listu poznatih Calderys materijala."""
    return {"materials": KNOWN_MATERIALS}


# ── Brisanje Baze (Reset) ─────────────────────
@app.delete("/api/reset")
async def reset_database():
    """Briše sve podatke iz sales_analytics tabele."""
    conn = get_db()
    conn.execute("DELETE FROM sales_analytics")
    conn.commit()
    conn.close()
    return {"status": "success", "message": "Baza resetovana."}


# ──────────────────────────────────────────────
# Run
# ──────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
