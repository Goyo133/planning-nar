/* Lecture de tous les plannings déposés dans plannings/ (PDF ou Word). Utilisé par build.cjs et rappels.cjs. */
const fs = require("fs");
const path = require("path");
const P = require("../parser.js");
const SRC = path.join(__dirname, "..", "plannings");

async function readPdf(file){
  const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
  const data = new Uint8Array(fs.readFileSync(file));
  const pdf = await pdfjs.getDocument({data, isEvalSupported:false, useSystemFonts:true, verbosity:0}).promise;
  const tc = await (await pdf.getPage(1)).getTextContent();
  return P.parsePdfItems(tc.items.map(i=>({s:i.str, x:i.transform[4], y:i.transform[5], w:i.width})), path.basename(file));
}
async function readDocx(file){
  const JSZip = require("jszip");
  const {DOMParser} = require("@xmldom/xmldom");
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const xml = await zip.file("word/document.xml").async("string");
  return P.parseDocxDom(new DOMParser().parseFromString(xml, "application/xml"), path.basename(file));
}

/* -> {months: {"2026-12": record}, errors: [{file, error}]} */
async function loadMonths(log = console){
  const files = fs.existsSync(SRC) ? fs.readdirSync(SRC).filter(f=>/\.(pdf|docx)$/i.test(f) && !f.startsWith("~$")).sort() : [];
  const months = {}, errors = [];
  for(const f of files){
    const full = path.join(SRC, f);
    try{
      const r = /\.docx$/i.test(f) ? await readDocx(full) : await readPdf(full);
      const rec = P.monthRecord(r, f);
      if(months[rec.key]) log.warn(`⚠ ${rec.title} apparaît dans deux fichiers : « ${months[rec.key].source} » est remplacé par « ${f} ».`);
      months[rec.key] = rec;
      log.log(`✓ ${f} → ${rec.title}, ${r.days.length} jours${r.format.hasTdm ? "" : " (ancien tableau sans TDM)"}`);
      r.warn.forEach(w=>log.warn(`  ⚠ ${w}`));
    }catch(e){
      errors.push({file:f, error:String(e.message||e)});
      log.error(`✗ ${f} : ${e.message||e}`);
    }
  }
  return {months, errors};
}

/* Un jour du planning, le fichier du mois l'emportant sur le débord du mois voisin (même règle que la page). */
function dayFrom(months, date){
  let best=null;
  for(const m of Object.values(months)) for(const d of m.days) if(d.d===date && (!best || date.slice(0,7)===m.key)) best=d;
  return best;
}
module.exports = {loadMonths, dayFrom};
