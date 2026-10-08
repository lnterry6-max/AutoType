"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const source=fs.readFileSync(path.join(root,"core.js"),"utf8");
function cut(a,b){
  const start=source.indexOf(a),end=source.indexOf(b,start+a.length);
  assert.ok(start>=0&&end>start);
  return source.slice(start,end);
}
const scope={};
vm.runInNewContext(cut("const shopCatalog = [","const collectionDefs = [")
  +cut("const crateDefs = [","const defaultTournamentDefs = [")
  +"\nthis.fixture={catalog:shopCatalog,crates:crateDefs};",scope);
const {catalog,crates}=scope.fixture;
const free=crates.filter(c=>c.roundsPerDrop);
assert.equal(free.length,4);
assert.equal(crates.filter(c=>!c.roundsPerDrop).length,3);
assert.deepEqual(Array.from(free.map(x=>x.gameMode)),["classic","context","sentence","evil"]);
for(const item of free){
  assert.equal(item.roundsPerDrop,5);
  assert.equal(item.keyCost,0);
  assert.equal(Object.values(item.odds).reduce((n,v)=>n+v,0),100);
  const pool=catalog.filter(x=>x.price>0&&!x.earnedOnly&&!x.collectionOnly&&item.categories.includes(x.category));
  for(const rarity of Object.keys(item.odds)){
    assert.ok(pool.some(x=>x.rarity===rarity),item.id+" lacks rarity "+rarity);
  }
}
const shop=fs.readFileSync(path.join(root,"shop.html"),"utf8");
assert.match(shop,/id="freeCrateRoundCount"/);
assert.match(shop,/freeDropProgress\.remaining/);
assert.match(shop,/syncCrateModalButton/);
assert.match(shop,/await refreshFreeDropProgress\(\)/);
assert.match(shop,/play\.html\?mode=/);

const progress={rounds:24,claimed:0};
const balances=[];
for(let i=0;i<5;i++){
  balances.push(progress.rounds-progress.claimed*5);
  if(progress.rounds-progress.claimed*5>=5)progress.claimed++;
}
assert.deepEqual(balances,[24,19,14,9,4]);
assert.equal(progress.claimed,4);
progress.rounds++;
assert.equal(progress.rounds-progress.claimed*5,5);

let rounds=24,claims=0;
const calls=[];
const db={
 auth:{getUser:async()=>({data:{user:{id:"player-test"}},error:null})},
 from(name){return {
  select(fields,opt){
   assert.equal(fields,"id");
   assert.equal(opt.count,"exact");
   assert.equal(opt.head,true);
   const filters=[];
   return {eq(field,value){
     filters.push([field,value]);calls.push([name,field,value]);
     return this;
    },
    then(ok,bad){
      assert.ok(filters.some(([f,v])=>f==="user_id"&&v==="player-test"));
      if(name==="round_results")return Promise.resolve({count:rounds,error:null}).then(ok,bad);
      if(name==="economy_transactions"){
        assert.ok(filters.some(([f,v])=>f==="kind"&&v==="crate_open"));
        assert.ok(filters.some(([f,v])=>f==="metadata->>free_drop"&&v==="true"));
        return Promise.resolve({count:claims,error:null}).then(ok,bad);
      }
      throw Error("Unexpected table "+name);
    }
   };
  }
 }}};
};
const window={AUTOTYPE_SUPABASE:{url:"https://test.invalid",publishableKey:"test"},supabase:{createClient:()=>db}};
vm.runInNewContext(fs.readFileSync(path.join(root,"backend.js"),"utf8"),{window,console});
(async()=>{
 for(const expected of [24,19,14,9,4]){
   const result=await window.AutoTypeBackend.freeCrateProgress();
   assert.equal(result.remaining,expected);
   assert.equal(result.rounds,24);
   if(result.remaining>=5)claims++;
 }
 rounds=25;
 const result=await window.AutoTypeBackend.freeCrateProgress();
 assert.equal(result.remaining,5);
 assert.equal(result.claimed,4);
 console.log("Mode crate progress regression PASSED (24 → 19 → 14 → 9 → 4 → 5, four distinct mode themes, verified backend counts).");
})().catch(err=>{console.error(err);process.exitCode=1});
