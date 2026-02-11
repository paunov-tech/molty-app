import { C, fe, stageColor } from "../core/theme.js";
import { Card, Stat, Badge } from "../core/ui.jsx";
import { usePipeline } from "../core/store.js";

export default function Pipeline() {
  const pipeline = usePipeline();
  const pipTot = pipeline.reduce((s,p) => s + p.value, 0);
  const pipW = pipeline.reduce((s,p) => s + p.value * p.probability / 100, 0);

  return <>
    <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
      <Stat label="PIPELINE" value={fe(pipTot)} icon="💰"/>
      <Stat label="PONDERISANO" value={fe(Math.round(pipW))} color={C.gr} icon="📊"/>
      <Stat label="DEALS" value={pipeline.length} color={C.bl} icon="🤝"/>
    </div>
    <div style={{display:"grid",gap:8}}>
      {pipeline.sort((a,b) => b.value - a.value).map(p => (
        <Card key={p.id} style={{padding:"11px 14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:7}}>
            <div><div style={{fontSize:13,fontWeight:700}}>{p.deal}</div><div style={{fontSize:10,color:C.txM}}>{p.customer}</div></div>
            <div style={{textAlign:"right"}}><div style={{fontSize:15,fontWeight:800,color:C.or}}>{fe(p.value)}</div><Badge color={stageColor[p.stage]}>{p.stage}</Badge></div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:5}}>
            <div style={{flex:1,height:5,background:C.sf,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${p.probability}%`,background:p.probability>60?C.gr:p.probability>40?C.yl:C.rd,borderRadius:3}}/></div>
            <span style={{fontSize:10,fontWeight:700}}>{p.probability}%</span>
          </div>
          <div style={{fontSize:10,color:C.txD,fontStyle:"italic"}}>{p.notes}</div>
        </Card>
      ))}
    </div>
  </>;
}
