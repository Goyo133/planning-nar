/* Rappel de la veille : chaque soir, une notification sur le téléphone de chaque médecin qui a un poste le lendemain.
   Lancé par GitHub (.github/workflows/rappels.yml). Secrets GitHub :
     SUPABASE_SERVICE_KEY  clé « service_role » de Supabase (lit la liste des téléphones abonnés)
     VAPID_PRIVATE_KEY     clé privée des notifications (créée sur le site, adresse + ?gestion)
   L'adresse Supabase et la clé publique des notifications sont lues dans config.js.
   Facultatif : DATE_RAPPEL=2026-12-03 pour viser un autre jour ; ESSAI=1 pour seulement afficher. */
const fs = require("fs");
const path = require("path");
const P = require("../parser.js");
const {loadMonths, dayFrom} = require("./lecture.cjs");

const env = process.env;
const parisToday = () => new Intl.DateTimeFormat("en-CA", {timeZone:"Europe/Paris", year:"numeric", month:"2-digit", day:"2-digit"}).format(new Date());
const target = env.DATE_RAPPEL || P.addDays(parisToday(), 1);
const dry = env.ESSAI === "1" || env.ESSAI === "true";

function readConfig(){
  const t = fs.readFileSync(path.join(__dirname, "..", "config.js"), "utf8");
  const get = k => { const m = new RegExp(k+':\\s*"([^"]*)"').exec(t); return m ? m[1] : ""; };
  return {url: env.SUPABASE_URL || get("supabaseUrl"), anon: env.SUPABASE_ANON_KEY || get("supabaseAnonKey"), vapidPublic: env.VAPID_PUBLIC_KEY || get("vapidPublicKey")};
}
const cfg = readConfig();
async function sb(pathq, key, opts={}){
  const res = await fetch(`${cfg.url}/rest/v1/${pathq}`, {...opts, headers:{apikey:key, ...(key.startsWith("sb_") ? {} : {Authorization:`Bearer ${key}`}), ...(opts.headers||{})}});
  if(!res.ok) throw new Error(`Supabase ${res.status} ${await res.text()}`);
  return res.status===204 ? null : res.json().catch(()=>null);
}
function assignments(day, doc){
  const out=[];
  for(const p of P.POSTS){
    const c = P.parseCell(day.c[p.k]); if(!c || c.closed) continue;
    const am=c.am.includes(doc), pm=c.pm.includes(doc); if(!am && !pm) continue;
    const half = am&&pm ? "Journée" : am ? "Matin" : "Après-midi";
    const per = p.whole || p.fixed ? "" : (am&&pm ? "" : am ? " matin" : " après-midi");
    const h = P.hoursFor(p.k, p.fixed || half);
    out.push(p.lbl + (h ? ` ${h}` : per));
  }
  return P.staffFor(day, doc).map(st=>`${st.lbl} à ${st.h}`).concat(out);
}

// Deux créneaux programmés (16 h et 17 h UTC) : on n'envoie que celui qui correspond à 18 h à Paris.
if(env.CRENEAU){
  const h = +env.CRENEAU.split(" ")[1];
  const off = +new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Paris",timeZoneName:"shortOffset"}).formatToParts(new Date()).find(x=>x.type==="timeZoneName").value.replace("GMT","") || 0;
  if((h + off) % 24 !== 18){ console.log(`Créneau ${h} h UTC ignoré (il est ${(h+off)%24} h à Paris) : l'autre créneau envoie les rappels.`); process.exit(0); }
}
(async () => {
  if(!cfg.url || !cfg.anon){ console.log("config.js n'a pas d'adresse Supabase : aucune notification."); return; }
  const {months} = await loadMonths({log(){}, warn(){}, error:console.error});
  const base = dayFrom(months, target);
  if(!base){ console.log(`Pas de planning pour le ${P.fmtLong(target)} : aucune notification.`); return; }
  const day = {...base, c:{...base.c}};
  const mods = await sb(`modifs?select=*&jour=eq.${target}`, cfg.anon);
  for(const o of mods||[]) if(P.POSTS.some(p=>p.k===o.poste)) day.c[o.poste] = o.valeur || "";

  const when = P.fmtLong(target).replace(/ \d{4}$/, "").toLowerCase();
  const site = env.SITE_URL || (env.GITHUB_REPOSITORY ? `https://${env.GITHUB_REPOSITORY.split("/")[0].toLowerCase()}.github.io/${env.GITHUB_REPOSITORY.split("/")[1]}/` : "./");
  const messages = {};
  const docs = new Set();
  for(const p of P.POSTS){ const c=P.parseCell(day.c[p.k]); if(c && !c.closed){ c.am.forEach(x=>docs.add(x)); c.pm.forEach(x=>docs.add(x)); } }
  for(const doc of docs){ const a = assignments(day, doc); if(a.length) messages[doc] = {title:`Demain, ${when}`, body:a.join(" · "), url:`${site}#${doc.toLowerCase()}`, tag:`veille-${target}`}; }
  console.log(`Notifications pour le ${P.fmtLong(target)}${(mods||[]).length?` (${mods.length} modification(s) prise(s) en compte)`:""}${dry?" — MODE ESSAI, rien n'est envoyé":""}`);

  if(!env.SUPABASE_SERVICE_KEY || !env.VAPID_PRIVATE_KEY || !cfg.vapidPublic){
    if(!dry){ console.error("Il manque SUPABASE_SERVICE_KEY, VAPID_PRIVATE_KEY ou vapidPublicKey (config.js)."); process.exit(1); }
    for(const [doc,m] of Object.entries(messages).sort()) console.log(`→ ${doc} : ${m.body}`);
    return;
  }
  const subs = await sb("abonnements?select=*", env.SUPABASE_SERVICE_KEY);
  const webpush = require("web-push");
  webpush.setVapidDetails(env.VAPID_CONTACT || (env.GITHUB_REPOSITORY ? `https://github.com/${env.GITHUB_REPOSITORY}` : "https://github.com"), cfg.vapidPublic, env.VAPID_PRIVATE_KEY);
  let sent=0, gone=0, failed=0; const reached=new Set();
  for(const s of subs||[]){
    const m = messages[s.medecin]; if(!m) continue;
    if(dry){ console.log(`→ ${s.medecin} (un téléphone) : ${m.body}`); sent++; reached.add(s.medecin); continue; }
    try{
      await webpush.sendNotification({endpoint:s.endpoint, keys:{p256dh:s.p256dh, auth:s.auth}}, JSON.stringify(m), {TTL: 12*3600, urgency:"normal"});
      sent++; reached.add(s.medecin);
    }catch(e){
      if(e.statusCode===404 || e.statusCode===410){ gone++; await sb(`abonnements?endpoint=eq.${encodeURIComponent(s.endpoint)}`, env.SUPABASE_SERVICE_KEY, {method:"DELETE"}); }
      else { failed++; console.error(`✗ ${s.medecin} : ${e.statusCode||""} ${e.body||e.message}`); }
    }
  }
  const without = Object.keys(messages).filter(d=>!reached.has(d)).sort();
  console.log(`\n${sent} notification(s) ${dry?"préparée(s)":"envoyée(s)"}.${gone?` ${gone} téléphone(s) désabonné(s) retiré(s).`:""}${without.length?` Sans téléphone abonné : ${without.join(", ")}.`:""}`);
  if(failed) process.exit(1);
})().catch(e=>{ console.error(e); process.exit(1); });
