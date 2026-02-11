import { useState, useEffect } from "react";
import { C, fe, fm } from "../core/theme.js";
import { Card, Input, SectionTitle } from "../core/ui.jsx";
import { useCustomers, useMaterials, store } from "../core/store.js";

// ═══════════════════════════════════════════════════
// MOLTY v8.3 — QUOTES MODULE
// Professional Excel export + Price memory + Email
// ═══════════════════════════════════════════════════

// ── Calderys brand colors for Excel ──
const CALDE = {
  orange: "F97316",
  orangeDark: "C2410C",
  blue: "1E3A5F",
  blueDark: "0F1F33",
  white: "FFFFFF",
  lightGray: "F3F4F6",
  midGray: "D1D5DB",
  darkGray: "374151",
  black: "111827",
};

// ── Generate professional Excel ──
async function generateExcel(items, customerName, customerData, quoteNumber) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "MOLTY Platform — Calderys Serbia";
  wb.created = new Date();

  const ws = wb.addWorksheet("Ponuda", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
  });

  // Column widths
  ws.columns = [
    { width: 5 },   // A — R.br
    { width: 36 },  // B — Materijal
    { width: 14 },  // C — Šifra
    { width: 10 },  // D — Količina
    { width: 8 },   // E — Jed.
    { width: 14 },  // F — Cena/jed (EUR)
    { width: 16 },  // G — Ukupno (EUR)
  ];

  // ── HEADER BLOCK ──
  // Row 1-2: Calderys branding bar
  ws.mergeCells("A1:G1");
  const brandCell = ws.getCell("A1");
  brandCell.value = "CALDERYS SERBIA d.o.o.";
  brandCell.font = { name: "Calibri", size: 18, bold: true, color: { argb: CALDE.white } };
  brandCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CALDE.blue } };
  brandCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  ws.getRow(1).height = 38;

  ws.mergeCells("A2:G2");
  const subBrand = ws.getCell("A2");
  subBrand.value = "Refractory Solutions · Technical Sales";
  subBrand.font = { name: "Calibri", size: 9, italic: true, color: { argb: CALDE.white } };
  subBrand.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CALDE.blueDark } };
  subBrand.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  ws.getRow(2).height = 20;

  // Row 3: Orange accent line
  ws.mergeCells("A3:G3");
  ws.getCell("A3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: CALDE.orange } };
  ws.getRow(3).height = 4;

  // Row 4: Empty spacer
  ws.getRow(4).height = 8;

  // Row 5-6: Document title
  ws.mergeCells("A5:G5");
  const titleCell = ws.getCell("A5");
  titleCell.value = "PONUDA / QUOTATION";
  titleCell.font = { name: "Calibri", size: 16, bold: true, color: { argb: CALDE.blue } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(5).height = 28;

  // Row 6: Quote number and date
  ws.mergeCells("A6:C6");
  ws.getCell("A6").value = `Br: ${quoteNumber}`;
  ws.getCell("A6").font = { name: "Calibri", size: 10, color: { argb: CALDE.darkGray } };
  ws.getCell("A6").alignment = { horizontal: "left", indent: 1 };

  ws.mergeCells("E6:G6");
  ws.getCell("E6").value = `Datum: ${new Date().toLocaleDateString("sr-Latn-RS")}`;
  ws.getCell("E6").font = { name: "Calibri", size: 10, color: { argb: CALDE.darkGray } };
  ws.getCell("E6").alignment = { horizontal: "right" };
  ws.getRow(6).height = 18;

  // Row 7: Empty spacer
  ws.getRow(7).height = 6;

  // Row 8-10: Customer info block
  ws.mergeCells("A8:B8");
  ws.getCell("A8").value = "KUPAC / CUSTOMER:";
  ws.getCell("A8").font = { name: "Calibri", size: 9, bold: true, color: { argb: CALDE.orange } };
  ws.getCell("A8").alignment = { indent: 1 };

  ws.mergeCells("A9:C9");
  ws.getCell("A9").value = customerName || "—";
  ws.getCell("A9").font = { name: "Calibri", size: 12, bold: true, color: { argb: CALDE.black } };
  ws.getCell("A9").alignment = { indent: 1 };

  const custInfo = [];
  if (customerData?.city) custInfo.push(customerData.city);
  if (customerData?.country) custInfo.push(customerData.country);
  ws.mergeCells("A10:C10");
  ws.getCell("A10").value = custInfo.join(", ") || "";
  ws.getCell("A10").font = { name: "Calibri", size: 9, color: { argb: CALDE.darkGray } };
  ws.getCell("A10").alignment = { indent: 1 };

  // Seller info on right side
  ws.mergeCells("E8:G8");
  ws.getCell("E8").value = "PRODAVAC / SELLER:";
  ws.getCell("E8").font = { name: "Calibri", size: 9, bold: true, color: { argb: CALDE.orange } };
  ws.getCell("E8").alignment = { horizontal: "right" };

  ws.mergeCells("E9:G9");
  ws.getCell("E9").value = "Calderys Serbia d.o.o.";
  ws.getCell("E9").font = { name: "Calibri", size: 11, bold: true, color: { argb: CALDE.black } };
  ws.getCell("E9").alignment = { horizontal: "right" };

  ws.mergeCells("E10:G10");
  ws.getCell("E10").value = "paunov@calderyserbia.com";
  ws.getCell("E10").font = { name: "Calibri", size: 9, color: { argb: CALDE.darkGray } };
  ws.getCell("E10").alignment = { horizontal: "right" };

  // Row 11: spacer
  ws.getRow(11).height = 10;

  // ── TABLE HEADER ──
  const headerRow = 12;
  const headers = ["#", "Materijal / Material", "Šifra / Code", "Količina", "Jed.", "Cena/jed EUR", "Ukupno EUR"];
  const headerRowObj = ws.getRow(headerRow);
  headers.forEach((h, i) => {
    const cell = headerRowObj.getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: CALDE.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CALDE.blue } };
    cell.alignment = { horizontal: i >= 3 ? "center" : "left", vertical: "middle", indent: i < 3 ? 1 : 0 };
    cell.border = {
      top: { style: "thin", color: { argb: CALDE.blue } },
      bottom: { style: "thin", color: { argb: CALDE.blue } },
    };
  });
  headerRowObj.height = 24;

  // ── TABLE DATA ──
  const dataStartRow = headerRow + 1;
  items.forEach((qi, idx) => {
    const rowNum = dataStartRow + idx;
    const row = ws.getRow(rowNum);
    const isEven = idx % 2 === 0;
    const bgColor = isEven ? CALDE.lightGray : CALDE.white;

    // #
    row.getCell(1).value = idx + 1;
    row.getCell(1).font = { name: "Calibri", size: 10, color: { argb: CALDE.darkGray } };
    row.getCell(1).alignment = { horizontal: "center" };

    // Material name
    row.getCell(2).value = qi.name;
    row.getCell(2).font = { name: "Calibri", size: 10, bold: true, color: { argb: CALDE.black } };
    row.getCell(2).alignment = { indent: 1 };

    // Code
    row.getCell(3).value = qi.code || "";
    row.getCell(3).font = { name: "Calibri", size: 9, color: { argb: CALDE.darkGray } };

    // Quantity
    row.getCell(4).value = qi.qty || 0;
    row.getCell(4).font = { name: "Calibri", size: 10, bold: true, color: { argb: "0000FF" } };
    row.getCell(4).alignment = { horizontal: "center" };
    row.getCell(4).numFmt = "#,##0.00";

    // Unit
    row.getCell(5).value = qi.unit || "t";
    row.getCell(5).font = { name: "Calibri", size: 9, color: { argb: CALDE.darkGray } };
    row.getCell(5).alignment = { horizontal: "center" };

    // Unit price — EDITABLE (blue = input)
    row.getCell(6).value = qi.price || 0;
    row.getCell(6).font = { name: "Calibri", size: 10, bold: true, color: { argb: "0000FF" } };
    row.getCell(6).alignment = { horizontal: "right" };
    row.getCell(6).numFmt = "#,##0.00";

    // Total — FORMULA
    const qtyCell = `D${rowNum}`;
    const priceCell = `F${rowNum}`;
    row.getCell(7).value = { formula: `${qtyCell}*${priceCell}` };
    row.getCell(7).font = { name: "Calibri", size: 10, bold: true, color: { argb: CALDE.black } };
    row.getCell(7).alignment = { horizontal: "right" };
    row.getCell(7).numFmt = "#,##0.00";

    // Background + borders
    for (let c = 1; c <= 7; c++) {
      row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
      row.getCell(c).border = {
        bottom: { style: "hair", color: { argb: CALDE.midGray } },
      };
    }
    row.height = 22;
  });

  // ── TOTAL ROW ──
  const totalRow = dataStartRow + items.length;
  ws.getRow(totalRow).height = 6; // spacer

  const grandTotalRow = totalRow + 1;
  ws.mergeCells(`A${grandTotalRow}:E${grandTotalRow}`);
  ws.getCell(`A${grandTotalRow}`).value = "UKUPNO / TOTAL:";
  ws.getCell(`A${grandTotalRow}`).font = { name: "Calibri", size: 12, bold: true, color: { argb: CALDE.blue } };
  ws.getCell(`A${grandTotalRow}`).alignment = { horizontal: "right", vertical: "middle" };

  ws.mergeCells(`F${grandTotalRow}:G${grandTotalRow}`);
  const totalCell = ws.getCell(`F${grandTotalRow}`);
  totalCell.value = { formula: `SUM(G${dataStartRow}:G${totalRow - 1})` };
  totalCell.font = { name: "Calibri", size: 14, bold: true, color: { argb: CALDE.orange } };
  totalCell.alignment = { horizontal: "right", vertical: "middle" };
  totalCell.numFmt = "#,##0.00\" EUR\"";
  totalCell.border = {
    top: { style: "medium", color: { argb: CALDE.orange } },
    bottom: { style: "double", color: { argb: CALDE.orange } },
  };
  ws.getRow(grandTotalRow).height = 30;

  // ── CONDITIONS BLOCK ──
  const condRow = grandTotalRow + 2;
  ws.mergeCells(`A${condRow}:G${condRow}`);
  ws.getCell(`A${condRow}`).value = "USLOVI / CONDITIONS";
  ws.getCell(`A${condRow}`).font = { name: "Calibri", size: 10, bold: true, color: { argb: CALDE.orange } };
  ws.getCell(`A${condRow}`).alignment = { indent: 1 };

  const conditions = [
    "Rok isporuke / Delivery time: _____ radnih dana",
    "Uslovi plaćanja / Payment terms: _____",
    "Pariteti / Incoterms: EXW / FCA / DAP _____",
    "Validnost ponude / Quote validity: 30 dana",
  ];
  conditions.forEach((cond, i) => {
    const r = condRow + 1 + i;
    ws.mergeCells(`A${r}:G${r}`);
    ws.getCell(`A${r}`).value = cond;
    ws.getCell(`A${r}`).font = { name: "Calibri", size: 9, color: { argb: CALDE.darkGray } };
    ws.getCell(`A${r}`).alignment = { indent: 2 };
  });

  // ── FOOTER ──
  const footerRow = condRow + conditions.length + 2;
  ws.mergeCells(`A${footerRow}:G${footerRow}`);
  ws.getCell(`A${footerRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: CALDE.orange } };
  ws.getRow(footerRow).height = 3;

  ws.mergeCells(`A${footerRow + 1}:G${footerRow + 1}`);
  ws.getCell(`A${footerRow + 1}`).value = "Calderys Serbia d.o.o. · Generisano iz MOLTY Platform · paunov@calderyserbia.com";
  ws.getCell(`A${footerRow + 1}`).font = { name: "Calibri", size: 8, italic: true, color: { argb: CALDE.midGray } };
  ws.getCell(`A${footerRow + 1}`).alignment = { horizontal: "center" };

  // ── NOTE ABOUT EDITABLE FIELDS ──
  ws.mergeCells(`A${footerRow + 2}:G${footerRow + 2}`);
  ws.getCell(`A${footerRow + 2}`).value = "💡 Plavi brojevi (količina, cena) su editabilni — ukupno se automatski računa";
  ws.getCell(`A${footerRow + 2}`).font = { name: "Calibri", size: 8, italic: true, color: { argb: "3B82F6" } };
  ws.getCell(`A${footerRow + 2}`).alignment = { horizontal: "center" };

  // ── Print setup ──
  ws.headerFooter.oddFooter = "&C&8Calderys Serbia — Ponuda &P/&N";

  // Generate buffer and download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Ponuda_${(customerName || "draft").replace(/\s+/g, "_")}_${quoteNumber}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Generate quote number ──
function genQuoteNum() {
  const d = new Date();
  const yy = d.getFullYear().toString().slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const seq = String(Math.floor(Math.random() * 900) + 100);
  return `CS-${yy}${mm}-${seq}`;
}

// ── Email composer ──
function openEmail(customerName, items, total, quoteNumber, recipient) {
  const itemLines = items.map((qi, i) =>
    `  ${i + 1}. ${qi.name} — ${qi.qty} ${qi.unit} × €${fm(qi.price)} = €${fm(Math.round(qi.price * qi.qty))}`
  ).join("%0D%0A");

  const subject = encodeURIComponent(`Ponuda ${quoteNumber} — ${customerName || "Calderys Serbia"}`);
  const body = encodeURIComponent(
    `Poštovani,\n\n` +
    `U prilogu šaljemo ponudu ${quoteNumber} za ${customerName || "kupca"}.\n\n` +
    `Pregled stavki:\n${items.map((qi, i) =>
      `  ${i + 1}. ${qi.name} — ${qi.qty} ${qi.unit} × €${qi.price?.toLocaleString("de-DE") || "0"} = €${Math.round((qi.price || 0) * (qi.qty || 0)).toLocaleString("de-DE")}`
    ).join("\n")}\n\n` +
    `UKUPNO: €${Math.round(total).toLocaleString("de-DE")}\n\n` +
    `Molimo Vas za potvrdu.\n\n` +
    `Srdačan pozdrav,\nCalderys Serbia d.o.o.`
  );

  const cc = "r.majstorovic@calderyserbia.com";
  const mailto = `mailto:${recipient || ""}?cc=${cc}&subject=${subject}&body=${body}`;
  window.open(mailto, "_blank");
}

// ═══════════════════════════════════════════════════
// QUOTES COMPONENT
// ═══════════════════════════════════════════════════
export default function Quotes({ quoteItems, setQuoteItems }) {
  const customers = useCustomers();
  const materials = useMaterials();
  const [qCust, setQCust] = [quoteItems._customer || "", (v) => setQuoteItems(prev => ({ ...prev, _customer: v }))];
  const [matSearch, setMatSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [quoteNum] = useState(() => genQuoteNum());
  const [emailTo, setEmailTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const items = quoteItems.items || [];

  // Get customer data for Excel
  const custData = customers.find(c => c.name === qCust);

  // Add material to quote
  const addMat = (m) => {
    const name = m.name || "";
    if (items.find(x => x.name === name)) return;
    setQuoteItems(prev => ({
      ...prev,
      items: [...prev.items, {
        id: m.id, name, code: m.productCode || m.code || "",
        price: m.price || m.lastPrice || 0,
        unit: m.unit || "t", qty: 1,
        cat: m.category || m.cat || "",
      }],
    }));
    setShowPicker(false);
    setMatSearch("");
  };

  // Update price and SAVE to material store (price memory)
  const updatePrice = (idx, newPrice) => {
    const n = [...items];
    n[idx] = { ...n[idx], price: newPrice };
    setQuoteItems(prev => ({ ...prev, items: n }));

    // Save price to material in store
    const matId = n[idx].id;
    if (matId && newPrice > 0) {
      store.update("materials", matId, {
        price: newPrice,
        lastPrice: newPrice,
        lastPriceDate: new Date().toISOString().slice(0, 10),
      });
    }
  };

  // Update quantity
  const updateQty = (idx, newQty) => {
    const n = [...items];
    n[idx] = { ...n[idx], qty: newQty };
    setQuoteItems(prev => ({ ...prev, items: n }));
  };

  // Remove item
  const removeItem = (idx) => {
    setQuoteItems(prev => ({ ...prev, items: items.filter((_, j) => j !== idx) }));
  };

  // Search materials
  const filtMats = matSearch.length > 1
    ? materials.filter(m => {
        const name = (m.name || "").toLowerCase();
        const code = (m.productCode || m.code || "").toLowerCase();
        const q = matSearch.toLowerCase();
        return name.includes(q) || code.includes(q);
      }).slice(0, 12)
    : [];

  const total = items.reduce((s, qi) => s + (qi.price || 0) * (qi.qty || 0), 0);

  // Export Excel
  const handleExcel = async () => {
    setExporting(true);
    try {
      await generateExcel(items, qCust, custData, quoteNum);
    } catch (e) {
      console.error("Excel export error:", e);
      alert("Greška pri generisanju Excel-a: " + e.message);
    }
    setExporting(false);
  };

  // Styles
  const sBtn = (bg, color, border) => ({
    padding: "8px 16px", borderRadius: 8, border: border || "none",
    background: bg, color, fontSize: 11, fontWeight: 700, cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 6, transition: "all .15s",
  });

  return <>
    {/* ── HEADER ── */}
    <Card style={{ marginBottom: 10, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div>
          <SectionTitle style={{ marginBottom: 2 }}>Nova ponuda</SectionTitle>
          <div style={{ fontSize: 9, color: C.txD }}>Br: {quoteNum}</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {items.length > 0 && (
            <>
              <button onClick={handleExcel} disabled={exporting}
                style={sBtn(`linear-gradient(135deg, ${C.gr}, #16a34a)`, "#fff")}>
                {exporting ? "⏳" : "📊"} Excel
              </button>
              <button onClick={() => openEmail(qCust, items, total, quoteNum, emailTo)}
                style={sBtn(`linear-gradient(135deg, ${C.bl}, #2563eb)`, "#fff")}>
                📧 Email
              </button>
            </>
          )}
        </div>
      </div>

      {/* Customer selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <select value={qCust} onChange={e => setQCust(e.target.value)}
          style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.brd}`,
            background: C.sf, color: C.tx, fontSize: 11 }}>
          <option value="">Izaberi kupca...</option>
          {customers.sort((a, b) => a.name.localeCompare(b.name)).map(c => (
            <option key={c.id} value={c.name}>{c.flag || ""} {c.name}</option>
          ))}
        </select>
        <input value={emailTo} onChange={e => setEmailTo(e.target.value)}
          placeholder="Email primaoca..."
          style={{ width: 200, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.brd}`,
            background: C.sf, color: C.tx, fontSize: 10 }} />
      </div>

      {/* ── MATERIAL PICKER ── */}
      <div style={{ marginBottom: 10 }}>
        <button onClick={() => setShowPicker(!showPicker)}
          style={{ ...sBtn(C.cy + "15", C.cy, `1px solid ${C.cy}44`), width: "100%", justifyContent: "center" }}>
          + Dodaj materijal u ponudu
        </button>

        {showPicker && (
          <div style={{ marginTop: 6, padding: 10, border: `1px solid ${C.brd}`, borderRadius: 8,
            background: C.sf, maxHeight: 280, overflowY: "auto" }}>
            <input value={matSearch} onChange={e => setMatSearch(e.target.value)}
              placeholder="Pretraži po nazivu ili šifri..." autoFocus
              style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.brd}`,
                background: C.card, color: C.tx, fontSize: 11, marginBottom: 6, boxSizing: "border-box" }} />
            {filtMats.map(m => (
              <div key={m.id} onClick={() => addMat(m)}
                style={{ padding: "6px 10px", cursor: "pointer", fontSize: 10, borderRadius: 6,
                  borderBottom: `1px solid ${C.brd}22`, display: "flex", justifyContent: "space-between", alignItems: "center" }}
                onMouseOver={e => e.currentTarget.style.background = C.or + "11"}
                onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                <div>
                  <strong style={{ color: C.tx }}>{m.name}</strong>
                  <span style={{ color: C.txD, marginLeft: 6 }}>{m.productCode || m.code || ""}</span>
                  <span style={{ color: C.txD, marginLeft: 4 }}>{m.category || m.cat || ""}</span>
                </div>
                <div style={{ color: m.price || m.lastPrice ? C.or : C.txD, fontWeight: 600 }}>
                  {m.price || m.lastPrice ? `€${fm(m.price || m.lastPrice)}` : "—"}
                </div>
              </div>
            ))}
            {matSearch.length > 1 && !filtMats.length && (
              <div style={{ fontSize: 10, color: C.txD, padding: 8, textAlign: "center" }}>Nema rezultata za "{matSearch}"</div>
            )}
            {!matSearch && (
              <div style={{ fontSize: 10, color: C.txD, padding: 8, textAlign: "center" }}>Ukucaj min 2 slova...</div>
            )}
          </div>
        )}
      </div>
    </Card>

    {/* ── ITEMS TABLE ── */}
    <Card style={{ padding: "14px 16px" }}>
      {items.length === 0 ? (
        <div style={{ textAlign: "center", padding: 30, color: C.txD }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 12 }}>Dodaj materijale u ponudu</div>
          <div style={{ fontSize: 10, marginTop: 4 }}>Klikni "+ Dodaj materijal" gore ili idi na tab Materijali → +Ponuda</div>
        </div>
      ) : (
        <>
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 90px 80px 28px", gap: 6,
            fontSize: 9, color: C.txD, padding: "0 0 6px", borderBottom: `1px solid ${C.brd}`, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
            <span>Materijal</span><span style={{ textAlign: "center" }}>Količina</span>
            <span style={{ textAlign: "center" }}>Cena/jed €</span><span style={{ textAlign: "right" }}>Ukupno €</span><span></span>
          </div>

          {/* Items */}
          {items.map((qi, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 70px 90px 80px 28px", gap: 6,
              alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.brd}22` }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.tx }}>{qi.name}</div>
                <div style={{ fontSize: 8, color: C.txD }}>{qi.code}{qi.cat ? ` · ${qi.cat}` : ""}</div>
              </div>
              <input type="number" value={qi.qty} min={0.01} step={0.1}
                onChange={e => updateQty(i, parseFloat(e.target.value) || 0)}
                style={{ width: 60, textAlign: "center", fontSize: 11, padding: "4px 6px", borderRadius: 6,
                  border: `1px solid ${C.brd}`, background: C.card, color: C.bl, fontWeight: 700 }} />
              <input type="number" value={qi.price} min={0} step={10}
                onChange={e => updatePrice(i, parseFloat(e.target.value) || 0)}
                style={{ width: 80, textAlign: "center", fontSize: 11, padding: "4px 6px", borderRadius: 6,
                  border: `1px solid ${C.brd}`, background: C.card, color: C.bl, fontWeight: 700 }} />
              <div style={{ fontSize: 12, fontWeight: 800, color: C.or, textAlign: "right" }}>
                {fe(Math.round((qi.price || 0) * (qi.qty || 0)))}
              </div>
              <button onClick={() => removeItem(i)}
                style={{ background: "none", border: "none", color: C.rd, cursor: "pointer", fontSize: 16,
                  width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4 }}>×</button>
            </div>
          ))}

          {/* ── TOTAL ── */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 0", marginTop: 6, borderTop: `2px solid ${C.or}` }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.txM }}>
              UKUPNO ({items.length} {items.length === 1 ? "stavka" : items.length < 5 ? "stavke" : "stavki"})
            </span>
            <span style={{ fontSize: 22, fontWeight: 900, color: C.or }}>{fe(Math.round(total))}</span>
          </div>

          {/* ── ACTION BUTTONS ── */}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={handleExcel} disabled={exporting}
              style={{ ...sBtn(`linear-gradient(135deg, #22c55e, #16a34a)`, "#fff"), flex: 1, justifyContent: "center", padding: "10px 16px", fontSize: 12 }}>
              {exporting ? "⏳ Generišem..." : "📊 Preuzmi Excel ponudu"}
            </button>
            <button onClick={() => openEmail(qCust, items, total, quoteNum, emailTo || (custData?.email || ""))}
              style={{ ...sBtn(`linear-gradient(135deg, #3b82f6, #2563eb)`, "#fff"), flex: 1, justifyContent: "center", padding: "10px 16px", fontSize: 12 }}>
              📧 Pošalji ponudu
            </button>
          </div>

          {/* Quick email buttons */}
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <button onClick={() => openEmail(qCust, items, total, quoteNum, "s.mazerhofer@calderys.com")}
              style={{ ...sBtn("transparent", C.txM, `1px solid ${C.brd}`), fontSize: 9, padding: "4px 10px" }}>
              📧 Sonja Mazerhofer
            </button>
            <button onClick={() => openEmail(qCust, items, total, quoteNum, "r.majstorovic@calderyserbia.com")}
              style={{ ...sBtn("transparent", C.txM, `1px solid ${C.brd}`), fontSize: 9, padding: "4px 10px" }}>
              📧 Rada Majstorović
            </button>
            {custData?.email && (
              <button onClick={() => openEmail(qCust, items, total, quoteNum, custData.email)}
                style={{ ...sBtn("transparent", C.txM, `1px solid ${C.brd}`), fontSize: 9, padding: "4px 10px" }}>
                📧 {qCust}
              </button>
            )}
          </div>

          {/* Price note */}
          <div style={{ fontSize: 8, color: C.txD, marginTop: 10, textAlign: "center" }}>
            💡 Cene se automatski pamte — sledeći put kad dodaš isti materijal, cena je već tu
          </div>
        </>
      )}
    </Card>
  </>;
}
