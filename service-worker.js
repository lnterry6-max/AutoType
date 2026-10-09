/* AutoType connectivity guard: offline fallback, never offline game data. */
const CACHE="autotype-offline-v1";
const OFFLINE="/offline-fallback.htm";
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE)
    .then(cache=>cache.add(new Request(OFFLINE,{cache:"reload"})))
    .then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("autotype-offline-")&&k!==CACHE).map(k=>caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET"||req.mode!=="navigate")return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  event.respondWith(fetch(req).catch(async()=>{
    const cache=await caches.open(CACHE);
    return (await cache.match(OFFLINE))||Response.error();
  }));
});
