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
const pngs=[["assets/pwa/icon-logo-192-v3.png",192],["assets/pwa/icon-logo-512-v3.png",512],["assets/pwa/icon-logo-maskable-512-v3.png",512],["assets/pwa/apple-logo-180-v3.png",180]];
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
 for(const name of ['href="manifest.webmanifest?v=20261009-brand-v3"','href="assets/pwa/apple-logo-180-v3.png"','src="pwa.js?v=20261009-pwa-v3"','name="theme-color" content="#1f2328"','name="apple-mobile-web-app-capable" content="yes"']){
  assert.equal(head.split(name).length-1,1,"PWA head metadata on "+page+": "+name);
 }
 assert.equal((head.match(/<link rel="icon" /g)||[]).length,1,"A single modern favicon on "+page);
 assert.doesNotMatch(head,/href="assets\/logo\.png"/,"Transparent legacy logo must not override favicon: "+page);
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
assert.match(read("install.html"),/src="assets\/pwa\/icon-logo-192-v3\.png"/,"Correct installer artwork");

// Mobile installation links are hidden by default (before JS and on desktop).
assert.match(css,/\.home-install-hint,\.footer-links a\[href="install\.html"\]\{display:none!important\}/);
assert.match(css,/html\.pwa-mobile-browser body:not\(\.pwa-standalone\) \.home-install-hint\{display:flex!important\}/);
assert.match(css,/html\.pwa-desktop-browser \.pwa-install-guide-grid/);
assert.match(css,/\.home-install-mark\{[\s\S]*?background:#fff!important/,"Install logo must have a solid white container");
assert.match(css,/\.brand-logo\{[\s\S]*?background:#fff!important/,"Site header logo stays legible");
assert.match(js,/function syncDeviceMode\(\)/);
assert.match(js,/if\(!standalone\(\)&&!isMobileDevice\(\)\)return/,"Desktop must not register the app worker");

// Evaluate mobile, desktop and installed modes without launching a real browser.
const vm=require("node:vm");
function simulate({ua="",platform="",points=0,installed=false}){
 const htmlSet=new Set(),bodySet=new Set(),events={};
 const asClassList=set=>({add:v=>set.add(v),toggle:(v,on)=>{if(on)set.add(v);else set.delete(v)}});
 const status={textContent:""},button={hidden:true,disabled:false,addEventListener:()=>{}};
 const doc={
  documentElement:{classList:asClassList(htmlSet)},
  body:{dataset:{page:"admin"},classList:asClassList(bodySet)},
  readyState:"loading",
  addEventListener:(name,cb)=>{events[name]=cb;},
  getElementById:id=>id==="installPromptButton"?button:id==="installStatus"?status:null,
  querySelector:()=>null
 };
 const appWindow={
  addEventListener:(name,cb)=>{events[name]=cb;},
  matchMedia:()=>({matches:installed}),
  isSecureContext:true
 };
 const nav={userAgent:ua,platform,maxTouchPoints:points,standalone:false,
  serviceWorker:{register:()=>{throw Error("Do not register worker in test");}}};
 vm.runInNewContext(js,{window:appWindow,navigator:nav,document:doc,location:{pathname:"/install.html"},console,URLSearchParams});
 events.DOMContentLoaded();
 return {htmlSet,bodySet,events,status:status.textContent,button};
}
const desktop=simulate({ua:"Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit Safari",platform:"MacIntel"});
assert.ok(desktop.htmlSet.has("pwa-desktop-browser"),"Desktop mode selected");
assert.ok(!desktop.htmlSet.has("pwa-mobile-browser"),"Desktop not advertised as mobile");
assert.ok(desktop.button.hidden,"Desktop install button hidden");
const phone=simulate({ua:"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit Safari",platform:"iPhone"});
assert.ok(phone.htmlSet.has("pwa-mobile-browser"),"iPhone Safari gets mobile invite");
assert.ok(!phone.htmlSet.has("pwa-desktop-browser"));
const ipad=simulate({ua:"Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit Safari",platform:"MacIntel",points:5});
assert.ok(ipad.htmlSet.has("pwa-mobile-browser"),"Desktop-like iPadOS detected correctly");
const app=simulate({ua:"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit Safari",platform:"iPhone",installed:true});
assert.ok(app.htmlSet.has("pwa-installed"),"Installed app detected");
assert.ok(!app.htmlSet.has("pwa-mobile-browser"),"Installed app doesn't invite installation");
assert.ok(app.bodySet.has("pwa-standalone"),"Installed app gets standalone shell");
assert.ok(app.button.hidden,"Installed app hides install prompt");

console.log("AutoType PWA PASSED: 27 pages, distinct desktop/mobile/installed UI, original logo icons, PWA install UI, persistent mobile dock, no offline interception.");
