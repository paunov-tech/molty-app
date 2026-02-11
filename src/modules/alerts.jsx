import { useMemo } from "react";
import { C, fe, gradeColor } from "../core/theme.js";
import { Card, Badge } from "../core/ui.jsx";
import { useCustomers } from "../core/store.js";

export default function Alerts({ onNavigate }) {
  const customers = useCustomers();
  const alerts = useMemo(() => customers.filter(c => c.daysIdle > 90).sort((a,b) => b.daysIdle - a.daysIdle), [customers]);

  return <>
    <Card style={{marginBottom:10,borderLeft:`3px solid ${C.rd}`}}>
      <div style={{fontSize:12,fontWeight:700,color:C.rd,marginBottom:3}}>⚠️ {alerts.length} kupaca bez narudžbe 90+ dana</div>
      <div style={{fontSize:10,color:C.txM}}>Uspavani prihod: {fe(alerts.reduce((s,c) => s + c.revenue, 0))}</div>
    </Card>
    <div style={{display:"grid",gap:6}}>
      {alerts.map(c => (
        <Card key={c.id} onClick={() => onNavigate("customers", c)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderLeft:`3px solid ${c.daysIdle>365?C.rd:c.daysIdle>180?C.or:C.yl}`}}>
          <span style={{fontSize:18}}>{c.flag}</span>
          <div style={{flex:1}}>
            <div style={{fontSize:12,fontWeight:700}}>{c.name}</div>
            <div style={{fontSize:9,color:C.txD}}>{c.city} · {c.industry} · Posl: {c.lastOrder}</div>
          </div>
          <div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:800,color:c.daysIdle>365?C.rd:c.daysIdle>180?C.or:C.yl}}>{c.daysIdle}</div><div style={{fontSize:7,color:C.txD}}>DANA</div></div>
          <div style={{textAlign:"right",minWidth:60}}><div style={{fontSize:11,fontWeight:700,color:C.or}}>{fe(c.revenue)}</div><Badge color={gradeColor[c.grade]} sm>{c.grade}</Badge></div>
        </Card>
      ))}
    </div>
  </>;
}
