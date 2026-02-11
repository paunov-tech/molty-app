// ═══════════════════════════════════════════════════
// MOLTY CORE: DESIGN TOKENS — NE MENJAJ OVAJ FAJL
// ═══════════════════════════════════════════════════
export const C = {
  bg:"#08090a", sf:"#111214", card:"#16171b", cardH:"#1c1d22",
  brd:"#25262b", brdL:"#38393f",
  tx:"#f5f5f7", txM:"#9ca3af", txD:"#6b7280",
  or:"#f97316", orL:"#fb923c", orD:"#c2410c",
  bl:"#3b82f6", gr:"#22c55e", rd:"#ef4444", pu:"#a78bfa",
  yl:"#eab308", cy:"#06b6d4",
};

export const gradeColor = { A:C.or, B:C.bl, C:C.txD, D:C.rd };
export const statusColor = { active:C.gr, dormant:C.rd, new:C.cy };
export const priorityColor = { HITNO:C.rd, VISOK:C.or, SREDNJI:C.yl, NISKO:C.txD };
export const stageColor = { qualified:C.yl, proposal:C.bl, negotiation:C.or, won:C.gr };
export const statusLabel = { pending:"⏳ Čeka", in_progress:"🔄 U toku", done:"✅ Gotovo" };

export const fm = n => n?.toLocaleString("de-DE",{maximumFractionDigits:0})??"0";
export const fe = n => `€${fm(n)}`;
