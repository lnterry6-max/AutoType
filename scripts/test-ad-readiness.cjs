"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const pages=fs.readdirSync(root).filter(p=>p.endsWith(".html"));
const publicPages=["about.html","privacy.html","contact.html"];
assert.equal(pages.length,26);
for(const p of publicPages){
 const h=read(p);
 assert.equal((h.match(/<main\b/g)||[]).length,1,"One main landmark: "+p);
 assert.equal((h.match(/<\/main>/g)||[]).length,1,"One main closure: "+p);
 assert.ok(h.includes('href="site-finish.css?v=20261008-finish-v1"'),"Consistent brand CSS: "+p);
 assert.ok(h.includes('href="privacy.html"'),"Public policy must be discoverable: "+p);
 assert.ok(h.includes('href="contact.html"'),"Contact route must be discoverable: "+p);
 assert.ok(h.includes('href="about.html"'),"About must be discoverable: "+p);
 assert.ok(h.includes('<meta name="description" content="'),"Search meta: "+p);
 assert.ok(!h.includes('name="robots" content="noindex"'),"Public policy must be indexable: "+p);
}
for(const p of pages.filter(p=>p!=="404.html"&&p!=="backend-test.html")){
 const h=read(p);
 for(const name of publicPages){
  assert.ok(h.includes('href="'+name+'"'),"Site-wide footer missing "+name+" in "+p);
 }
}
const privacy=read("privacy.html");
for(const text of ["Supabase","Resend","GitHub Pages","Google AdSense","cookies","My Ad Center",
                   "Settings","live advertising is not enabled","account deletion"]){
 assert.ok(privacy.includes(text)||((text==="account deletion")&&privacy.includes("permanent account deletion")),
  "Privacy disclosure missing: "+text);
}
const contact=read("contact.html");
assert.match(contact,/href="feedback\.html"/,"Private signed-in feedback is primary contact path");
assert.match(contact,/github\.com\/lnterry6-max\/AutoType\/issues/,"Public technical issue fallback exists");
for(const address of ["support@auto-type.net","privacy@auto-type.net"]){
 assert.ok(contact.includes('href="mailto:'+address+'"'),"Contact page must link "+address);
 assert.ok(privacy.includes('href="mailto:'+address+'"'),"Privacy page must link "+address);
}
assert.doesNotMatch(contact,/public email support inbox has not been established/,"Stale support warning must be removed");
assert.match(read("ADS_READINESS.md"),/confirmed through test messages/,"Keep contact readiness accurately documented");
const previewPages={"index.html":"home-discovery","leaderboard.html":"leaderboard-bottom","how-to.html":"guide-bottom"};
for(const [p,slot] of Object.entries(previewPages)){
 const page=read(p);
 assert.ok(page.includes('data-autotype-ad-slot="'+slot+'"'),"Expected reserved location: "+p);
 assert.match(page,new RegExp('data-autotype-ad-slot="'+slot+'"[^>]*\\shidden'),"Ad placeholder hidden by default: "+p);
 assert.ok(page.includes('src="ad-preview.js?v=20261009-ad-readiness-v1"'),"Preview script needed: "+p);
}
for(const p of pages.filter(p=>!Object.hasOwn(previewPages,p))){
 assert.doesNotMatch(read(p),/data-autotype-ad-slot=/,"No ad location on gameplay, shop, accounts or chats: "+p);
 assert.doesNotMatch(read(p),/src="ad-preview\.js/,"No ad preview dependency on private/game pages: "+p);
}
const verification='<meta name="google-adsense-account" content="ca-pub-9541821976044642">';
for(const p of pages){
 const html=read(p),head=html.match(/<head>([\s\S]*?)<\/head>/i)?.[1]||"";
 assert.equal(head.split(verification).length-1,1,"Exactly one correct publisher tag in HTML head: "+p);
 assert.doesNotMatch(html,/ca-pub-3694969670830097/,"Prior AdSense publisher account ID must not appear: "+p);
}
for(const p of [...pages,"ad-preview.js"]){
 assert.doesNotMatch(read(p),/pagead2\.googlesyndication\.com|adsbygoogle\.push\(/,
 "Site verification must not load advertisements or tracking: "+p);
}
const src=read("ad-preview.js");
const fake=()=>({
 hidden:true, dataset:{autotypeAdSlot:"home-discovery"},innerHTML:"",
 querySelector(selector){return {set textContent(v){this.label=v;}}}
});
const slot=fake();
vm.runInNewContext(src,{location:{search:""},document:{
  querySelectorAll(){throw Error("Preview must not touch DOM on normal site");}
},URLSearchParams});
assert.equal(slot.hidden,true,"Standard site must show no fake ads");
vm.runInNewContext(src,{location:{search:"?ad-preview=1"},document:{
  querySelectorAll(selector){assert.equal(selector,"[data-autotype-ad-slot]");return [slot];}
},URLSearchParams});
assert.equal(slot.hidden,false,"Explicit preview must display the reserved area");
assert.match(slot.innerHTML,/PREVIEW ONLY/);
assert.match(read("site-finish.css"),/autotype-ad-slot\[hidden\]/,"Hidden placeholder guard in site CSS");
console.log("Ad readiness PASSED: 26 publisher verification meta tags, 3 public pages, 3 inactive preview slots, zero live ad calls.");
