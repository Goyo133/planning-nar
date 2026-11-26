/* Construit le site à publier : lit chaque planning de plannings/ (PDF ou Word) et écrit site/data/plannings.json.
   Lancé par GitHub à chaque dépôt de fichier ; localement : npm run build */
const fs = require("fs");
const path = require("path");
const P = require("../parser.js");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "site");

const {loadMonths} = require("./lecture.cjs");

(async () => {
  const {months, errors} = await loadMonths();
  const repoUrl = process.env.GITHUB_REPOSITORY ? `${process.env.GITHUB_SERVER_URL||"https://github.com"}/${process.env.GITHUB_REPOSITORY}` : null;
  fs.rmSync(OUT, {recursive:true, force:true});
  fs.mkdirSync(path.join(OUT, "data"), {recursive:true});
  // index.html est écrit sans <html>/<head> (même fichier que la version d'essai Claude) : on l'enveloppe ici.
  const page = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  fs.writeFileSync(path.join(OUT, "index.html"), /^\s*<!doctype/i.test(page) ? page :
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
    `<link rel="manifest" href="manifest.webmanifest"><link rel="apple-touch-icon" href="icons/icone-180.png"><link rel="icon" type="image/png" sizes="32x32" href="icons/icone-32.png"><meta name="theme-color" content="#1f5fbf">` +
    `<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Planning NAR">` +
    `<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,-apple-system,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>` +
    `</head><body>\n${page}\n</body></html>\n`);
  for(const f of ["parser.js", "config.js", "sw.js", "manifest.webmanifest"]) if(fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
  fs.cpSync(path.join(ROOT, "icons"), path.join(OUT, "icons"), {recursive:true});
  fs.writeFileSync(path.join(OUT, ".nojekyll"), "");
  fs.writeFileSync(path.join(OUT, "data", "plannings.json"),
    JSON.stringify({generatedAt:new Date().toISOString(), repoUrl, months:Object.values(months).sort((a,b)=>a.key.localeCompare(b.key)), errors}));
  if(errors.length){ console.error(`\n${errors.length} fichier(s) illisible(s) : le site n'est pas mis à jour. Corrigez ou retirez le fichier puis déposez-le à nouveau.`); process.exit(1); }
  console.log(`\nSite prêt : ${Object.keys(months).length} mois.`);
})();
