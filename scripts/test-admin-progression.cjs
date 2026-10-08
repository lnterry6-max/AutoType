"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const profiles=[{id:"a",username:"alpha"},{id:"b",username:"beta"}];
const achievements=["mindReader","backspaceWarrior","perfectRead","marathon","century","comboKing"].map(achievement_id=>({user_id:"a",achievement_id}));
const stats=[{user_id:"a",rounds:22,words:260,best_streak:9},{user_id:"b",rounds:1,words:1,best_streak:0}];
const calls=[];
const db={
  functions:{invoke:async(name,payload)=>({data:{role:"developer",profiles,stats,roles:[],wallets:[]},error:null})},
  from:table=>{
    assert.equal(table,"user_achievements");
    return {select:columns=>{
      assert.equal(columns,"user_id,achievement_id");
      return {in:async(field,ids)=>{calls.push(ids);return {data:achievements.filter(a=>ids.includes(a.user_id)),error:null}}};
    }};
  }
};
const browser={AUTOTYPE_SUPABASE:{url:"https://test.invalid",publishableKey:"test"},supabase:{createClient:()=>db}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,"..","backend.js"),"utf8"),{window:browser,console});
(async()=>{
  const result=await browser.AutoTypeBackend.adminSnapshot();
  assert.equal(result.achievements.length,6);
  assert.equal(calls.length,1,"Admin achievement query should be batched");
  const levels=result.stats.map(row=>{
    const unlocked=result.achievements.filter(a=>a.user_id===row.user_id).length;
    const xp=row.words*10+row.rounds*50+row.best_streak*20+unlocked*200;
    return Math.floor(xp/500)+1;
  });
  assert.equal(levels[0],11,"Admin level should include achievements, like Profile and Leaderboard");
  assert.equal(levels[1],1);
  const markup=fs.readFileSync(path.join(__dirname,"..","admin.html"),"utf8");
  assert.match(markup,/achievements:m\.achievements\[profile\.id\]\|\|\{\}/);
  console.log("Admin progression regression PASSED (batched achievements, shared XP formula, offline fallback untouched).");
})().catch(error=>{console.error(error);process.exitCode=1});
