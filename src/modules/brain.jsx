import { useState } from "react";
import { C, fe } from "../core/theme.js";
import { Card, Stat, Badge, SectionTitle } from "../core/ui.jsx";
import { useCustomers, useMaterials, store } from "../core/store.js";
import { brain } from "../core/neural.js";
import { SEED } from "../data/seed.js";

export default function Brain() {
  const customers = useCustomers();
  const materials = useMaterials();
  const [training, setTraining] = useState(false);
  const [trainResult, setTrainResult] = useState(null);
  const [predictions, setPredictions] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [selCust, setSelCust] = useState(null);

  const stats = brain.stats();

  const handleTrain = () => {
    setTraining(true);
    setTimeout(() => {
      const result = brain.retrain(customers, materials);
      setTrainResult(result);
      setTraining(false);
      // Auto-predict all customers
      const preds = customers.map(c => ({
        ...c,
        prediction: brain.predictChurn(c, customers),
      })).sort((a,b) => (b.prediction?.probability||0) - (a.prediction?.probability||0));
      setPredictions(preds);
      // Auto-forecast
      setForecast(brain.forecastRevenue(SEED.revenueByYear));
      store.log("brain_train", { customers: customers.length, materials: materials.length });
    }, 100);
  };

  const handleRecommend = (customer) => {
    setSelCust(customer);
    const recs = brain.recommendMaterials(customer, materials);
    setRecommendations(recs);
  };

  // Export/Import data
  const handleExport = () => {
    const json = store.export();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `molty-backup-${new Date().toISOString().split("T")[0]}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (store.import(ev.target.result)) {
          alert("Uvoz uspešan!");
        } else {
          alert("Greška pri uvozu!");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return <>
    {/* STATUS */}
    <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
      <Stat label="NEURAL NET" value={stats.trained ? "AKTIVAN" : "NEOBUČEN"} color={stats.trained ? C.gr : C.rd} icon="🧠"/>
      <Stat label="EPOHE" value={stats.churnEpochs} color={C.bl} icon="🔄"/>
      <Stat label="LOSS" value={stats.churnLoss} color={C.pu} icon="📉"/>
      <Stat label="EVENTS" value={store.getLog().length} color={C.cy} icon="📊"/>
    </div>

    {/* TRAIN BUTTON */}
    <Card style={{marginBottom:14}}>
      <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
        <button onClick={handleTrain} disabled={training}
          style={{padding:"10px 24px",borderRadius:8,border:"none",background:training?"#333":`linear-gradient(135deg,${C.or},${C.orD})`,color:"#fff",fontSize:13,fontWeight:700,cursor:training?"wait":"pointer",boxShadow:training?"none":`0 4px 16px ${C.or}44`}}>
          {training ? "🔄 Treniranje..." : "🧠 Treniraj Neural Net"}
        </button>
        <button onClick={handleExport} style={{padding:"8px 16px",borderRadius:6,border:`1px solid ${C.brd}`,background:"transparent",color:C.txM,fontSize:11,cursor:"pointer"}}>📤 Export JSON</button>
        <button onClick={handleImport} style={{padding:"8px 16px",borderRadius:6,border:`1px solid ${C.brd}`,background:"transparent",color:C.txM,fontSize:11,cursor:"pointer"}}>📥 Import JSON</button>
      </div>
      {trainResult && <div style={{fontSize:10,color:C.gr}}>
        ✅ Churn model: {trainResult.churn.samples} kupaca, {trainResult.churn.epochs} epoha, loss={trainResult.churn.loss.toFixed(6)} · Materijali: {trainResult.materials.industries} industrija
      </div>}
      <div style={{fontSize:9,color:C.txD,marginTop:6}}>
        Mreža: {stats.churnLayers} · Self-learning: svaki CRUD loguje event → retrain poboljšava predikcije
      </div>
    </Card>

    {/* CHURN PREDICTIONS */}
    {predictions && <Card style={{marginBottom:14}}>
      <SectionTitle>🎯 Churn Prediction — Rizik odlaska kupaca</SectionTitle>
      <div style={{display:"grid",gap:5}}>
        {predictions.map(c => {
          const p = c.prediction;
          if (!p) return null;
          return (
            <div key={c.id} onClick={() => handleRecommend(c)} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:6,cursor:"pointer",
              background:p.probability > 0.5 ? C.rd + "08" : "transparent", border:`1px solid ${p.color}22`}}
              onMouseEnter={e => e.currentTarget.style.background = C.cardH} onMouseLeave={e => e.currentTarget.style.background = p.probability>0.5?C.rd+"08":"transparent"}>
              <span style={{fontSize:14}}>{c.flag}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:11,fontWeight:600}}>{c.name}</div>
                <div style={{fontSize:9,color:C.txD}}>{c.city} · {c.daysIdle}d idle · {fe(c.revenue)}</div>
              </div>
              {/* Probability bar */}
              <div style={{width:80,height:6,background:C.sf,borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${p.probability*100}%`,background:p.color,borderRadius:3}}/>
              </div>
              <div style={{width:40,textAlign:"right",fontSize:12,fontWeight:800,color:p.color}}>{(p.probability*100).toFixed(0)}%</div>
              <Badge color={p.color} sm>{p.risk}</Badge>
            </div>
          );
        })}
      </div>
    </Card>}

    {/* MATERIAL RECOMMENDATIONS */}
    {recommendations && selCust && <Card style={{marginBottom:14}}>
      <SectionTitle>💡 AI Preporuke za {selCust.name}</SectionTitle>
      <div style={{fontSize:10,color:C.txM,marginBottom:8}}>Materijali koji odgovaraju industriji "{selCust.industry}" — bazirano na obrascima kupovine</div>
      <div style={{display:"grid",gap:4}}>
        {recommendations.slice(0,6).map((m,i) => (
          <div key={m.id||i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",borderRadius:5,background:i<3?C.or+"08":"transparent",border:`1px solid ${C.brd}`}}>
            <span style={{fontSize:10,fontWeight:800,color:i<3?C.or:C.txD,width:18}}>{i+1}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:11,fontWeight:500}}>{m.name}</div>
              <div style={{fontSize:9,color:C.txD}}>{m.cat} · {fe(m.price)}/{m.unit}</div>
            </div>
            <div style={{fontSize:10,fontWeight:700,color:C.or}}>AI: {m.aiScore?.toFixed(1)}</div>
          </div>
        ))}
      </div>
    </Card>}

    {/* REVENUE FORECAST */}
    {forecast && <Card style={{marginBottom:14}}>
      <SectionTitle>📈 Revenue Forecast</SectionTitle>
      <div style={{display:"flex",gap:10,marginBottom:10}}>
        <Badge color={forecast.trend==="RAST"?C.gr:C.rd}>{forecast.trend} {forecast.slope>0?"+":""}{forecast.slope} EUR/god</Badge>
        <Badge color={C.pu} sm>Conf: {(forecast.confidence*100).toFixed(0)}%</Badge>
      </div>
      {forecast.predictions.map(p => (
        <div key={p.year} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:`1px solid ${C.brd}`}}>
          <span style={{fontSize:12,fontWeight:700,color:C.pu,width:40}}>{p.year}</span>
          <div style={{flex:1,height:14,background:C.sf,borderRadius:3,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${Math.min(100,p.eur/3500)}%`,background:`linear-gradient(90deg,${C.pu}66,${C.pu})`,borderRadius:3}}/>
          </div>
          <span style={{fontSize:11,fontWeight:700,color:C.pu}}>{fe(p.eur)}</span>
          <Badge color={C.pu} sm>PRED</Badge>
        </div>
      ))}
    </Card>}

    {/* DATA STATS */}
    <Card>
      <SectionTitle>📦 Store podataka</SectionTitle>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
        {Object.entries(store.stats()).map(([k,v]) => (
          <div key={k} style={{background:C.sf,padding:8,borderRadius:6}}>
            <div style={{fontSize:8,color:C.txD,textTransform:"uppercase"}}>{k}</div>
            <div style={{fontSize:16,fontWeight:700}}>{v}</div>
          </div>
        ))}
      </div>
    </Card>
  </>;
}
