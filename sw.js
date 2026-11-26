/* Service worker du planning : affiche la notification de la veille et ouvre le planning quand on la touche. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("push", e => {
  let m = {};
  try{ m = e.data ? e.data.json() : {}; }catch(_){ m = {body: e.data && e.data.text()}; }
  e.waitUntil(self.registration.showNotification(m.title || "Planning de demain", {
    body: m.body || "", tag: m.tag || "veille", icon: "icons/icone-192.png", badge: "icons/icone-192.png", data: {url: m.url || "./"}
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL(e.notification.data && e.notification.data.url || "./", self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({type:"window", includeUncontrolled:true});
    for(const w of wins){ if(w.url.startsWith(self.registration.scope)){ await w.focus(); if("navigate" in w) await w.navigate(url); return; } }
    await self.clients.openWindow(url);
  })());
});
