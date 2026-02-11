import { useState } from "react";
import { C, fe, gradeColor, statusColor } from "../core/theme.js";
import { Card, Badge, Input, DriveLink, SectionTitle } from "../core/ui.jsx";
import { useCustomers } from "../core/store.js";

export default function Customers({ selectedItem, onNavigate }) {
  const customers = useCustomers();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(selectedItem || null);

  const filt = customers.filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.city.toLowerCase().includes(q.toLowerCase()) || c.industry.toLowerCase().includes(q.toLowerCase()));

  if (sel) return (
    <div>
      <button onClick={() => setSel(null)} style={{background:"none",border:"none",color:C.or,cursor:"pointer",fontSize:11,marginBottom:10}}>← Nazad</button>
      <Card style={{marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div>
            <div style={{fontSize:20,fontWeight:800}}>{sel.flag} {sel.name}</div>
            <div style={{fontSize:11,color:C.txM}}>{sel.city}, {sel.country} · {sel.industry}</div>
            {sel.aka && <div style={{fontSize:10,color:C.txD}}>aka: {sel.aka}</div>}
          </div>
          <div style={{display:"flex",gap:5,flexDirection:"column",alignItems:"flex-end"}}>
            <div style={{display:"flex",gap:4}}><Badge color={gradeColor[sel.grade]}>Grade {sel.grade}</Badge><Badge color={statusColor[sel.status]}>{sel.status}</Badge></div>
            <DriveLink href={sel.driveLink}/>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
          {[["PRIHOD",fe(sel.revenue),C.or],["FAKTURE",`${sel.invoices}/${sel.items||"?"} st.`,C.bl],["PERIOD",sel.period,C.tx],["NEAKTIVAN",`${sel.daysIdle}d`,sel.daysIdle>180?C.rd:sel.daysIdle>90?C.yl:C.gr]].map(([l,v,c],i) => (
            <div key={i} style={{background:C.sf,padding:10,borderRadius:7}}>
              <div style={{fontSize:8,color:C.txD,letterSpacing:1}}>{l}</div>
              <div style={{fontSize:18,fontWeight:800,color:c}}>{v}</div>
            </div>
          ))}
        </div>
      </Card>
      {sel.notes && <Card style={{marginBottom:10}}><SectionTitle>Beleške</SectionTitle><div style={{fontSize:12,color:C.txM,lineHeight:1.5}}>{sel.notes}</div></Card>}
      {sel.furnaces?.length > 0 && <Card style={{marginBottom:10}}><SectionTitle>Peći / oprema</SectionTitle>{sel.furnaces.map((f,i) => <div key={i} style={{fontSize:11,padding:"3px 0",color:C.txM}}>🔥 {f}</div>)}</Card>}
      <Card><SectionTitle>Glavni materijali</SectionTitle>{(sel.topMaterials||[]).map((m,i) => <div key={i} style={{padding:"5px 0",borderBottom:`1px solid ${C.brd}`,fontSize:11,display:"flex",gap:6}}><span style={{color:C.or}}>●</span>{m}</div>)}</Card>
    </div>
  );

  return <>
    <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Pretraži kupce..." style={{width:"100%",marginBottom:10}}/>
    <div style={{display:"grid",gap:6}}>
      {filt.sort((a,b) => b.revenue - a.revenue).map(c => (
        <Card key={c.id} onClick={() => setSel(c)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px"}}>
          <span style={{fontSize:20}}>{c.flag}</span>
          <div style={{flex:1}}>
            <div style={{fontSize:12,fontWeight:700}}>{c.name}</div>
            <div style={{fontSize:9,color:C.txD}}>{c.city} · {c.industry} · {c.period}</div>
          </div>
          <div style={{display:"flex",gap:4,alignItems:"center"}}>
            {c.driveLink && <span title="Google Drive" style={{fontSize:12}}>📁</span>}
            <Badge color={statusColor[c.status]} sm>{c.status}</Badge>
            <Badge color={gradeColor[c.grade]} sm>{c.grade}</Badge>
            {c.daysIdle > 180 && <Badge color={C.rd} sm>⚠{c.daysIdle}d</Badge>}
          </div>
          <div style={{textAlign:"right",minWidth:72}}>
            <div style={{fontSize:13,fontWeight:700,color:C.or}}>{fe(c.revenue)}</div>
            <div style={{fontSize:9,color:C.txD}}>{c.invoices} fakt</div>
          </div>
        </Card>
      ))}
    </div>
  </>;
}
