/* Regression test: Online leaderboard must match Profile's lifetime XP inputs.
 * All accounts and records here are fictional; no live database access.
 */
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const root=path.resolve(__dirname,"..");
const achievements=["mindReader","backspaceWarrior","perfectRead","marathon","century","comboKing"];
const now=new Date().toISOString();
const tables={
  player_stats:[
    {
      user_id:"test-a",verified_best_score:2450,best_streak:9,
      rounds:22,words:260,profiles:{username:"testing_a",display_name:"Test A"}
    },
    {
      user_id:"test-b",verified_best_score:120,best_streak:0,
      rounds:1,words:1,profiles:{username:"testing_b",display_name:"Test B"}
    }
  ],
  user_achievements:achievements.map(achievement_id=>({user_id:"test-a",achievement_id})),
  round_results:[
    {user_id:"test-a",score:2450,verified:true,mode:"daily",created_at:now,
      profiles:{username:"testing_a",display_name:"Test A"}},
    {user_id:"test-b",score:110,verified:true,mode:"daily",created_at:now,
      profiles:{username:"testing_b",display_name:"Test B"}}
  ]
};
function makeQuery(tableName){
  const filters=[];
  let sortKey=null,descending=false,max=Infinity;
  const query={
    select(){return query},
    eq(field,value){filters.push(row=>row[field]===value);return query},
    in(field,values){filters.push(row=>values.includes(row[field]));return query},
    gte(field,value){filters.push(row=>row[field]>=value);return query},
    lt(field,value){filters.push(row=>row[field]<value);return query},
    order(field,{ascending=true}={}){sortKey=field;descending=!ascending;return query},
    limit(n){max=n;return query},
    then(resolve,reject){
      let data=(tables[tableName]||[]).filter(row=>filters.every(f=>f(row)));
      if(sortKey){
        data=data.sort((a,b)=>{
          if(a[sortKey]===b[sortKey])return 0;
          return (a[sortKey]>b[sortKey]?1:-1)*(descending?-1:1);
        });
      }
      return Promise.resolve({data:data.slice(0,max),error:null}).then(resolve,reject);
    }
  };
  return query;
}
const db={from:makeQuery};
const window={
  AUTOTYPE_SUPABASE:{url:"https://example.invalid",publishableKey:"test"},
  supabase:{createClient:()=>db}
};
vm.runInNewContext(fs.readFileSync(path.join(root,"backend.js"),"utf8"),{window,console});
const backend=window.AutoTypeBackend;

function levelFromLiveProgress(player){
  const earned=achievements.filter(id=>player.achievements?.[id]).length;
  const xp=player.words*10+player.rounds*50+player.best_streak*20+earned*200;
  return Math.floor(xp/500)+1;
}
(async()=>{
  const all=await backend.leaderboard(100);
  assert.equal(all.length,2);
  assert.equal(levelFromLiveProgress(all[0]),11,"All-time ranked level must include six achievements");
  assert.equal(all[0].words,260);
  assert.equal(all[0].rounds,22);
  assert.equal(all[0].best_streak,9);
  assert.equal(Object.keys(all[0].achievements).length,6);
  assert.equal(levelFromLiveProgress(all[1]),1);

  const daily=await backend.dailyLeaderboard(now.slice(0,10));
  assert.equal(daily.length,2);
  assert.equal(levelFromLiveProgress(daily[0]),11,"Daily leaderboard must use lifetime stats");
  assert.equal(daily[0].score,2450,"Daily ranking must still use daily score");
  assert.equal(levelFromLiveProgress(daily[1]),1);
  assert.equal((await backend.dailyLeaderboard("2020-01-01")).length,0);
  console.log("Level consistency regression PASSED (all-time, daily, achievements, empty date).");
})().catch(e=>{console.error(e);process.exitCode=1;});
