// ═══════════════════════════════════════════════════
// MOLTY CORE: UI KOMPONENTE — NE MENJAJ OVAJ FAJL
// Svaki modul koristi ove komponente
// ═══════════════════════════════════════════════════
import { useState } from "react";
import { C, fm, fe } from "./theme.js";

export const Badge = ({color,children,sm}) => (
  <span style={{display:"inline-block",padding:sm?"1px 6px":"2px 10px",borderRadius:4,
    fontSize:sm?9:10,fontWeight:700,letterSpacing:.5,
    background:color+"18",color,border:`1px solid ${color}33`,whiteSpace:"nowrap"}}>
    {children}
  </span>
);

export const Card = ({children,style,onClick}) => {
  const[h,setH]=useState(false);
  return(
    <div onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{background:h&&onClick?C.cardH:C.card,border:`1px solid ${h&&onClick?C.or+"44":C.brd}`,
        borderRadius:10,padding:16,cursor:onClick?"pointer":"default",transition:"all .15s",...style}}>
      {children}
    </div>
  );
};

export const Stat = ({label,value,sub,color=C.or,icon}) => (
  <Card style={{flex:1,minWidth:130}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
      <div>
        <div style={{fontSize:9,color:C.txD,letterSpacing:1.2,fontWeight:700,marginBottom:5,textTransform:"uppercase"}}>{label}</div>
        <div style={{fontSize:24,fontWeight:800,color,letterSpacing:-.5,lineHeight:1}}>{value}</div>
        {sub&&<div style={{fontSize:10,color:C.txM,marginTop:4}}>{sub}</div>}
      </div>
      {icon&&<span style={{fontSize:20,opacity:.4}}>{icon}</span>}
    </div>
  </Card>
);

export const Input = (props) => (
  <input {...props} style={{padding:"7px 10px",borderRadius:6,border:`1px solid ${C.brd}`,
    background:C.sf,color:C.tx,fontSize:12,...(props.style||{})}} />
);

export const Select = (props) => (
  <select {...props} style={{width:"100%",padding:"7px 10px",borderRadius:6,
    border:`1px solid ${C.brd}`,background:C.sf,color:C.tx,fontSize:12,...(props.style||{})}} />
);

export const SectionTitle = ({children}) => (
  <div style={{fontSize:10,fontWeight:700,color:C.txD,letterSpacing:1.2,marginBottom:10,textTransform:"uppercase"}}>{children}</div>
);

export const DriveLink = ({href}) => href ? (
  <a href={href} target="_blank" rel="noopener noreferrer"
    style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:5,
      background:"#4285f422",border:"1px solid #4285f444",color:"#4285f4",
      fontSize:10,fontWeight:600,textDecoration:"none",cursor:"pointer"}}>
    📁 Google Drive
  </a>
) : null;

export const BarChart = ({data,labelKey,valueKey,maxVal,color=C.or,formatVal=fe}) => (
  <div>
    {data.map((r,i) => (
      <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
        <span style={{fontSize:10,color:C.txD,width:34,fontWeight:700,fontFamily:"monospace"}}>{r[labelKey]}</span>
        <div style={{flex:1,height:16,background:C.sf,borderRadius:3,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${(r[valueKey]/maxVal)*100}%`,background:`linear-gradient(90deg,${color}66,${color})`,borderRadius:3,transition:"width .6s"}}/>
        </div>
        <span style={{fontSize:10,fontWeight:700,color:r[valueKey]===maxVal?color:C.tx,minWidth:56,textAlign:"right",fontFamily:"monospace"}}>{formatVal(r[valueKey])}</span>
      </div>
    ))}
  </div>
);
