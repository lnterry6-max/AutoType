"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const core=fs.readFileSync(path.join(root,"core.js"),"utf8");
function slice(start,end){
  const a=core.indexOf(start),b=core.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,"Expected crate definitions");
  return core.slice(a,b);
}
const fixture={};
vm.runInNewContext(slice("const shopCatalog = [","const collectionDefs = [")
  +slice("const crateDefs = [","const defaultTournamentDefs = [")
  +"\nthis.defs=crateDefs;",fixture);
const defs=fixture.defs,free=defs.filter(c=>c.roundsPerDrop);
assert.equal(free.length,4);
assert.equal(defs.filter(c=>!c.roundsPerDrop).length,3);
assert.deepEqual(Array.from(free.map(c=>c.gameMode)),["classic","context","sentence","evil"]);
for(const crate of free){
  assert.equal(crate.roundsPerDrop,5);
  assert.equal(crate.keyCost,0);
}
const shop=fs.readFileSync(path.join(root,"shop.html"),"utf8");
assert.match(shop,/freeDropRemaining\(crate\.gameMode\)/);
assert.match(shop,/freeDropRemaining\(chosen\.gameMode\)/);
assert.match(shop,/freeCrateModeProgress/);
assert.doesNotMatch(shop,/SHARED ROUND PROGRESS|rounds completed in any mode/);
const game=fs.readFileSync(path.join(root,"game.js"),"utf8");
assert.match(game,/p\.modeRounds\[mode\]/);
assert.match(core,/a\.wallet\.modeDropClaims\[crate\.gameMode\]/);

// Emulate server-authoritative count queries on four independently earned balances.
let rounds={classic:24,context:2,sentence:5,evil:0};
let claimed={classic:0,context:0,sentence:0,evil:0};
const requests=[];
const db={
  auth:{getUser:async()=>({data:{user:{id:"test-player"}},error:null})},
  from(table){
    return {select(fields,opt){
      assert.equal(fields,"id");assert.equal(opt.count,"exact");assert.equal(opt.head,true);
      const filters={};
      return {eq(key,val){
        filters[key]=val;return this;
      },then(ok,bad){
        assert.equal(filters.user_id,"test-player");
        let mode;
        if(table==="round_results"){
          assert.equal(filters.verified,true);
          mode=filters.mode;
        }else{
          assert.equal(table,"economy_transactions");
          assert.equal(filters.kind,"crate_open");
          assert.equal(filters["metadata->>free_drop"],"true");
          mode=filters["metadata->>mode"];
        }
        assert.ok(["classic","context","sentence","evil"].includes(mode),"Each query must filter its own mode");
        requests.push({table,mode,filters:{...filters}});
        return Promise.resolve({count:table==="round_results"?rounds[mode]:claimed[mode],error:null}).then(ok,bad);
      }};
    }};
  }
};
const window={AUTOTYPE_SUPABASE:{url:"https://test.invalid",publishableKey:"test"},supabase:{createClient:()=>db}};
vm.runInNewContext(fs.readFileSync(path.join(root,"backend.js"),"utf8"),{window,console});
(async()=>{
  let p=await window.AutoTypeBackend.freeCrateProgress();
  assert.deepEqual(Object.fromEntries(Object.entries(p).map(([mode,v])=>[mode,v.remaining])),
    {classic:24,context:2,sentence:5,evil:0});
  const sequence=[];
  for(let i=0;i<5;i++){
    p=await window.AutoTypeBackend.freeCrateProgress();
    sequence.push(p.classic.remaining);
    assert.equal(p.context.remaining,2,"Word opening cannot consume Context rounds");
    assert.equal(p.sentence.remaining,5,"Word opening cannot consume Sentence rounds");
    if(p.classic.remaining>=5)claimed.classic++;
  }
  assert.deepEqual(sequence,[24,19,14,9,4]);
  rounds.classic++;
  p=await window.AutoTypeBackend.freeCrateProgress();
  assert.equal(p.classic.remaining,5);
  assert.equal(p.context.remaining,2);
  claimed.sentence++;
  p=await window.AutoTypeBackend.freeCrateProgress();
  assert.equal(p.sentence.remaining,0);
  assert.equal(p.classic.remaining,5);
  assert.equal(requests.length,(1+5+1+1)*8,"Each refresh checks four verified round counts and four per-mode claims");
  console.log("Mode crate regression PASSED (independent Word/Context/Sentence/Evil balances, 24→19→14→9→4→5, per-mode claims).");
})().catch(error=>{console.error(error);process.exitCode=1});
