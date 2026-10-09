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
const pngs=[["assets/pwa/icon-192.png",192],["assets/pwa/icon-512.png",512],["assets/pwa/icon-maskable-512.png",512],["assets/pwa/apple-touch-icon.png",180]];
for(const [file,size] of pngs){
 const b=fs.readFileSync(path.join(root,file));
 assert.deepEqual([...b.subarray(0,8)],[137,80,78,71,13,10,26,10],"PNG signature: "+file);
 assert.equal(b.readUInt32BE(16),size,"PNG width: "+file);
 assert.equal(b.readUInt32BE(20),size,"PNG height: "+file);
 assert.equal(b[24],2,"PNG palette bit depth: "+file);
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
assert.match(read("assets/pwa/app-icon.svg"),/viewBox="0 0 512 512"/);
for(const page of html){
 const h=read(page),head=h.match(/<head>([\s\S]*?)<\/head>/i)?.[1]||"";
 for(const name of ['href="manifest.webmanifest"','href="assets/pwa/apple-touch-icon.png"','src="pwa.js?v=20261009-pwa-v1"','name="theme-color" content="#1f2328"','name="apple-mobile-web-app-capable" content="yes"']){
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
assert.match(sw,/req\.mode!=="navigate"/);
assert.match(sw,/fetch\(req\)\.catch/);
assert.match(sw,/cache\.match\(OFFLINE\)/);
assert.doesNotMatch(sw,/cache\.put\(|cache\.addAll\(|caches\.match\(req\)|\/account\.html|\/game\.js/,"No stale or private page cache");
assert.match(js,/beforeinstallprompt/);
assert.match(js,/navigator\.standalone===true/);
assert.match(js,/serviceWorker\.register/);
assert.match(js,/pwa-has-dock/);
assert.match(js,/const eligible=new Set/);
assert.doesNotMatch(js,/localStorage|sessionStorage|AutoTypeBackend|fetch\(/,"Install helper has no sensitive side effects");
assert.ok(fs.existsSync(path.join(root,"offline-fallback.htm")));
console.log("AutoType PWA PASSED: 27 pages, valid PNG icons, standalone manifest, safe offline fallback and install links.");
