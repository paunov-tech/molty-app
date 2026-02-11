@app.get("/api/drive/analyze-file/{file_id}")
def analyze_file(file_id: str, client_name: str = "Nepoznat"):
    service = get_drive_service()
    try:
        # Preuzimanje PDF-a u memoriju
        request = service.files().get_media(fileId=file_id)
        file_io = io.BytesIO(request.execute())
        
        # OCR / Ekstrakcija teksta
        pdf_reader = PyPDF2.PdfReader(file_io)
        full_text = ""
        for page in pdf_reader.pages:
            full_text += page.extract_text() or ""
        
        full_text = full_text.upper()

        # Robot logika: Tražimo materijal, tonažu i cenu
        # Tražimo tvoj Magnit, Alkon, itd.
        mat_found = "NEPOZNAT MATERIJAL"
        for m in ["MAGNIT", "ALKON", "BARYT", "CALDE", "SILIKON"]:
            if m in full_text:
                mat_found = m
                break

        # Regex za brojeve (podržava 20.5 ili 20,5)
        weight_match = re.search(r"(\d+[.,]?\d*)\s*(T|TN|TONA|KG)", full_text)
        price_match = re.search(r"(\d+[.,]?\d*)\s*(EUR|€|USD|\$)", full_text)

        res = {
            "material": mat_found,
            "weight": weight_match.group(1).replace(",", ".") if weight_match else "0",
            "price": price_match.group(1).replace(",", ".") if price_match else "0"
        }

        return {"status": "success", "extracted": res}
    except Exception as e:
        return {"status": "error", "message": str(e)}
