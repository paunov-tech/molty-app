# MOLTY Drive Sync — Setup Vodič

## Šta je ovo?
MOLTY automatski skenira tvoj Google Drive (CALDERYS_CENTRAL folder) i detektuje nove fakture, ponude i dokumente. Može da parsira dokumente sa Claude AI i importuje podatke u sistem.

## Potrebno vreme: ~15 minuta (jednokratno)

---

## Korak 1: Google Cloud projekat

1. Idi na https://console.cloud.google.com
2. Kreiraj novi projekat: `molty-drive-sync`
3. Uključi API: **APIs & Services → Enable APIs → traži "Google Drive API" → Enable**

## Korak 2: Service Account

1. U Google Cloud Console: **IAM & Admin → Service Accounts**
2. Klikni **"+ Create Service Account"**
   - Name: `molty-reader`
   - Role: nema (ne treba)
3. Klikni na kreirani nalog → **Keys → Add Key → Create New Key → JSON**
4. Preuzmi JSON fajl (npr. `molty-reader-xxxxx.json`)

**VAŽNO:** Sačuvaj ovaj fajl na sigurno mesto!

## Korak 3: Podeli folder sa servisnim nalogom

1. Otvori Google Drive u browseru
2. Nađi folder **CALDERYS_CENTRAL**
3. Desni klik → **Share / Deli**
4. Unesi email servisnog naloga (izgleda kao: `molty-reader@molty-drive-sync.iam.gserviceaccount.com`)
5. Postavi na **Viewer** (samo čitanje)
6. Klikni **Send/Pošalji**

## Korak 4: Base64 kodiraj ključ

U terminalu:
```bash
# Linux/Mac:
base64 -w0 molty-reader-xxxxx.json

# ili sa cat:
cat molty-reader-xxxxx.json | base64 -w0
```

Kopiraj ceo output (jedan dugačak string).

**Alternativa (Windows PowerShell):**
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("molty-reader-xxxxx.json"))
```

## Korak 5: Vercel Environment Variables

1. Idi na https://vercel.com → tvoj `molty-platform` projekat
2. **Settings → Environment Variables**
3. Dodaj:

| Name | Value |
|------|-------|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | (base64 string iz koraka 4) |
| `ANTHROPIC_API_KEY` | (tvoj Claude API ključ sa console.anthropic.com) |
| `CALDERYS_ROOT_FOLDER_ID` | `1udwOxXmYlYQAhWSKh0-An7GY53mPeiFE` |

4. Selektuj: **Production + Preview + Development**
5. Klikni **Save**

## Korak 6: Redeploy

```bash
cd ~/molty-platform
git add . && git commit -m "add drive sync" && git push
```

Vercel će automatski redeploy-ovati sa novim env varijablama.

## Korak 7: Testiranje

1. Otvori MOLTY → tab **📡 Drive Sync**
2. Treba da vidiš **zeleni indicator "Povezan"**
3. Klikni **"Skeniraj Promene"**
4. Trebalo bi da vidiš listu dokumenata grupisanih po kupcu

### Troubleshooting

| Problem | Rešenje |
|---------|---------|
| "GOOGLE_SERVICE_ACCOUNT_KEY not configured" | Proveri da je env var dodat u Vercel i da je redeploy urađen |
| "403 Forbidden" | Folder nije deljen sa servisnim nalogom (Korak 3) |
| "Invalid key format" | Base64 kodiranje nije uspelo, probaj ponovo |
| API radi ali nema fajlova | Proveri da CALDERYS_ROOT_FOLDER_ID tačan |

---

## Automatski Cron

MOLTY automatski skenira Drive **svako jutro u 6:00 UTC** (podešeno u vercel.json).
Za ručne skenove — koristi dugme u interfejsu.

## Parsiranje dokumenata

Klikni **"🧠 Parsiraj"** pored bilo kog Google Docs dokumenta da Claude AI ekstrahuje:
- Tip dokumenta (faktura/ponuda/narudžbina)
- Kupac i lokacija
- Spisak materijala sa količinama i cenama
- Ukupan iznos

Parsirani podaci se mogu importovati u MOLTY jednim klikom.

---

## Arhitektura

```
MOLTY Frontend (React)
    ↓ fetch()
/api/drive-sync.js (Vercel Serverless)
    ↓ googleapis
Google Drive API
    ↓ reads
CALDERYS_CENTRAL/
  ├── Arcelor Mittal Steel Zenica/
  ├── HBIS/
  ├── MIV Varazdin/
  └── ... (100+ customer folders)

/api/parse-doc.js (Vercel Serverless)
    ↓ Claude API
Structured JSON → Import to MOLTY Store
```
