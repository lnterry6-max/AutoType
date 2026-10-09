/* AutoType PWA pass-through worker v2.
 * No fetch handler: allow native browser navigation and error handling.
 * The former network-first fallback falsely displayed "offline" on iOS.
 * We explicitly clear its old cached offline page during activation. */
self.addEventListener("install",event=>{
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate",event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("autotype-offline-")).map(k=>caches.delete(k)))),
    self.clients.claim()
  ]));
});
