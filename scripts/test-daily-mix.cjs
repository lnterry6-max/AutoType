"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const store=new Map();
const window={
  localStorage:{
    getItem:key=>store.has(key)?store.get(key):null,
    setItem:(key,value)=>store.set(key,value)
  },
  location:{search:""},
  AutoType:{currentAccount:()=>null}
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,"..","daily-mix.js"),"utf8"),{window,console,Date,Math,URLSearchParams});
const mix=window.AutoTypeDailyMix;
const date="2026-10-08",next="2026-10-09";
const today=mix.plan(date),tomorrow=mix.plan(next);
assert.equal(today.length,3);
assert.equal(new Set(today.map(goal=>goal.mode)).size,3,"Every daily goal uses a different mode");
assert.equal(mix.plan(date).map(x=>x.mode).join(","),today.map(x=>x.mode).join(","),"Today's lineup stays stable");
assert.notEqual(tomorrow.map(x=>x.mode).join(","),today.map(x=>x.mode).join(","),"New day rotates modes");
for(const goal of today){
  assert.ok(["complete","clean","score","combo","words"].includes(goal.kind));
  assert.equal(mix.isComplete(goal,{mode:"invalid",words:10,score:900,errors:0,max_streak:10}),false);
  const win={mode:goal.mode,words:10,score:900,errors:0,max_streak:10};
  assert.equal(mix.isComplete(goal,win),true,"Goals should be achievable");
}
const [first]=today;
assert.equal(mix.recordGuestRound({mode:first.mode,words:8,score:700,errors:0,max_streak:5},date),true);
assert.equal(mix.guestRounds(date).length,1);
assert.equal(mix.guestRounds(next).length,0);
assert.equal(mix.progress(mix.guestRounds(date),date)[0].complete,true);
assert.equal(mix.recordGuestRound({mode:"tournament",words:5},date),false,"No game economy or tournament shortcuts");
assert.equal(mix.guestRounds(date).length,1);
for(let i=0;i<110;i++)mix.recordGuestRound({mode:"classic",words:8,score:600},date);
assert.equal(mix.guestRounds(date).length,80,"Guest history stays bounded");
assert.match(mix.surpriseUrl("classic"),/^play.html\?mode=(context|sentence|evil)$/);
console.log("Daily Mix regression PASSED (rotation, verification rules, guest history, surprise mode).");
