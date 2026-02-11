import { C, priorityColor, statusLabel } from "../core/theme.js";
import { Card, Stat, Badge } from "../core/ui.jsx";
import { useActions, store } from "../core/store.js";

export default function Actions() {
  const actions = useActions();

  const toggle = (id) => {
    const a = actions.find(x => x.id === id);
    if (!a) return;
    const next = a.status === "pending" ? "in_progress" : a.status === "in_progress" ? "done" : "pending";
    store.update("actions", id, { status: next });
  };

  return <>
    <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
      <Stat label="AKCIJE" value={actions.length} color={C.bl} icon="🎯"/>
      <Stat label="HITNE" value={actions.filter(a => a.priority === "HITNO").length} color={C.rd} icon="🔴"/>
      <Stat label="U TOKU" value={actions.filter(a => a.status === "in_progress").length} color={C.yl} icon="🔄"/>
      <Stat label="ZAVRŠENO" value={actions.filter(a => a.status === "done").length} color={C.gr} icon="✅"/>
    </div>
    {["HITNO","VISOK","SREDNJI","NISKO"].map(p => {
      const its = actions.filter(a => a.priority === p);
      return its.length ? <div key={p} style={{marginBottom:14}}>
        <div style={{fontSize:10,fontWeight:700,color:priorityColor[p],letterSpacing:1.2,marginBottom:6}}>{p} ({its.length})</div>
        {its.map(a => (
          <Card key={a.id} onClick={() => toggle(a.id)} style={{marginBottom:5,padding:"9px 14px",borderLeft:`3px solid ${priorityColor[a.priority]}`,opacity:a.status==="done"?.5:1}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{flex:1}}>
                <div style={{fontSize:11,fontWeight:600,textDecoration:a.status==="done"?"line-through":"none"}}>{a.action}</div>
                <div style={{fontSize:9,color:C.txD,marginTop:2}}>{a.owner} · Rok: {a.deadline}</div>
              </div>
              <Badge color={a.status==="done"?C.gr:a.status==="in_progress"?C.yl:C.txD} sm>{statusLabel[a.status]}</Badge>
            </div>
          </Card>
        ))}
      </div> : null;
    })}
    <div style={{fontSize:9,color:C.txD,textAlign:"center",marginTop:10}}>Klikni na akciju: Čeka → U toku → Gotovo</div>
  </>;
}
