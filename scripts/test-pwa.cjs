"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const html=fs.readdirSync(root).filter(x=>x.endsWith(".html"));
const manifest=JSON.parse(read("manifest.webmanifest"));
assert.equal(html.length,27);
assert.equal(manifest.id,"/");
assert.equal(manifest.start_url,"/");
assert.equal(manifest.scope,"/");
assert.equal(manifest.display,"standalone");
assert.equal(manifest.orientation,"any");
assert.equal(manifest.background_color,"#141b24");
assert.equal(manifest.theme_color,"#1f2328");
function crc32(b){let c=0xffffffff;for(const n of b){c^=n;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0}
const pngs=[["assets/pwa/icon-logo-192-v2.png",192],["assets/pwa/icon-logo-512-v2.png",512],["assets/pwa/icon-logo-maskable-512-v2.png",512],["assets/pwa/apple-logo-180-v2.png",180]];
for(const [file,size] of pngs){
 const b=fs.readFileSync(path.join(root,file));
 assert.deepEqual([...b.subarray(0,8)],[137,80,78,71,13,10,26,10],"PNG signature: "+file);
 assert.equal(b.readUInt32BE(16),size,"PNG width: "+file);
 assert.equal(b.readUInt32BE(20),size,"PNG height: "+file);
 assert.ok([2,4,8].includes(b[24]),"Supported PNG indexed palette bit depth: "+file);
 assert.equal(b[25],3,"PNG indexed color: "+file);
 let offset=8,palette=false,image=false;
 while(offset<b.length){
  const len=b.readUInt32BE(offset),type=b.toString("ascii",offset+4,offset+8);
  assert.ok(offset+12+len<=b.length,"PNG chunks fit: "+file);
  assert.equal(crc32(b.subarray(offset+4,offset+8+len)),b.readUInt32BE(offset+8+len),"PNG CRC: "+file+" "+type);
  if(type==="PLTE")palette=true;
  if(type==="IDAT")image=true;
  offset+=12+len;
  if(type==="IEND")break;
 }
 assert.equal(offset,b.length,"No trailing bytes: "+file);
 assert.ok(palette&&image,"PNG has colors and image: "+file);
}
for(const [file,size] of pngs.slice(0,3)){
 const icon=manifest.icons.find(i=>i.src==="/"+file);
 assert.ok(icon,"Manifest has "+file);
 assert.equal(icon.sizes,size+"x"+size);
 assert.equal(icon.type,"image/png");
}
assert.ok(manifest.icons.some(i=>i.purpose==="maskable"),"Android adaptive icon");
assert.ok(!manifest.icons.some(i=>i.src.endsWith(".svg")),"Old placeholder app icon is no longer active");
assert.ok(fs.existsSync(path.join(root,"assets/logo.png")),"Original AutoType wordmark retained");
for(const page of html){
 const h=read(page),head=h.match(/<head>([\s\S]*?)<\/head>/i)?.[1]||"";
 for(const name of ['href="manifest.webmanifest?v=20261009-brand-v2"','href="assets/pwa/apple-logo-180-v2.png"','src="pwa.js?v=20261009-pwa-v2"','name="theme-color" content="#1f2328"','name="apple-mobile-web-app-capable" content="yes"']){
  assert.equal(head.split(name).length-1,1,"PWA head metadata on "+page+": "+name);
 }
 if(!["404.html","backend-test.html"].includes(page))assert.ok(h.includes('href="install.html"'),"Install footer on "+page);
}
assert.match(read("index.html"),/href="install\.html">Add to Home Screen/);
const install=read("install.html");
for(const text of ["Install from Safari","Add to Home Screen","Open as Web App","Install from Chrome","installPromptButton","installStatus"])
 assert.ok(install.includes(text),"Install instruction "+text);
assert.ok(manifest.shortcuts.some(x=>x.url==="/play.html"),"Play shortcut");
const sw=read("service-worker.js"),js=read("pwa.js");
assert.doesNotMatch(sw,/addEventListener\("fetch"|respondWith|cache\.add|caches\.open|caches\.match/,"No intercepted pages or forced offline screen");
assert.match(sw,/caches\.delete/,"Old offline cache cleaned");
assert.match(sw,/self\.skipWaiting/,"New worker activates as soon as possible");
assert.match(sw,/self\.clients\.claim/,"Existing app tabs receive the updated worker");
assert.match(js,/beforeinstallprompt/);
assert.match(js,/navigator\.standalone===true/);
assert.match(js,/serviceWorker\.register/);
assert.match(js,/pwa-has-dock/);
assert.match(js,/const excluded=new Set/,"Dock is available throughout normal app routes");
assert.match(js,/navigator\.standalone===true/,"iOS installed state supported");
assert.doesNotMatch(js,/localStorage|sessionStorage|AutoTypeBackend|fetch\(/,"Install helper has no sensitive side effects");
assert.ok(fs.existsSync(path.join(root,"offline-fallback.htm")));
const css=read("site-finish.css");
assert.match(css,/body\.pwa-has-dock\[data-page="play"\]:has\(#gameArea:not\(\[hidden\]\)\)/,"Mobile dock remains visible on Play menu but hides during matches");
assert.match(css,/@media\(display-mode:standalone\)/,"Native app hides install CTA");
assert.match(css,/\.pwa-install-feature/,"Responsive install experience");
assert.match(read("install.html"),/src="assets\/pwa\/icon-logo-192-v2\.png"/,"Correct installer artwork");
console.log("AutoType PWA PASSED: 27 pages, original logo icons, PWA install UI, persistent mobile dock, no offline interception.");
