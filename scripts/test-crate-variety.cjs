"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const source=fs.readFileSync(path.join(root,"core.js"),"utf8");
function slice(begin,end){
 const a=source.indexOf(begin),b=source.indexOf(end,a+begin.length);
 assert.ok(a>=0&&b>a,"Expected catalog declaration boundaries");
 return source.slice(a,b);
}
const vmSource=slice("const shopCatalog = [","const collectionDefs = [")
 + slice("const crateDefs = [","const defaultTournamentDefs = [")
 + "\nthis.fixture={catalog:shopCatalog,crates:crateDefs};";
const context={};
vm.runInNewContext(vmSource,context);
const {catalog,crates}=context.fixture;
const orig=["starter_crate","profile_crate","gamefx_crate"];
const added=["neon_nights_crate","cosmic_crate","color_shuffle_crate","evil_glitch_crate"];
assert.equal(crates.length,7,"Three token crates and four free mode crates should appear");
assert.equal(new Set(crates.map(c=>c.id)).size,6);
for(const id of orig){
 const c=crates.find(c=>c.id===id);
 assert.ok(c,"Original crate is retained");
 assert.equal(c.keyCost,1);
 assert.ok(!c.roundsPerDrop);
}
for(const id of added){
 const c=crates.find(c=>c.id===id);
 assert.ok(c,"New free surprise drop is visible");
 assert.equal(c.keyCost,0,"New drops cannot spend tokens");
 assert.equal(c.roundsPerDrop,5);
 assert.ok(["classic","context","sentence","evil"].includes(c.gameMode));
 assert.equal(Object.values(c.odds).reduce((n,x)=>n+x,0),100);
 const pool=catalog.filter(item=>item.price>0&&!item.earnedOnly&&!item.collectionOnly&&c.categories.includes(item.category));
 assert.ok(pool.length>=10,"Each themed drop needs meaningful item variety");
 for(const [rarity,pct] of Object.entries(c.odds)){
   assert.ok(pct>=0&&pct<=100);
   assert.ok(pool.some(item=>item.rarity===rarity),"Advertised rarity must exist: "+id+" "+rarity);
 }
}
const markup=fs.readFileSync(path.join(root,"shop.html"),"utf8");
assert.doesNotMatch(markup,/fixedPackCard|data-open-fixed-pack|GUARANTEED COSMETIC/i);
assert.match(markup,/FREE GAMEPLAY REWARD/);
assert.match(markup,/Claim free surprise drop/);
console.log("Crate variety regression PASSED (three original crates, four mode crates, 100% odds, all rarity pools, no fixed packs).");
