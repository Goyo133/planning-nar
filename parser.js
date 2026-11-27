/* Lecture du planning mensuel (PDF ou Word) — partagé entre la page web et le script de publication GitHub.
   Aucune dépendance : le PDF est d'abord réduit en morceaux de texte positionnés (pdf.js), le Word en DOM XML. */
(function (root) {
"use strict";

const POSTS = [
  {k:"rea1",lbl:"Réa 1",sh:"R1",g:"rea"},{k:"rea2",lbl:"Réa 2",sh:"R2",g:"rea"},{k:"rea3",lbl:"Réa 3",sh:"R3",g:"rea"},{k:"rea4",lbl:"Réa 4",sh:"R4",g:"rea"},
  {k:"bloc1",lbl:"Bloc 1",sh:"B1",g:"bloc"},{k:"bloc2",lbl:"Bloc 2",sh:"B2",g:"bloc"},{k:"bloc3",lbl:"Bloc 3",sh:"B3",g:"bloc"},
  {k:"tdm",lbl:"Radio TDM",sh:"TDM",g:"tdm"},{k:"rx",lbl:"Radio",sh:"Rx",g:"rx"},
  {k:"consultm",lbl:"Consult. matin",sh:"CsM",g:"consult",fixed:"Matin"},{k:"consulta",lbl:"Consult. après-midi",sh:"CsA",g:"consult",fixed:"Après-midi"},
  {k:"garde",lbl:"Garde",sh:"G",g:"garde",whole:true},{k:"astreinte",lbl:"Astreinte",sh:"A",g:"astr",whole:true}
];
const DAY_POSTS = POSTS.filter(p=>!p.whole).map(p=>p.k);
const DAYS = ["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];
const MONTHS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const cap = s => s.charAt(0).toUpperCase()+s.slice(1);
const fold = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");

/* dates en UTC, chaînes ISO */
const iso = d => d.toISOString().slice(0,10);
const D = s => new Date(s+"T00:00:00Z");
const addDays = (s,n) => { const d=D(s); d.setUTCDate(d.getUTCDate()+n); return iso(d); };
const wd = s => D(s).getUTCDay();
const fmtLong = s => { const d=D(s); return `${cap(DAYS[d.getUTCDay()])} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

/* Case : "X" = journée, "X / Y" = matin / après-midi, "X-Y" = deux noms, "-0-" = fermé. */
function parseCell(raw){
  const s = (raw||"").replace(/\s+/g," ").trim();
  if(!s) return null;
  if(/^-?\s*0\s*-?$/.test(s)) return {closed:true, raw:s};
  const ppl = t => t.split(/\s*-\s*|\s*,\s*|\s+et\s+/i).map(x=>x.trim().toUpperCase()).filter(x=>x && x!=="0");
  if(s.includes("/")){ const i=s.indexOf("/"); return {raw:s, am:ppl(s.slice(0,i)), pm:ppl(s.slice(i+1))}; }
  const p = ppl(s); return {raw:s, am:p, pm:p};
}
/* Affichage d'une case : "PB", "AC / PB", "EV / —" */
function showCell(c){
  if(!c) return "";
  if(c.closed) return "fermé";
  const a=c.am.join("-"), b=c.pm.join("-");
  return a===b ? a : `${a||"—"} / ${b||"—"}`;
}
const joinHalves = (am, pm) => { const a=am.join("-"), b=pm.join("-"); return a===b ? a : `${a} / ${b}`; };

/* Ancien tableau (décembre 2026) : une colonne Rx où "X-Y" = X en radio, Y au TDM, et une seule colonne Consult. */
function upgradeLegacy(cells, hasTdm, hasConsultSplit){
  const c = {...cells};
  if(!hasTdm && c.rx){
    const r = parseCell(c.rx);
    if(r && !r.closed){
      const halves = c.rx.includes("/") ? c.rx.split("/") : [c.rx, c.rx];
      const rx=[], tdm=[];
      for(const h of halves){ const n=h.split(/\s*-\s*/).map(x=>x.trim().toUpperCase()).filter(Boolean); rx.push(n.slice(0,1)); tdm.push(n.slice(1)); }
      c.rx = joinHalves(rx[0], rx[1]);
      if(tdm[0].length||tdm[1].length) c.tdm = joinHalves(tdm[0], tdm[1]);
      if(!c.rx || c.rx===" / ") delete c.rx;
    }
  }
  if(!hasConsultSplit && c.consult){
    const r = parseCell(c.consult);
    // ancienne colonne unique : « X / Y » = X le matin, Y l'après-midi ; un seul nom (ou -0-) = l'après-midi seulement
    if(r && r.closed){ c.consulta = c.consult; }
    else if(r && c.consult.includes("/")){ if(r.am.length) c.consultm=r.am.join("-"); if(r.pm.length) c.consulta=r.pm.join("-"); }
    else if(r){ c.consulta=r.pm.join("-"); }
  }
  delete c.consult;
  return c;
}

function findMonthYear(text, fname){
  const re = new RegExp("\\b("+MONTHS.join("|")+"|decembre|fevrier|aout)\\b","i"), ry=/\b(20\d\d)\b/;
  const m = re.exec(text) || re.exec(fname||""), yy = ry.exec(text) || ry.exec(fname||"");
  if(!m || !yy) return null;
  const idx = MONTHS.findIndex(x=>fold(x)===fold(m[1]));
  return idx<0 ? null : {m:idx, y:+yy[1]};
}

/* rows: [{dayName, num, cells}] -> jours datés */
function dateRows(rows, my, fmt){
  const warn=[], out=[]; let prev=null;
  for(const r of rows){
    const wdx = DAYS.indexOf(fold(r.dayName));
    let s=null;
    if(!prev){
      for(const dm of [0,-1,1]){ const cand=iso(new Date(Date.UTC(my.y,my.m+dm,r.num))); if(D(cand).getUTCDate()===r.num && wd(cand)===wdx){ s=cand; break; } }
      if(!s) s=iso(new Date(Date.UTC(my.y,my.m,r.num)));
    } else { for(let k=1;k<=10;k++){ const c=addDays(prev,k); if(D(c).getUTCDate()===r.num){ s=c; break; } } if(!s) s=addDays(prev,1); }
    if(wd(s)!==wdx) warn.push(`${cap(r.dayName)} ${r.num} ne correspond pas au calendrier (lu comme ${fmtLong(s)}).`);
    const clean={}; for(const k in r.cells){ const v=(r.cells[k]||"").replace(/\s+/g," ").replace(/\s*\/\s*/g," / ").replace(/\s*-\s*(?!0)/g,"-").trim(); if(v) clean[k]=v; }
    const cells = upgradeLegacy(clean, fmt.hasTdm, fmt.hasConsultSplit);
    const c={}; for(const p of POSTS) if(cells[p.k]) c[p.k]=cells[p.k];
    const dayPosts = DAY_POSTS.some(k=>c[k] && !/^-?0-?$/.test(c[k]));
    const day={d:s,c}; if(wd(s)!==0 && wd(s)!==6 && !dayPosts) day.holiday=true;
    out.push(day); prev=s;
  }
  return {days:out, warn};
}

/* Étiquettes de colonnes reconnues (nouveau et ancien tableau). */
const LABELS = [
  ["rea1",/R[ée]a\.?\s*1\b/i],["rea2",/R[ée]a\.?\s*2\b/i],["rea3",/R[ée]a\.?\s*3\b/i],["rea4",/R[ée]a\.?\s*4\b/i],
  ["bloc1",/Bloc\s*1\b/i],["bloc2",/Bloc\s*2\b/i],["bloc3",/Bloc\s*3\b/i],
  ["tdm",/\bTDM\b|Scanner/i],["rx",/\bRx\b|\bRadio\b/i],
  ["consult",/Consult/i],["garde",/\bGarde\b/i],["astreinte",/Astreinte/i]
];
const REQUIRED = ["rea1","rea2","rea3","bloc1","bloc2","bloc3","rx","garde","astreinte"];
const isAm = s => /matin|\bmat\b/i.test(s);
const isPm = s => /apr[eè]s|aprem|\bap\.?\s*m|\bAM\b/i.test(s);
function finishFormat(found){
  const fmt = {hasTdm: !!found.tdm, hasConsultSplit: !!(found.consultm && found.consulta)};
  const missing = REQUIRED.filter(k=>!found[k]);
  if(!found.consult && !found.consultm && !found.consulta) missing.push("consult");
  if(missing.length) throw new Error("Colonnes introuvables : "+missing.map(k=>(POSTS.find(p=>p.k===k)||{lbl:"Consultation"}).lbl).join(", ")+".");
  return fmt;
}

/* ---------- PDF : items = [{s, x, y, w}] (y vers le haut, comme pdf.js) ---------- */
function parsePdfItems(rawItems, fname){
  const items = rawItems.filter(i=>i.s && i.s.trim()).map(i=>({...i}));
  const fullText = items.slice().sort((a,b)=>b.y-a.y||a.x-b.x).map(i=>i.s).join(" ");
  const my = findMonthYear(fullText, fname);
  if(!my) throw new Error("Mois et année introuvables (ex. « Décembre 2026 » en haut à gauche).");
  // 1. repérer chaque étiquette de colonne
  const hits=[];
  for(const it of items){
    for(const [k,re] of LABELS){
      const g = new RegExp(re.source, re.flags.includes("g")?re.flags:re.flags+"g"); let m;
      while((m=g.exec(it.s))){
        if(k==="rx" && /TDM|Scanner/i.test(it.s)) continue;          // « Radio TDM » est la colonne TDM
        const f=m.index/it.s.length, fl=m[0].length/it.s.length;
        hits.push({k, x:it.x+it.w*(f+fl/2), y:it.y, it});
      }
    }
  }
  // la ligne d'en-tête est la plus haute ligne « Lundi … » moins un cran : on prend les étiquettes au-dessus de la 1re ligne de jour
  const dayLineY = Math.max(...items.filter(i=>/^\s*(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/i.test(fold(i.s)) || /^\s*(l|m|j|v|s|d)?(undi|ardi|ercredi|eudi|endredi|amedi|imanche)/i.test(i.s)).map(i=>i.y).concat([-1e9]));
  const head = hits.filter(h=>h.y>dayLineY+2);
  const found={};
  for(const h of head){ if(h.k==="consult") continue; if(!found[h.k] || h.y<found[h.k].y) found[h.k]=h; }
  const consults = head.filter(h=>h.k==="consult").sort((a,b)=>a.x-b.x);
  if(consults.length>=2){ found.consultm=consults[0]; found.consulta=consults[consults.length-1]; }
  else if(consults.length===1){
    const c=consults[0], sub=items.filter(i=>i.y>dayLineY+2 && Math.abs(i.x+i.w/2-c.x)<60);
    const am=sub.find(i=>isAm(i.s)&&!isPm(i.s)), pm=sub.find(i=>isPm(i.s));
    if(am && pm){ found.consultm={x:am.x+am.w/2,y:am.y}; found.consulta={x:pm.x+pm.w/2,y:pm.y}; }
    else if(isAm(c.it.s) && !isPm(c.it.s)) found.consultm=c;
    else if(isPm(c.it.s)) found.consulta=c;
    else found.consult=c;
  }
  const fmt = finishFormat(found);
  const keys = Object.keys(found);
  const headerY = Math.min(...keys.map(k=>found[k].y));
  const colList = keys.map(k=>({k, x:found[k].x}));
  // 2. étiquettes de jour : morceaux de la colonne de gauche fusionnés par ligne (le gras arrive en morceaux : "D","imanche","2","7")
  const leftCut = Math.min(...colList.map(c=>c.x)) - 22;
  const left = items.filter(it=>it.y<headerY-2 && it.x+it.w/2 < leftCut).sort((a,b)=>b.y-a.y||a.x-b.x);
  const lines=[];
  for(const it of left){ it.used=true; let ln=lines.find(l=>Math.abs(l.y-it.y)<3); if(!ln){ ln={y:it.y,parts:[]}; lines.push(ln); } ln.parts.push(it); }
  const labels=[], warn0=[];
  lines.sort((a,b)=>b.y-a.y);
  for(const ln of lines){
    ln.parts.sort((a,b)=>a.x-b.x);
    let t="", endX=null; for(const it of ln.parts){ t += (endX!=null && it.x-endX>1.5 ? " " : "") + it.s; endX=it.x+it.w; }
    ln.t=t.replace(/\s+/g," ").trim().replace(/(\d)\s+(\d)/,"$1$2");
  }
  lines.forEach((ln,i)=>{                          // « Dimanche » / « 10 » coupé sur deux lignes dans la case
    const nx=lines[i+1];
    if(/^[a-zé]+$/i.test(ln.t) && nx && /^\d{1,2}$/.test(nx.t) && ln.y-nx.y<16){ ln.t+=" "+nx.t; nx.t=""; }
  });
  for(const ln of lines){
    const t=ln.t; if(!t) continue;
    const m=/^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s*(\d{1,2})$/i.exec(t);
    if(m) labels.push({dayName:m[1], num:+m[2], y:ln.y});
    else if(/\d/.test(t) && /[a-z]/i.test(t)) warn0.push(`Ligne non reconnue : « ${t} ».`);
  }
  if(!labels.length) throw new Error("Aucune ligne « Lundi 30 », « Mardi 1 »… trouvée.");
  labels.sort((a,b)=>b.y-a.y);
  // 3. contenu des cases : ligne la plus proche, colonne la plus proche
  const rows = labels.map(l=>({dayName:l.dayName, num:l.num, y:l.y, parts:{}}));
  for(const it of items){
    if(it.used || it.y>=headerY-2) continue;
    const cx = it.x + it.w/2;
    let best=null, bd=1e9; for(const r of rows){ const d=Math.abs(r.y-it.y); if(d<bd){bd=d;best=r;} }
    if(!best || bd>7) continue;
    let col=null, cd=1e9; for(const c of colList){ const d=Math.abs(c.x-cx); if(d<cd){cd=d;col=c;} }
    (best.parts[col.k] ||= []).push(it);
  }
  for(const r of rows){ r.cells={}; for(const k in r.parts) r.cells[k]=r.parts[k].sort((a,b)=>a.x-b.x).map(i=>i.s).join(" "); }
  const res = dateRows(rows, my, fmt);
  return {my, format: fmt, days: res.days, warn: warn0.concat(res.warn)};
}

/* ---------- Word : doc = DOM de word/document.xml ---------- */
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
function parseDocxDom(doc, fname){
  const els = (el,tag) => Array.prototype.slice.call(el.getElementsByTagNameNS(W,tag));
  const runText = p => { let t=""; (function walk(n){ for(let c=n.firstChild;c;c=c.nextSibling){ if(c.localName==="t") t+=c.textContent; else if(c.localName==="br"||c.localName==="tab"||c.localName==="cr") t+=" "; else if(c.firstChild) walk(c); } })(p); return t; };
  const text = el => els(el,"p").map(runText).join(" ").replace(/\s+/g," ").trim();
  const my = findMonthYear(text(doc.documentElement), fname);
  if(!my) throw new Error("Mois et année introuvables dans le document.");
  const DAY = /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s*(\d{1,2})$/i;
  const grid = [];                                    // lignes du tableau, cases étalées selon gridSpan
  for(const tr of els(doc,"tr")){
    const vals=[];
    for(const tc of Array.prototype.slice.call(tr.childNodes).filter(n=>n.localName==="tc")){
      const span=els(tc,"gridSpan")[0]; const n=span ? (+span.getAttributeNS(W,"val")||+span.getAttribute("w:val")||1) : 1;
      const t=text(tc); for(let i=0;i<n;i++) vals.push(i===0?t:"\u0000"+t);   // \0 = suite d'une case fusionnée
    }
    grid.push(vals);
  }
  const firstDay = grid.findIndex(v=>DAY.test((v[0]||"").trim()));
  if(firstDay<0) throw new Error("Aucune ligne de jour trouvée dans le tableau Word.");
  // en-tête : textes de chaque colonne sur les lignes au-dessus de la 1re ligne de jour
  const ncol = Math.max(...grid.map(v=>v.length));
  const headTxt = [...Array(ncol)].map((_,i)=>grid.slice(0,firstDay).map(v=>(v[i]||"").replace(/^\u0000/,"")).join(" ").trim());
  const colKey = {};
  headTxt.forEach((t,i)=>{
    if(i===0) return;
    for(const [k,re] of LABELS){ if(!re.test(t)) continue; if(k==="rx" && /TDM|Scanner/i.test(t)) continue;
      if(k==="consult"){ colKey[i] = isAm(t)&&!isPm(t) ? "consultm" : isPm(t) ? "consulta" : "consult"; } else colKey[i]=k; break; }
  });
  let found = Object.fromEntries(Object.entries(colKey).map(([i,k])=>[k,+i]));
  if(found.consult!=null && found.consultm==null && found.consulta==null){
    const cs = Object.entries(colKey).filter(([,k])=>k==="consult").map(([i])=>+i);
    if(cs.length>=2){ delete found.consult; found.consultm=cs[0]; found.consulta=cs[cs.length-1]; colKey[cs[0]]="consultm"; colKey[cs[cs.length-1]]="consulta"; }
  }
  const dayCols = grid[firstDay].length;
  if(REQUIRED.some(k=>found[k]==null)){                     // en-tête illisible : ordre des colonnes
    const order = dayCols>=14 ? ["rea1","rea2","rea3","rea4","bloc1","bloc2","bloc3","tdm","rx","consultm","consulta","garde","astreinte"]
                              : ["rea1","rea2","rea3","bloc1","bloc2","bloc3","rx","consult","garde","astreinte"];
    found={}; order.forEach((k,i)=>{ found[k]=i+1; colKey[i+1]=k; });
  }
  const fmt = finishFormat(found);
  const rows=[];
  for(const v of grid.slice(firstDay)){
    const m = DAY.exec((v[0]||"").trim()); if(!m) continue;
    const cells={}; for(const k in found){ const t=v[found[k]]||""; cells[k]=t.startsWith("\u0000")?"":t; }
    rows.push({dayName:m[1], num:+m[2], cells});
  }
  const res = dateRows(rows, my, fmt);
  return {my, format: fmt, days: res.days, warn: res.warn};
}

/* Horaires des postes (Eric, 27/11/2026). Clé "*" = mêmes horaires quelle que soit la demi-journée. */
const HOURS = {
  bloc1:{"Matin":"7h30-13h","Après-midi":"13h-18h30","Journée":"7h30-18h30"},
  bloc2:{"Matin":"7h30-13h","Après-midi":"13h-18h30","Journée":"7h30-18h30"},
  bloc3:{"Matin":"7h30-13h"},
  rea1:{"*":"8h30-18h30"}, rea2:{"*":"8h30-18h30"}, rea3:{"*":"8h30-15h"}, rea4:{"*":"8h30-14h"},
  tdm:{"*":"7h30-13h30"}, consultm:{"*":"10h-12h"}, consulta:{"*":"14h-17h"}
};
function hoursFor(k, per){ const h=HOURS[k]; return h ? (h["*"] || h[per] || "") : ""; }
/* Staffs de programmation : Bloc 3 le vendredi, Consultation du matin le mercredi. */
function staffFor(day, doc){
  const out=[], w=wd(day.d), has = k => { const c=parseCell(day.c[k]); return !!(c && !c.closed && (c.am.includes(doc)||c.pm.includes(doc))); };
  if(w===5 && has("bloc3")) out.push({lbl:"Staff de programmation bloc", sh:"Staff bloc", h:"9h"});
  if(w===3 && has("consultm")) out.push({lbl:"Staff de programmation radio", sh:"Staff radio", h:"9h"});
  return out;
}

function monthRecord(r, source){
  const key = `${r.my.y}-${String(r.my.m+1).padStart(2,"0")}`;
  return {key, title:`${cap(MONTHS[r.my.m])} ${r.my.y}`, source, importedAt:new Date().toISOString(), days:r.days};
}

const api = {HOURS, hoursFor, staffFor, POSTS, DAYS, MONTHS, cap, iso, D, addDays, wd, fmtLong, parseCell, showCell, upgradeLegacy, findMonthYear, parsePdfItems, parseDocxDom, monthRecord};
if(typeof module==="object" && module.exports) module.exports = api; else root.NarParser = api;
})(typeof globalThis!=="undefined" ? globalThis : this);
