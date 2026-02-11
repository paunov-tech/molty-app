import { useMemo } from "react";
import { C, fe, fm } from "../core/theme.js";
import { Card, Stat, Badge, BarChart, SectionTitle } from "../core/ui.jsx";
import { useCustomers, usePipeline, useMaterials } from "../core/store.js";
import { SEED } from "../data/seed.js";

export default function Dashboard({ onNavigate }) {
  const customers = useCustomers();
  const pipeline = usePipeline();
  const materials = useMaterials();
  const revData = SEED.revenueByYear;

  const totRev = customers.reduce((s,c) => s + c.revenue, 0);
  const totInv = customers.reduce((s,c) => s + c.invoices, 0);
  const actN = customers.filter(c => c.status === "active").length;
  const dorN = customers.filter(c => c.status === "dormant").length;
  const tdsN = materials.filter(m => m.source === "tds-sync" || m.maxTemp || m.chemistry).length;
  const pricedN = materials.filter(m => m.price || m.lastPrice).length;
  const alerts = useMemo(() => customers.filter(c => c.daysIdle > 90).sort((a,b) => b.daysIdle - a.daysIdle), [customers]);
  const pipTot = pipeline.reduce((s,p) => s + p.value, 0);
  const pipW = pipeline.reduce((s,p) => s + p.value * p.probability / 100, 0);
  const maxR = Math.max(...revData.map(r => r.eur));

  const coStats = useMemo(() => {
    const m = {};
    customers.forEach(c => { if (!m[c.country]) m[c.country] = {fl:c.flag,n:0,r:0}; m[c.country].n++; m[c.country].r += c.revenue; });
    return Object.entries(m).sort((a,b) => b[1].r - a[1].r);
  }, [customers]);

  return <>
    <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
      <Stat label="UKUPAN PRIHOD" value={fe(totRev)} sub={`2019–2026 · ${totInv} faktura`} icon="💶"/>
      <Stat label="KUPCI" value={customers.length} sub={`${actN} aktiv · ${dorN} uspav`} color={C.bl} icon="🏭"/>
      <Stat label="PIPELINE" value={fe(pipTot)} sub={`Pond: ${fe(Math.round(pipW))}`} color={C.gr} icon="📈"/>
      <Stat label="ALARMI" value={alerts.length} sub="90+ dana neaktivni" color={C.rd} icon="🔔"/>
      <Stat label="MATERIJALI" value={materials.length} sub={`${tdsN} TDS · ${pricedN} sa cenom`} color={C.cy} icon="🧱"/>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
      <Card>
        <SectionTitle>Prihod po godini</SectionTitle>
        <BarChart data={revData} labelKey="year" valueKey="eur" maxVal={maxR}/>
      </Card>
      <Card>
        <SectionTitle>Top 5 kupaca</SectionTitle>
        {customers.slice(0,5).map((c,i) => (
          <div key={c.id} onClick={() => onNavigate("customers", c)} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 4px",borderRadius:6,cursor:"pointer",marginBottom:2}}
            onMouseEnter={e => e.currentTarget.style.background=C.cardH} onMouseLeave={e => e.currentTarget.style.background="transparent"}>
            <span style={{fontSize:10,fontWeight:800,color:C.txD,width:14}}>{i+1}</span>
            <span style={{fontSize:14}}>{c.flag}</span>
            <div style={{flex:1}}><div style={{fontSize:11,fontWeight:600}}>{c.name}</div><div style={{fontSize:9,color:C.txD}}>{c.city} · {c.invoices} fakt</div></div>
            <div style={{fontSize:12,fontWeight:700,color:C.or}}>{fe(c.revenue)}</div>
          </div>
        ))}
      </Card>
    </div>
    <Card style={{marginBottom:14}}>
      <SectionTitle>Po državama</SectionTitle>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        {coStats.map(([co,s]) => (
          <div key={co} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 12px",background:C.sf,borderRadius:7,border:`1px solid ${C.brd}`}}>
            <span style={{fontSize:18}}>{s.fl}</span><div><div style={{fontSize:11,fontWeight:700}}>{co}</div><div style={{fontSize:9,color:C.txD}}>{s.n} kup.</div></div>
            <div style={{fontSize:12,fontWeight:700,color:C.or,marginLeft:6}}>{fe(s.r)}</div>
          </div>
        ))}
      </div>
    </Card>
    {alerts.length > 0 && <Card style={{borderLeft:`3px solid ${C.rd}`}}>
      <div style={{fontSize:11,fontWeight:700,color:C.rd,marginBottom:8}}>⚠️ ALARMI — {alerts.length} uspavanih</div>
      {alerts.slice(0,5).map(c => (
        <div key={c.id} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 0",borderBottom:`1px solid ${C.brd}`}}>
          <span>{c.flag}</span><span style={{flex:1,fontSize:11}}>{c.name}</span>
          <Badge color={c.daysIdle>365?C.rd:C.yl} sm>{c.daysIdle}d</Badge>
          <span style={{fontSize:10,color:C.txD}}>{fe(c.revenue)}</span>
        </div>
      ))}
    </Card>}
  </>;
}
