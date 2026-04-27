/**
 * MOLTY/ANVIL Worker — Drive Sync Client Folder Resolver
 * VERIFIKOVANO 2026-04-27 protiv stvarnih foldera u Calderys Klijenti
 *
 * NOVI VERIFIKOVANI DUPLIKATI (Worker je već stvorio):
 *   ─── Plamen — 2 verzije ─────────────────────────────────────
 *     ORIGINAL:    Plamen Pozega                          (21.05.2024)
 *     WORKER DUP:  Plamen d.o.o.                          (21.04.2026)
 *
 *   ─── VBS Sevojno — 2 verzije (verovatno ista firma) ─────────
 *     ORIGINAL:    Valjaonica Sevojno                     (21.05.2024)
 *     WORKER:      VBS Sevojno — Valjaonica bakra Sevojno AD (18.03.2026)
 *
 *   ─── HBIS — 3 verzije ───────────────────────────────────────
 *     KEEP:    HBIS GROUP Serbia Iron & Steel d.o.o.      (11.03.2026 — currently active)
 *     MERGE:   HBIS GROUP Serbia Iron & Steel d.o.        (09.03.2026)
 *     MERGE:   HBIS GROUP Serbia Iron & Steel             (24.05.2024)
 *
 *   ─── Heidelberg — 2 verzije ─────────────────────────────────
 *     KEEP:    Heidelberg Materials Cement BiH d.d        (10.03.2026)
 *     MERGE:   Heidelberg/Nexe                            (22.02.2026)
 *
 *   ─── MIV — 3 verzije ────────────────────────────────────────
 *     KEEP:    MIV Varaždin                               (sa š — kanon)
 *     MERGE:   MIV Varazdin                               (bez š)
 *     MERGE:   MIV                                        (generic)
 *
 *   ─── Cimos — 2 verzije (možda RAZLIČITE firme) ─────────────
 *     Cimos                                               (generic)
 *     Cimos Zenica TDM Casting                            (specifika)
 *
 *   ─── TitanUsje — sub-folder, NIJE top-level ─────────────────
 *     'Titan Usje' postoji kao SUB folder u 1DJNM6sEYWxFz_KY9Q-63hw34E-oxdPqx
 *     Predlog: alias na 'TITAN' top-level dok se ručno ne konsoliduje
 */

export const CLIENT_FOLDER_ALIASES = {
  // === HBIS Serbia (3 dup foldera, drži najnoviji aktivni) ===
  'HBIS': 'HBIS GROUP Serbia Iron & Steel d.o.o.',
  'HBIS GROUP': 'HBIS GROUP Serbia Iron & Steel d.o.o.',
  'HBIS GROUP SERBIA': 'HBIS GROUP Serbia Iron & Steel d.o.o.',
  'HBIS Serbia': 'HBIS GROUP Serbia Iron & Steel d.o.o.',
  'HBIS Iron Steel': 'HBIS GROUP Serbia Iron & Steel d.o.o.',
  'HBIS Smederevo': 'HBIS GROUP Serbia Iron & Steel d.o.o.',
  'Zelezara Smederevo': 'HBIS GROUP Serbia Iron & Steel d.o.o.',

  // === Heidelberg (2 dup) ===
  'Heidelberg': 'Heidelberg Materials Cement BiH d.d',
  'Heidelberg Materials': 'Heidelberg Materials Cement BiH d.d',
  'Heidelberg/Nexe': 'Heidelberg Materials Cement BiH d.d',
  'Heidelberg Nexe': 'Heidelberg Materials Cement BiH d.d',
  'Nexe': 'Heidelberg Materials Cement BiH d.d',

  // === Plamen — VERIFIKUJ KOJI JE KANON ===
  'Plamen': 'Plamen Pozega',
  'PLAMEN': 'Plamen Pozega',
  'Plamen doo': 'Plamen Pozega',
  'Plamen d.o.o.': 'Plamen Pozega',
  'Plamen Pozega': 'Plamen Pozega',

  // === VBS Sevojno ===
  'VBS': 'VBS Sevojno — Valjaonica bakra Sevojno AD',
  'VBS Sevojno': 'VBS Sevojno — Valjaonica bakra Sevojno AD',
  'Valjaonica Sevojno': 'VBS Sevojno — Valjaonica bakra Sevojno AD',
  'Valjaonica bakra Sevojno': 'VBS Sevojno — Valjaonica bakra Sevojno AD',

  // === MIV (3 dup, drži kanon sa š) ===
  'MIV': 'MIV Varaždin',
  'MIV Varazdin': 'MIV Varaždin',
  'Varaždin': 'MIV Varaždin',
  'Varazdin': 'MIV Varaždin',

  // === Cimos — generic ostaviti slobodan, mapiraj samo specifične ===
  'Cimos Zenica': 'Cimos Zenica TDM Casting',
  'TDM Casting': 'Cimos Zenica TDM Casting',
  'Cimos TDM': 'Cimos Zenica TDM Casting',

  // === TitanUsje (sub-folder, ne top-level) — alias na generic TITAN ===
  'TitanUsje': 'TITAN',
  'Titan Usje': 'TITAN',
  'Titan Cement Usje': 'TITAN',
  'TITAN': 'TITAN',
  'Titan Kamnik': 'Titan Kamnik',
  'Titan Sharcemm': 'Titan Sharcemm',
  'Titan Sharrcem': 'Titan Sharcemm',
  'Sharcemm': 'Titan Sharcemm',
  'Sharrcement': 'Titan Sharcemm',
  'Zlatna Panega': 'Zlatna Panega Titan',
  'Zlatna Panega Titan': 'Zlatna Panega Titan',

  // === Ostali iz 18 mesečnih kupaca ===
  'Autoflex': 'Autoflex livnica Coka',
  'Autoflex Coka': 'Autoflex livnica Coka',
  'Bamex': 'BAMEX',
  'BAMEX': 'BAMEX',
  'BergMontana': 'BERG MONTANA',
  'Berg Montana': 'BERG MONTANA',
  'BERG MONTANA': 'BERG MONTANA',
  'EtaCerkno': 'EtaCerkno',
  'Eta Cerkno': 'EtaCerkno',
  'Lafarge': 'Lafarge BFC',
  'Lafarge BFC': 'Lafarge BFC',
  'Lafarge BFC Beocin': 'Lafarge BFC',
  'Makstil': 'Makstil',
  'MAKSTIL': 'Makstil',
  'Moravacem': 'MORAVACEM',
  'MORAVACEM': 'MORAVACEM',
  'OSSAM': 'Ossam Lovetch',
  'Ossam': 'Ossam Lovetch',
  'Ossam Lovetch': 'Ossam Lovetch',
  'Progress': 'Progress JSC Stara Zagora',
  'Progress AD': 'Progress JSC Stara Zagora',
  'Progres AD': 'Progress JSC Stara Zagora',
  'Progres': 'Progress JSC Stara Zagora',
  'Progress JSC': 'Progress JSC Stara Zagora',
  'Stara Zagora': 'Progress JSC Stara Zagora',
  'RadijatorInz': 'RADIJATOR',
  'Radijator': 'RADIJATOR',
  'Radijator Inz': 'RADIJATOR',
  'Radijator Inzenjering': 'RADIJATOR',
  'RADIJATOR': 'RADIJATOR',
  'Radijator Kraljevo': 'RADIJATOR',
  'AluminijInd': 'Aluminij Mostar',
  'Aluminij Industrije': 'Aluminij Mostar',
  'Aluminij Mostar': 'Aluminij Mostar',
  'VatrostalnaSkopje': 'Vatrostalna Skoplje',
  'Vatrostalna': 'Vatrostalna Skoplje',
  'Vatrostalna Skopje': 'Vatrostalna Skoplje',
  'Vatrostalna Skoplje': 'Vatrostalna Skoplje',

  // === Bonus aliasi (preventivno za buduće slučajeve) ===
  'Arcelor Mittal Zenica': 'Arcelor Mittal Steel  Zenica',
  'Arcelor Zenica': 'Arcelor Mittal Steel  Zenica',
  'Arcelor Mittal Skoplje': 'Arcelor Mittal Steel Skoplje',
  'Arcelor Skoplje': 'Arcelor Mittal Steel Skoplje',
  'Veolia': 'Veolia Waste Operator Vinca',
  'Veolia Vinca': 'Veolia Waste Operator Vinca',
  'Veolia Waste': 'Veolia Waste Operator Vinca',
  'Vinca': 'Veolia Waste Operator Vinca',
  'CRH': 'CRH',
  'Bulchim': 'Bulchim',
  'Sofia Med': 'Sofia Med',
  'Talum': 'Talum Tovarna aluminijuma',
  'Talum Kidricevo': 'Talum Tovarna aluminijuma',
  'Stomana': 'STOMANA',
  'STOMANA': 'STOMANA',
  'Sinterfuse': 'SINTERFUSE DOO',
  'Topling': 'TOPLING',
  'Euronickel': 'EURONIKEL DOOEL',
  'Euronikel': 'EURONIKEL DOOEL',
  'Feni': 'Feni',
  'IHB': 'IHB Metal Casting EAD',
  'IHB Metal Casting': 'IHB Metal Casting EAD',
  'Vmv': 'Vmv ihtiman',
  'Vmv ihtiman': 'Vmv ihtiman',
  'Parvomai': 'Parvomai Chugunoleene',
  'Livarna Gorica': 'Livarna Gorica LIGO',
  'LIGO': 'Livarna Gorica LIGO',
  'Valji': 'Valji doo',
  'Valji doo': 'Valji doo',
};

export function normalizeName(s) {
  if (!s) return '';
  return s
    .toString()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[čć]/gi, 'c')
    .replace(/[š]/gi, 's')
    .replace(/[ž]/gi, 'z')
    .replace(/[đ]/gi, 'dj')
    .replace(/[\.,]/g, '')
    .replace(/\b(d\.o\.o|doo|d\.d|dd|ad|jsc|gmbh|s\.r\.l|llc|inc|ltd|dooel)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function fuzzyMatch(needle, haystack) {
  const n = normalizeName(needle);
  const h = normalizeName(haystack);

  if (n === h) return 100;
  if (h.startsWith(n)) return 95;
  if (n.startsWith(h)) return 90;
  if (h.includes(n)) return 85;
  if (n.includes(h)) return 80;

  const nTokens = new Set(n.split(' ').filter(t => t.length > 2));
  const hTokens = new Set(h.split(' ').filter(t => t.length > 2));
  const intersection = [...nTokens].filter(t => hTokens.has(t));
  if (intersection.length >= 2) return 70;
  if (intersection.length === 1 && intersection[0].length >= 5) return 60;

  return 0;
}

export async function findOrCreateClientFolder(drive, parsedName, parentFolderId) {
  if (!parsedName) throw new Error('parsedName is empty');

  const lookupKeys = [
    parsedName,
    parsedName.toUpperCase(),
    parsedName.toLowerCase(),
    parsedName.replace(/\b(\w)/g, c => c.toUpperCase())
  ];

  let aliased = null;
  for (const key of lookupKeys) {
    if (CLIENT_FOLDER_ALIASES[key]) { aliased = CLIENT_FOLDER_ALIASES[key]; break; }
  }

  if (aliased) {
    const folder = await findFolderByName(drive, aliased, parentFolderId);
    if (folder) return { id: folder.id, name: folder.name, source: 'alias' };
    console.warn(`[clientResolver] Alias "${parsedName}" → "${aliased}" but folder not found.`);
  }

  const allFolders = await listAllFolders(drive, parentFolderId);
  let bestMatch = null, bestScore = 0;

  for (const f of allFolders) {
    const score = fuzzyMatch(parsedName, f.name);
    if (score > bestScore) { bestScore = score; bestMatch = f; }
  }

  if (bestMatch && bestScore >= 80) {
    console.log(`[clientResolver] Fuzzy: "${parsedName}" → "${bestMatch.name}" (score=${bestScore})`);
    return { id: bestMatch.id, name: bestMatch.name, source: 'fuzzy', score: bestScore };
  }

  console.warn(`[clientResolver] NO MATCH for "${parsedName}" (best=${bestScore}, candidate="${bestMatch?.name}")`);
  await sendCreateNotification(parsedName, bestMatch?.name, bestScore);

  const newFolder = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name: parsedName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId]
    },
    fields: 'id, name'
  });
  return { id: newFolder.data.id, name: newFolder.data.name, source: 'created' };
}

async function findFolderByName(drive, name, parentId) {
  const escaped = name.replace(/'/g, "\\'");
  const res = await drive.files.list({
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and name='${escaped}' and trashed=false`,
    fields: 'files(id, name)',
    pageSize: 5
  });
  return res.data.files[0] || null;
}

async function listAllFolders(drive, parentId) {
  const all = [];
  let pageToken = null;
  do {
    const res = await drive.files.list({
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'nextPageToken, files(id, name, createdTime)',
      pageSize: 100,
      pageToken
    });
    all.push(...res.data.files);
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return all;
}

async function sendCreateNotification(parsedName, candidateName, score) {
  const message = `[MOLTY/ANVIL Worker] Kreiran novi folder klijenta: "${parsedName}"\n\n` +
                  `Najbolji kandidat za match je bio: "${candidateName || '(nista)'}" sa score=${score}.\n` +
                  `Ako je ovo trebao da bude postojeći folder, dodaj alias u CLIENT_FOLDER_ALIASES.`;
  console.warn(message);
}
