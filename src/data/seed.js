// ═══════════════════════════════════════════════════
// MOLTY DATA: SEED — Svi podaci na jednom mestu
// Ovo se učitava samo kad nema localStorage podataka
// ═══════════════════════════════════════════════════

export const SEED = {
  customers: [
    { id:1,name:"ArcelorMittal Zenica",aka:"AMZ",country:"BA",flag:"🇧🇦",city:"Zenica",industry:"Čelik",grade:"A",invoices:21,items:43,revenue:350638,period:"2021-2024",status:"active",lastOrder:"2024-12-15",daysIdle:55,lat:44.20,lng:17.91,driveLink:"https://drive.google.com/drive/folders/1CPlAR5R3YSzWv1besIYvCmQLp9rtNKT0",topMaterials:["Brick ERSPIN 8003","Brick ERMAG 6024","FC Brick A43","CALDE FLOW G UC 70S20","IF Brick PORIT10","CALDE TROWEL HQ 82 U","CALDE CAST MW STRONG LITE"],notes:"Istorijski NAJVEĆI kupac. 35% ukupnog prihoda. EAF + LF + CCM.",furnaces:["EAF","LF","CCM"] },
    { id:2,name:"HBIS Group Serbia",aka:"Železara Smederevo",country:"RS",flag:"🇷🇸",city:"Smederevo",industry:"Čelik",grade:"A",invoices:3,items:4,revenue:145513,period:"2024-2026",status:"active",lastOrder:"2026-01-20",daysIdle:19,lat:44.66,lng:20.93,driveLink:"https://drive.google.com/drive/folders/1FxuWtT6qfH0QPiOoewUt_xQq0RJUNA4-",topMaterials:["CALDER GUN SUPERAL X 70","CALDE PATCH PB 82 U"],notes:"BOF tender aktivan. Kinezi nude niže cene — kvalitet je argument.",furnaces:["2x BOF 120t","1x EAF 100t","2x LF"] },
    { id:3,name:"Progress AD",aka:"Progress",country:"BG",flag:"🇧🇬",city:"Plovdiv",industry:"Čelik",grade:"A",invoices:12,items:12,revenue:91154,period:"2022-2024",status:"active",lastOrder:"2024-09-10",daysIdle:151,lat:42.15,lng:24.75,driveLink:"",topMaterials:["SILICA MIX 7 A 0,6","SILICA MIX 5 A 0,8","CALDE SILICA MIX 5 A 0,6"],notes:"Indukcione peći za čelik. Redovne porudžbine Silica Mix-a.",furnaces:["Indukcione peći"] },
    { id:4,name:"Moravacem",aka:"CRH Popovac",country:"RS",flag:"🇷🇸",city:"Popovac",industry:"Cement",grade:"B",invoices:5,items:15,revenue:72240,period:"2021-2024",status:"active",lastOrder:"2024-01-31",daysIdle:373,lat:43.85,lng:21.40,driveLink:"https://drive.google.com/drive/folders/1z2L4vUNuTLcbHXgb8wPjnmym8zU6vbDw",topMaterials:["CALDE GUN MW STRONG LITE","CALDE CAST XL 106 C/G","CALDE GUN MM 55 S5","CALDE SOL CAST A 50 SZ"],notes:"Cement rotaciona peć. SOL CAST + GUN ponuda u toku.",furnaces:["Rotaciona peć za cement"] },
    { id:5,name:"Cimos d.d.",aka:"Cimos",country:"SI",flag:"🇸🇮",city:"Koper",industry:"Livnica",grade:"A",invoices:10,items:18,revenue:66992,period:"2021-2023",status:"dormant",lastOrder:"2023-10-19",daysIdle:477,lat:45.54,lng:13.73,driveLink:"https://drive.google.com/drive/folders/1QQUZvOrWPAtsyMQCc3RwCLPhybFAI-u_",topMaterials:["CALDE MIX SA 68 S MD","CALDE CAST T 96"],notes:"USPAVAN 477 DANA! Hitna reaktivacija.",furnaces:["Indukcione peći za livenje"] },
    { id:6,name:"Autoflex Livnica Čoka",aka:"Autoflex",country:"RS",flag:"🇷🇸",city:"Čoka",industry:"Livnica",grade:"B",invoices:4,items:10,revenue:59790,period:"2023-2024",status:"active",lastOrder:"2024-11-20",daysIdle:80,lat:45.94,lng:20.14,driveLink:"https://drive.google.com/drive/folders/1m8BdAHMm2SHPeihBGY0hwb8Vs_XtC6Ft",topMaterials:["CALDE CAST F 65","CALDE CAST LX 58","CALDE CAST T 96"],notes:"Redovan kupac. CAST F 65 + CAST LX 58 combo.",furnaces:["Indukcione livačke peći"] },
    { id:7,name:"Bamex Metal BG",aka:"Bamex",country:"BG",flag:"🇧🇬",city:"Plovdiv",industry:"Livnica",grade:"B",invoices:4,items:4,revenue:33631,period:"2022-2023",status:"dormant",lastOrder:"2023-09-27",daysIdle:499,lat:42.14,lng:24.74,driveLink:"",topMaterials:["SILICA MIX 5 A 0,8","SILICA MIX 5 A 0,6"],notes:"USPAVAN 499 DANA!",furnaces:["Indukcione peći"] },
    { id:8,name:"OSSAM AD",aka:"OSSAM",country:"BG",flag:"🇧🇬",city:"Lovech",industry:"Čelik",grade:"B",invoices:4,items:9,revenue:29997,period:"2022-2024",status:"active",lastOrder:"2024-01-15",daysIdle:389,lat:43.14,lng:24.72,driveLink:"",topMaterials:["CALDE SILICA MIX 5 A 0,6","CALDE CAST HYMOR 80 Al"],notes:"Čelik + livnica Bugarska.",furnaces:["IF za čelik"] },
    { id:9,name:"Bamex Metal BG Ltd",aka:"Bamex Ltd",country:"BG",flag:"🇧🇬",city:"Plovdiv",industry:"Čelik",grade:"B",invoices:4,items:4,revenue:28405,period:"2022-2024",status:"active",lastOrder:"2024-05-15",daysIdle:269,lat:42.15,lng:24.75,driveLink:"",topMaterials:["SILICA MIX 5 A 0,6"],notes:"Druga firma Bamex grupe.",furnaces:["IF"] },
    { id:10,name:"Valjaonica Bakra Sevojno",aka:"VBS",country:"RS",flag:"🇷🇸",city:"Sevojno",industry:"Bakar",grade:"B",invoices:2,items:5,revenue:26723,period:"2023-2023",status:"dormant",lastOrder:"2023-06-15",daysIdle:603,lat:43.84,lng:19.88,driveLink:"",topMaterials:["CALDE CAST HYMOR 2800","CALDE TROWEL HQ 82 U"],notes:"USPAVAN 603 DANA!",furnaces:["Peći za topljenje bakra"] },
    { id:11,name:"Livarna Gorica d.o.o.",aka:"Livarna Gorica",country:"SI",flag:"🇸🇮",city:"Nova Gorica",industry:"Livnica",grade:"B",invoices:2,items:6,revenue:21132,period:"2023-2023",status:"dormant",lastOrder:"2023-04-20",daysIdle:659,lat:45.96,lng:13.64,driveLink:"",topMaterials:["CALDE CAST F 65","CALDE CAST LX 58"],notes:"USPAVAN 659 DANA!",furnaces:["IF za livenje"] },
    { id:12,name:"Berg Montana Fittings",aka:"Berg Montana",country:"BG",flag:"🇧🇬",city:"Montana",industry:"Livnica",grade:"C",invoices:5,items:10,revenue:12987,period:"2023-2024",status:"active",lastOrder:"2024-06-10",daysIdle:243,lat:43.41,lng:23.23,driveLink:"",topMaterials:["CALDE CAST T 96","CALDE CAST HR 70 BFS"],notes:"Castable za indukcione peći.",furnaces:["IF"] },
    { id:13,name:"LAFARGE BFC",aka:"Lafarge Beočin",country:"RS",flag:"🇷🇸",city:"Beočin",industry:"Cement",grade:"C",invoices:2,items:2,revenue:10810,period:"2019-2019",status:"dormant",lastOrder:"2019-09-12",daysIdle:2340,lat:45.19,lng:19.72,driveLink:"https://drive.google.com/drive/folders/1JHDVoLsE7V-W7V8ke_hUUOBlxGp33qG7",topMaterials:["Installation services"],notes:"USPAVAN 2340 DANA!",furnaces:["Rotaciona peć"] },
    { id:14,name:"Livar d.d.",aka:"Livar",country:"SI",flag:"🇸🇮",city:"Ivančna Gorica",industry:"Livnica",grade:"C",invoices:1,items:1,revenue:3229,period:"2024-2024",status:"active",lastOrder:"2024-03-10",daysIdle:335,lat:45.94,lng:14.80,driveLink:"https://drive.google.com/drive/folders/1DPsYo77mzD8uI2mmS3nNW9NsP_y-RIbi",topMaterials:["CALDE SILICA MIX 5 A 0,6"],notes:"Slovenačka livnica.",furnaces:["IF"] },
    { id:15,name:"Valji d.o.o.",aka:"Valji",country:"SI",flag:"🇸🇮",city:"Štore",industry:"Čelik",grade:"C",invoices:1,items:2,revenue:3008,period:"2026-2026",status:"active",lastOrder:"2026-01-30",daysIdle:9,lat:46.22,lng:15.31,driveLink:"https://drive.google.com/drive/folders/1pBwexCh0vWOob7IUynJAmSQhENzTKCi3",topMaterials:["CALDE SILICA MIX 5 A 0,6"],notes:"Nov kupac 2026!",furnaces:["IF za čelik"] },
    { id:16,name:"Cranfield Foundry",aka:"Cranfield",country:"MK",flag:"🇲🇰",city:"Skoplje",industry:"Livnica",grade:"C",invoices:2,items:2,revenue:2678,period:"2020-2020",status:"dormant",lastOrder:"2020-08-15",daysIdle:1998,lat:41.99,lng:21.43,driveLink:"https://drive.google.com/drive/folders/1q9_fwajq0RA5zUeFHUOdzFM8muzWrvv_",topMaterials:["CALDE FLOW G UC 60S20"],notes:"USPAVAN 1998 DANA!",furnaces:["IF"] },
    { id:17,name:"Ferro Preis d.o.o.",aka:"Ferro Preis",country:"HR",flag:"🇭🇷",city:"Zagreb",industry:"Livnica",grade:"C",invoices:3,items:6,revenue:2422,period:"2024-2024",status:"active",lastOrder:"2024-07-05",daysIdle:218,lat:45.81,lng:15.98,driveLink:"",topMaterials:["CALDE MIX SA 68 S"],notes:"Hrvatska livnica.",furnaces:["IF"] },
    { id:18,name:"MIV Varaždin",aka:"MIV",country:"HR",flag:"🇭🇷",city:"Varaždin",industry:"Livnica",grade:"C",invoices:1,items:1,revenue:677,period:"2026-2026",status:"active",lastOrder:"2026-01-28",daysIdle:11,lat:46.30,lng:16.34,driveLink:"https://drive.google.com/drive/folders/1b08jl2CYJPNUh7sQIvTMZ2RTafSXd3Qz",topMaterials:["CALDE CAST T 96"],notes:"Nov kupac 2026!",furnaces:["IF"] },
  ],

  materials: [
    { id:1,name:"CALDER GUN SUPERAL X 70",code:"1007066",unit:"TO",price:1852.63,sales:3,totalEur:133038,cat:"Gunning",tMax:1700 },
    { id:2,name:"SILICA MIX 5 A 0,6",code:"1003642",unit:"TO",price:422.68,sales:15,totalEur:109728,cat:"Silica",tMax:1650 },
    { id:3,name:"Brick ERSPIN 8003 Ty.30/0",code:"2018121",unit:"TO",price:2271.60,sales:3,totalEur:108125,cat:"Brick",tMax:1800 },
    { id:4,name:"Brick ERMAG 6024 Ty.30/0",code:"2018120",unit:"TO",price:3164.10,sales:3,totalEur:71249,cat:"Brick",tMax:1700 },
    { id:5,name:"SILICA MIX 7 A 0,6",code:"1002349",unit:"TO",price:335.00,sales:4,totalEur:27778,cat:"Silica",tMax:1650 },
    { id:6,name:"CALDE PATCH PB 82 U",code:"1012745",unit:"TO",price:2479.00,sales:3,totalEur:24790,cat:"Patching",tMax:1750 },
    { id:7,name:"CALDE GUN MM 55 S5",code:"1012341",unit:"TO",price:1158.00,sales:2,totalEur:24300,cat:"Gunning",tMax:1500 },
    { id:8,name:"SILICA MIX 5 A 0,8",code:"1003490",unit:"TO",price:372.00,sales:6,totalEur:23957,cat:"Silica",tMax:1600 },
    { id:9,name:"CALDE MIX SA 68 S MD",code:"1016432",unit:"TO",price:1597.00,sales:5,totalEur:21402,cat:"Ramming",tMax:1700 },
    { id:10,name:"CALDE CAST F 65",code:"1006877",unit:"TO",price:1450.00,sales:3,totalEur:20444,cat:"Castable",tMax:1600 },
    { id:11,name:"CALDE CAST T 96",code:"1006078",unit:"TO",price:2894.85,sales:6,totalEur:19533,cat:"Castable",tMax:1800 },
    { id:12,name:"CALDE CAST LX 58",code:"1006544",unit:"TO",price:1569.00,sales:1,totalEur:18075,cat:"Castable",tMax:1550 },
    { id:13,name:"CALDE CAST HYMOR 2800",code:"1006506",unit:"TO",price:830.00,sales:3,totalEur:16766,cat:"Castable",tMax:1400 },
    { id:14,name:"FC Brick A43 Ty.29914",code:"4029231",unit:"TO",price:745.00,sales:3,totalEur:16207,cat:"Brick",tMax:1600 },
    { id:15,name:"CALDE CAST XL 106 C/G",code:"1006601",unit:"TO",price:875.00,sales:2,totalEur:14875,cat:"Castable",tMax:1750 },
    { id:16,name:"CALDE CAST MW STRONG LITE",code:"1006602",unit:"TO",price:710.00,sales:1,totalEur:11360,cat:"Castable",tMax:1500 },
    { id:17,name:"CALDE GUN MW STRONG LITE",code:"1006629",unit:"TO",price:666.00,sales:3,totalEur:10910,cat:"Gunning",tMax:1500 },
    { id:18,name:"IF Brick PORIT10 390x123x65",code:"4023841",unit:"PC",price:4.84,sales:2,totalEur:10427,cat:"Brick",tMax:1500 },
    { id:19,name:"CALDE FLOW G UC 70S20",code:"1007111",unit:"TO",price:1339.00,sales:3,totalEur:7816,cat:"Flow Control",tMax:1700 },
    { id:20,name:"CALDE TROWEL HQ 82 U",code:"1005607",unit:"TO",price:1090.00,sales:3,totalEur:5450,cat:"Trowelling",tMax:1700 },
    { id:21,name:"CALDE SOL CAST A 50 SZ",code:"1014122",unit:"TO",price:1150.00,sales:1,totalEur:6900,cat:"Castable",tMax:1500 },
    { id:22,name:"CALDE CAST HR 70 BFS",code:"1006520",unit:"TO",price:920.00,sales:2,totalEur:3680,cat:"Castable",tMax:1650 },
    { id:23,name:"CALDE MIX SA 68 S",code:"1006116",unit:"TO",price:1530.00,sales:5,totalEur:21402,cat:"Ramming",tMax:1700 },
    { id:24,name:"CALDE CAST HYMOR 80 Al",code:"1006507",unit:"TO",price:1100.00,sales:1,totalEur:4400,cat:"Castable",tMax:1450 },
    { id:25,name:"Glass textile 600 V4A-1P",code:"4028488",unit:"M2",price:13.90,sales:1,totalEur:16680,cat:"Auxiliary",tMax:null },
  ],

  tds: [
    { id:1,name:"CALDE® CAST UC 80",code:"MAU80048",type:"Ultra low cement castable",mainComp:"Corundum",bond:"Hydraulic",tMax:1700,install:"Vibrating",grainMax:10,density:3.00,water:"4.4-4.8 l/100kg",shelfLife:"4 months",chem:{Al2O3:80.0,SiO2:17.0,CaO:1.0,Fe2O3:0.6},lambda:{800:2.15,1000:2.07,1200:1.98},ccs:{110:80,800:95,1200:130,1600:80},applications:"BF runners, torpedo ladles, steel ladles, EAF, BOF" },
    { id:2,name:"CALDE™ CAST M 32",code:"MAF70026",type:"Medium cement castable",mainComp:"Bauxite",bond:"Hydraulic",tMax:1600,install:"Vibrating",grainMax:6,density:2.75,water:"5.4-6.8 l/100kg",shelfLife:"6 months",chem:{Al2O3:78.0,SiO2:14.0,CaO:5.0,Fe2O3:1.5},lambda:{800:1.90,1000:1.85,1200:1.80},ccs:{110:60,800:70,1200:90},applications:"General purpose, furnace backup lining" },
    { id:3,name:"SILICA MIX 5 A 0,6",code:"MQD90111",type:"Dry vibrating mix",mainComp:"Quartzite",bond:"Ceramic",tMax:1650,install:"Dry vibration/ramming",grainMax:6,density:2.20,water:null,shelfLife:"12 months",chem:{SiO2:98.2,B2O3:0.6},lambda:{800:1.19,1000:1.24,1200:1.38},ccs:{},applications:"Coreless induction furnaces, iron & steel foundries" },
    { id:4,name:"CALDE™ MIX SA 68 S",code:"MQA72091",type:"Dry ramming mix",mainComp:"Alumina",bond:"Ceramic",tMax:1700,install:"Ramming",grainMax:5,density:2.60,water:null,shelfLife:"12 months",chem:{Al2O3:68.0,SiO2:28.0},lambda:{800:1.50,1000:1.55,1200:1.60},ccs:{1200:25,1400:30},applications:"Induction furnace linings, steel & iron foundries" },
    { id:5,name:"CALDER GUN SUPERAL X 70",code:"MAU70048",type:"Gunning castable",mainComp:"High alumina",bond:"Hydraulic",tMax:1700,install:"Wet/dry gunning",grainMax:8,density:2.85,water:"8-10 l/100kg",shelfLife:"6 months",chem:{Al2O3:70.0,SiO2:25.0,CaO:3.0},lambda:{800:1.80,1000:1.75,1200:1.70},ccs:{110:40,800:55,1200:70},applications:"BOF repair, steel ladle gunning, EAF walls" },
    { id:6,name:"CALDE® CAST HYMOR 2800",code:"MAA28048",type:"Low cement castable",mainComp:"Andalusite",bond:"Hydraulic",tMax:1400,install:"Vibrating/pouring",grainMax:6,density:2.35,water:"5.0-6.0 l/100kg",shelfLife:"6 months",chem:{Al2O3:55.0,SiO2:40.0,CaO:2.0,Fe2O3:1.5},lambda:{600:1.20,800:1.15,1000:1.10},ccs:{110:50,800:65,1200:80},applications:"Aluminum furnaces, holding furnaces, non-ferrous" },
    { id:7,name:"CALDE® PATCH 160 LCC",code:"MAA16048",type:"LCC patching",mainComp:"Alumina-Silica",bond:"Hydraulic",tMax:1600,install:"Trowelling/patching",grainMax:3,density:2.40,water:"6.0-7.0 l/100kg",shelfLife:"6 months",chem:{Al2O3:60.0,SiO2:35.0},lambda:{800:1.30,1000:1.25},ccs:{110:35,800:50},applications:"Aluminum dosing furnace patching, repair of tilting furnaces" },
    { id:8,name:"CALDE® CAST 13 LI",code:"MAI13048",type:"Insulating castable",mainComp:"Lightweight aggregate",bond:"Hydraulic",tMax:1300,install:"Casting/vibrating",grainMax:6,density:1.30,water:"30-35 l/100kg",shelfLife:"6 months",chem:{Al2O3:48.0,SiO2:40.0},lambda:{400:0.35,600:0.40,800:0.45},ccs:{110:5,800:6},applications:"Insulation layer, backup lining, aluminum furnaces" },
    { id:9,name:"CALDE® FLOW G UC 70S20",code:"MAU70011",type:"Self-flow ULCC",mainComp:"High alumina",bond:"Hydraulic",tMax:1700,install:"Self-flowing",grainMax:20,density:2.90,water:"5.0-5.5 l/100kg",shelfLife:"4 months",chem:{Al2O3:70.0,SiO2:25.0,CaO:1.5},lambda:{800:2.00,1000:1.95,1200:1.90},ccs:{110:60,800:80,1200:100},applications:"BF runners, tundish, torpedo ladle" },
    { id:10,name:"CALDE® CAST F 65",code:"MAF65048",type:"Medium cement castable",mainComp:"Bauxite",bond:"Hydraulic",tMax:1600,install:"Vibrating",grainMax:6,density:2.55,water:"5.5-6.5 l/100kg",shelfLife:"6 months",chem:{Al2O3:65.0,SiO2:28.0,CaO:4.0},lambda:{800:1.70,1000:1.65,1200:1.60},ccs:{110:55,800:70,1200:85},applications:"Induction furnace lining, iron & steel foundries" },
  ],

  pipeline: [
    { id:1,customer:"HBIS Group Serbia",deal:"BOF Relining Q2 2026",value:85000,stage:"negotiation",probability:70,notes:"Tender aktivan. Kinezi nude niže — kvalitet je argument." },
    { id:2,customer:"ArcelorMittal Zenica",deal:"EAF Hearth Repair 2026",value:65000,stage:"proposal",probability:60,notes:"Čekamo tehničku specifikaciju." },
    { id:3,customer:"Moravacem",deal:"Rotary Kiln — SOL CAST + GUN",value:45000,stage:"proposal",probability:55,notes:"Ponuda poslata 01/2024, follow-up potreban." },
    { id:4,customer:"Progress AD",deal:"IF Reline Plovdiv",value:35000,stage:"qualified",probability:50,notes:"Uspavan 5+ meseci — hitna reaktivacija!" },
    { id:5,customer:"Cimos d.d.",deal:"Annual Supply 2026",value:30000,stage:"qualified",probability:40,notes:"Uspavan od 10/2023! MIX SA 68 S + CAST T 96." },
    { id:6,customer:"Autoflex Čoka",deal:"IF Lining CAST F 65",value:25000,stage:"negotiation",probability:75,notes:"Redovan kupac. CAST F 65 + CAST LX 58." },
  ],

  actions: [
    { id:1,priority:"HITNO",action:"Reaktivacija Cimos — 477 dana bez narudžbe",owner:"MP",deadline:"15.02.2026",status:"pending" },
    { id:2,priority:"HITNO",action:"Reaktivacija Progress AD — 151 dana idle",owner:"MP",deadline:"15.02.2026",status:"pending" },
    { id:3,priority:"HITNO",action:"HBIS BOF tender — tehnička ponuda",owner:"MP+RM",deadline:"28.02.2026",status:"in_progress" },
    { id:4,priority:"VISOK",action:"AMZ EAF Hearth — specifikacija",owner:"MP",deadline:"01.03.2026",status:"pending" },
    { id:5,priority:"VISOK",action:"Moravacem — follow-up SOL CAST",owner:"RM",deadline:"20.02.2026",status:"pending" },
    { id:6,priority:"VISOK",action:"Bamex Metal BG — reaktivacija (499d!)",owner:"MP",deadline:"28.02.2026",status:"pending" },
    { id:7,priority:"SREDNJI",action:"Valjaonica Sevojno — reaktivacija (603d)",owner:"MP",deadline:"01.03.2026",status:"pending" },
    { id:8,priority:"SREDNJI",action:"Berg Montana — ponuda Q2",owner:"RM",deadline:"15.03.2026",status:"pending" },
    { id:9,priority:"SREDNJI",action:"Livarna Gorica — nova IF lining ponuda",owner:"MP",deadline:"15.03.2026",status:"pending" },
    { id:10,priority:"NISKO",action:"LAFARGE BFC — istražiti (2340d!)",owner:"MP",deadline:"31.03.2026",status:"pending" },
    { id:11,priority:"NISKO",action:"Cranfield Foundry — status (1998d)",owner:"RM",deadline:"31.03.2026",status:"pending" },
    { id:12,priority:"NISKO",action:"Proširiti TDS bazu na 40+ materijala",owner:"MP",deadline:"30.04.2026",status:"in_progress" },
  ],

  revenueByYear: [
    { year:"2019",eur:10810 },{ year:"2020",eur:2678 },{ year:"2021",eur:125783 },
    { year:"2022",eur:339401 },{ year:"2023",eur:224049 },{ year:"2024",eur:166694 },{ year:"2026",eur:92611 },
  ],

  cifMetals: [
    { id:"IRON",name:"Gvožđe",density:7.2 },{ id:"STEEL",name:"Čelik",density:7.8 },
    { id:"COPPER",name:"Bakar",density:8.93 },{ id:"ALUMINIUM",name:"Aluminijum",density:2.6 },
    { id:"BRONZE",name:"Bronza",density:8.8 },{ id:"BRASS",name:"Mesing",density:8.5 },
  ],

  cifLinings: [
    { id:"SILICA_MIX_5",name:"SILICA® MIX 5",density:2.20 },
    { id:"SILICA_MIX_Z",name:"SILICA MIX Z",density:2.25 },
    { id:"SILICA_MIX_Q",name:"SILICA MIX Q",density:2.00 },
    { id:"MIX_BC_88_S",name:"CALDE™ MIX BC 88 S",density:3.05 },
    { id:"MIX_SA_68_S",name:"CALDE™ MIX SA 68 S",density:2.60 },
    { id:"MIX_SC_76",name:"CALDE™ MIX SC 76 M12",density:2.85 },
    { id:"MIX_SC_85",name:"CALDE™ MIX SC 85 M17",density:2.80 },
  ],

  silicaGrades: [
    { minTemp:0,maxTemp:1399,grade:"OUT OF SCOPE — temperatura preniska" },
    { minTemp:1400,maxTemp:1509,sinter:1500,grade:"SILICA MIX (Q14)(Z14)(A1.0)(B2.0)" },
    { minTemp:1510,maxTemp:1549,sinter:1560,grade:"SILICA MIX (Q15)(Z15)(A0.8)(B1.6)" },
    { minTemp:1550,maxTemp:1589,sinter:1600,grade:"SILICA MIX (Q15)(Z15)(A0.6)(B1.2)" },
    { minTemp:1590,maxTemp:1650,sinter:1640,grade:"SILICA MIX (Q16)(Z16)(A0.6)(B1.2)" },
  ],
};
