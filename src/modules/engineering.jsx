import { useState, useMemo } from "react";
import { C, fe } from "../core/theme.js";
import { Card, Input, SectionTitle } from "../core/ui.jsx";
import { useTDS, useStore } from "../core/store.js";

export default function Engineering() {
  const tds = useTDS();
  const cifMetals = useStore("cifMetals");
  const cifLinings = useStore("cifLinings");
  const silicaGrades = useStore("silicaGrades");

  const [engTab, setEngTab] = useState("tds");
  const [selTDS, setSelTDS] = useState(null);

  // CIF state
  const [cifMetal, setCifMetal] = useState("IRON");
  const [cifLining, setCifLining] = useState("SILICA_MIX_5");
  const [cifOD, setCifOD] = useState(1200);
  const [cifH, setCifH] = useState(1500);
  const [cifWall, setCifWall] = useState(80);

  // Silica state
  const [silTemp, setSilTemp] = useState(1550);

  // CIF Calc
  const cifResult = useMemo(() => {
    const metal = cifMetals.find(m => m.id === cifMetal);
    const lining = cifLinings.find(l => l.id === cifLining);
    if (!metal || !lining) return null;
    const rOuter = cifOD / 2 / 1000;
    const rInner = rOuter - cifWall / 1000;
    const hM = cifH / 1000;
    const vOuter = Math.PI * rOuter * rOuter * hM;
    const vInner = Math.PI * rInner * rInner * hM;
    const vLining = vOuter - vInner;
    const vBottom = Math.PI * rInner * rInner * (cifWall / 1000);
    const vTotalLining = vLining + vBottom;
    const metalWeight = vInner * metal.density * 1000;
    const liningWeight = vTotalLining * lining.density * 1000;
    return { vLining: vTotalLining, metalWeight, liningWeight, metalName: metal.name, liningName: lining.name, rInnerMM: rInner * 1000, capCheck: Math.round(vInner * metal.density * 1000) };
  }, [cifMetal, cifLining, cifOD, cifH, cifWall, cifMetals, cifLinings]);

  // Silica grade
  const silGrade = silicaGrades.find(g => silTemp >= g.minTemp && silTemp <= g.maxTemp);

  const subTabs = [
    { id:"tds", lb:`📋 TDS Baza (${tds.length})` },
    { id:"cif", lb:"🔬 CIF Kalkulator" },
    { id:"silica", lb:"🌡 Silica Selektor" },
  ];

  return <>
    <div style={{display:"flex",gap:4,marginBottom:14}}>
      {subTabs.map(t => (
        <button key={t.id} onClick={() => { setEngTab(t.id); setSelTDS(null); }}
          style={{padding:"7px 14px",borderRadius:6,border:engTab===t.id?`1px solid ${C.or}33`:"1px solid transparent",background:engTab===t.id?C.or+"15":"transparent",color:engTab===t.id?C.or:C.txM,fontSize:11,cursor:"pointer",fontWeight:engTab===t.id?700:500}}>
          {t.lb}
        </button>
      ))}
    </div>

    {/* ── TDS BAZA ── */}
    {engTab === "tds" && <>
      {selTDS ? <div>
        <button onClick={() => setSelTDS(null)} style={{background:"none",border:"none",color:C.or,cursor:"pointer",fontSize:11,marginBottom:10}}>← Nazad</button>
        <Card style={{marginBottom:10}}>
          <div style={{fontSize:18,fontWeight:800,color:C.or,marginBottom:4}}>{selTDS.name}</div>
          <div style={{fontSize:11,color:C.txM,marginBottom:12}}>{selTDS.code} · {selTDS.type} · Tmax {selTDS.tMax}°C</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
            {[["GLAVNI SASTOJAK",selTDS.mainComp],["VEZIVO",selTDS.bond],["GUSTINA (t/m³)",selTDS.density]].map(([l,v],i) => (
              <div key={i} style={{background:C.sf,padding:10,borderRadius:7}}><div style={{fontSize:8,color:C.txD}}>{l}</div><div style={{fontSize:14,fontWeight:700,color:i===2?C.or:C.tx}}>{v}</div></div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <SectionTitle>Hemijski sastav (%)</SectionTitle>
              {Object.entries(selTDS.chem||{}).map(([k,v]) => <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:`1px solid ${C.brd}`,fontSize:11}}><span style={{color:C.txM}}>{k}</span><span style={{fontWeight:600}}>{v}%</span></div>)}
            </div>
            <div>
              <SectionTitle>Toplotna provodnost λ (W/mK)</SectionTitle>
              {Object.entries(selTDS.lambda||{}).map(([t,v]) => <div key={t} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:`1px solid ${C.brd}`,fontSize:11}}><span style={{color:C.txM}}>{t}°C</span><span style={{fontWeight:600}}>{v}</span></div>)}
              {selTDS.ccs && Object.keys(selTDS.ccs).length > 0 && <>
                <div style={{fontSize:10,fontWeight:700,color:C.txD,marginTop:10,marginBottom:6}}>CCS (MPa)</div>
                {Object.entries(selTDS.ccs).map(([t,v]) => <div key={t} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:`1px solid ${C.brd}`,fontSize:11}}><span style={{color:C.txM}}>{t}°C</span><span style={{fontWeight:600}}>{v}</span></div>)}
              </>}
            </div>
          </div>
          <div style={{marginTop:14,padding:10,background:C.sf,borderRadius:7}}>
            <div style={{fontSize:10,fontWeight:700,color:C.txD,marginBottom:4}}>PRIMENA</div>
            <div style={{fontSize:12,color:C.txM,lineHeight:1.5}}>{selTDS.applications}</div>
          </div>
          <div style={{marginTop:8,fontSize:11,color:C.txD}}>
            Ugradnja: {selTDS.install} · Zrno: {selTDS.grainMax}mm{selTDS.water ? ` · Voda: ${selTDS.water}` : ""}{selTDS.shelfLife ? ` · Rok: ${selTDS.shelfLife}` : ""}
          </div>
        </Card>
      </div> :
      <div style={{display:"grid",gap:6}}>
        {tds.map(t => (
          <Card key={t.id} onClick={() => setSelTDS(t)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px"}}>
            <div style={{width:36,height:36,borderRadius:8,background:`linear-gradient(135deg,${C.or}22,${C.orD}22)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:C.or,flexShrink:0}}>
              {t.tMax > 1600 ? "🔴" : t.tMax > 1400 ? "🟠" : "🟡"}
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:600}}>{t.name}</div>
              <div style={{fontSize:9,color:C.txD}}>{t.code} · {t.type} · ρ={t.density}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:14,fontWeight:700,color:C.or}}>Tmax {t.tMax}°C</div>
              <div style={{fontSize:9,color:C.txD}}>{t.mainComp}</div>
            </div>
          </Card>
        ))}
      </div>}
    </>}

    {/* ── CIF KALKULATOR ── */}
    {engTab === "cif" && <>
      <Card style={{marginBottom:12}}>
        <div style={{fontSize:13,fontWeight:700,color:C.or,marginBottom:10}}>🔬 CIF Volume Calculator — Indukciona Peć</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><label style={{fontSize:10,color:C.txD,display:"block",marginBottom:4}}>Metal</label>
            <select value={cifMetal} onChange={e => setCifMetal(e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:`1px solid ${C.brd}`,background:C.sf,color:C.tx,fontSize:12}}>
              {cifMetals.map(m => <option key={m.id} value={m.id}>{m.name} (ρ={m.density})</option>)}
            </select></div>
          <div><label style={{fontSize:10,color:C.txD,display:"block",marginBottom:4}}>Obloga</label>
            <select value={cifLining} onChange={e => setCifLining(e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:`1px solid ${C.brd}`,background:C.sf,color:C.tx,fontSize:12}}>
              {cifLinings.map(l => <option key={l.id} value={l.id}>{l.name} (ρ={l.density})</option>)}
            </select></div>
          <div><label style={{fontSize:10,color:C.txD,display:"block",marginBottom:4}}>Spoljni Ø (mm)</label><Input type="number" value={cifOD} onChange={e => setCifOD(+e.target.value)} style={{width:"100%"}}/></div>
          <div><label style={{fontSize:10,color:C.txD,display:"block",marginBottom:4}}>Visina H (mm)</label><Input type="number" value={cifH} onChange={e => setCifH(+e.target.value)} style={{width:"100%"}}/></div>
          <div><label style={{fontSize:10,color:C.txD,display:"block",marginBottom:4}}>Debljina obloge (mm)</label><Input type="number" value={cifWall} onChange={e => setCifWall(+e.target.value)} style={{width:"100%"}}/></div>
        </div>
      </Card>
      {cifResult && <Card>
        <SectionTitle>Rezultat</SectionTitle>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
          <div style={{background:C.sf,padding:12,borderRadius:7,textAlign:"center"}}><div style={{fontSize:8,color:C.txD}}>ZAPREMINA OBLOGE</div><div style={{fontSize:20,fontWeight:800,color:C.or}}>{(cifResult.vLining*1000).toFixed(1)} L</div></div>
          <div style={{background:C.sf,padding:12,borderRadius:7,textAlign:"center"}}><div style={{fontSize:8,color:C.txD}}>MASA OBLOGE</div><div style={{fontSize:20,fontWeight:800,color:C.bl}}>{cifResult.liningWeight.toFixed(0)} kg</div></div>
          <div style={{background:C.sf,padding:12,borderRadius:7,textAlign:"center"}}><div style={{fontSize:8,color:C.txD}}>KAPACITET METALA</div><div style={{fontSize:20,fontWeight:800,color:C.gr}}>{cifResult.capCheck} kg</div></div>
        </div>
        <div style={{marginTop:10,fontSize:10,color:C.txD,lineHeight:1.6}}>
          Metal: {cifResult.metalName} · Obloga: {cifResult.liningName} · R unutr: {cifResult.rInnerMM.toFixed(0)}mm
        </div>
      </Card>}
    </>}

    {/* ── SILICA GRADE SELECTOR ── */}
    {engTab === "silica" && <Card>
      <div style={{fontSize:13,fontWeight:700,color:C.or,marginBottom:12}}>🌡 Silica Mix Grade Selector</div>
      <div style={{marginBottom:16}}>
        <label style={{fontSize:10,color:C.txD,display:"block",marginBottom:6}}>Radna temperatura: <span style={{fontSize:16,fontWeight:800,color:C.or}}>{silTemp}°C</span></label>
        <input type="range" min={1300} max={1700} value={silTemp} onChange={e => setSilTemp(+e.target.value)} style={{width:"100%",accentColor:C.or}}/>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:C.txD}}><span>1300°C</span><span>1500°C</span><span>1700°C</span></div>
      </div>
      {silGrade && <div style={{padding:16,borderRadius:8,background:silGrade.grade.includes("OUT")?C.rd+"22":C.or+"15",border:`1px solid ${silGrade.grade.includes("OUT")?C.rd:C.or}44`,marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:800,color:silGrade.grade.includes("OUT")?C.rd:C.or,marginBottom:6}}>{silGrade.grade}</div>
        {silGrade.sinter && <div style={{fontSize:11,color:C.txM}}>Temp. sinterovanja: {silGrade.sinter}°C</div>}
      </div>}
      <SectionTitle>Sve grade opcije</SectionTitle>
      {silicaGrades.map((g,i) => (
        <div key={i} style={{display:"flex",alignItems:"center",padding:"6px 8px",marginBottom:3,borderRadius:6,
          background:silTemp>=g.minTemp&&silTemp<=g.maxTemp?C.or+"15":"transparent",
          border:`1px solid ${silTemp>=g.minTemp&&silTemp<=g.maxTemp?C.or+"44":C.brd}`}}>
          <span style={{fontSize:10,color:C.txD,width:80}}>{g.minTemp}–{g.maxTemp}°C</span>
          <span style={{flex:1,fontSize:11,fontWeight:silTemp>=g.minTemp&&silTemp<=g.maxTemp?700:400,
            color:silTemp>=g.minTemp&&silTemp<=g.maxTemp?C.or:C.txM}}>{g.grade}</span>
          {g.sinter && <span style={{fontSize:9,color:C.txD}}>Sint: {g.sinter}°C</span>}
        </div>
      ))}
    </Card>}
  </>;
}
