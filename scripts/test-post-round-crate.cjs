"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const game=fs.readFileSync(path.join(root,"game.js"),"utf8");
const html=fs.readFileSync(path.join(root,"play.html"),"utf8");
const start=game.indexOf("  const crateModeNames=");
const end=game.indexOf('  const quickMatch=',start);
assert.ok(start>0&&end>start,"Missing mode crate display function");
const logic=game.slice(start,end)+"\nthis.showCrateProgress=showRoundCrateProgress;";
for(const id of ["resultModeCrate","resultModeCrateTitle","resultModeCrateHint",
                 "resultModeCrateCount","resultModeCrateMeter"]){
  assert.ok(html.includes('id="'+id+'"'),"Missing result markup "+id);
}
assert.match(html,/href="shop\.html#crates"/);
assert.match(html,/game\.js\?v=20261008-result-crate-progress-v1/);
assert.match(game,/void showRoundCrateProgress\(verifiedSaved\)/);
assert.match(game,/crateProgressRequest\+\+/);
const ui=Object.fromEntries(["resultModeCrate","resultModeCrateTitle","resultModeCrateHint",
  "resultModeCrateCount","resultModeCrateMeter"].map(id=>[id,{hidden:true,textContent:"",value:0}]));
const get=id=>{assert.ok(ui[id],"No UI mock for "+id);return ui[id]};
let byMode={classic:{rounds:24,claimed:0,remaining:24},context:{rounds:2,claimed:0,remaining:2},
  sentence:{rounds:5,claimed:0,remaining:5},evil:{rounds:0,claimed:0,remaining:0}};
const context={
  mode:"classic",account:{online:true},$:get,
  AutoTypeBackend:{freeCrateProgress:async()=>byMode},
  AutoType:{currentProfile:()=>({modeRounds:{classic:9,context:2}}),
    currentAccount:()=>({wallet:{modeDropClaims:{classic:1}}})},
  console
};
vm.runInNewContext(logic,context);
(async()=>{
  await context.showCrateProgress(false);
  assert.equal(ui.resultModeCrate.hidden,true,"Unverified online rounds do not earn verified rewards");
  await context.showCrateProgress(true);
  assert.equal(ui.resultModeCrate.hidden,false);
  assert.equal(ui.resultModeCrateCount.textContent,"24 / 5 rounds");
  assert.equal(ui.resultModeCrateMeter.value,5);
  assert.match(ui.resultModeCrateHint.textContent,/4 Word crates are ready/);
  byMode.classic={rounds:24,claimed:1,remaining:19};
  await context.showCrateProgress(true);
  assert.equal(ui.resultModeCrateCount.textContent,"19 / 5 rounds");
  context.mode="context";
  await context.showCrateProgress(true);
  assert.equal(ui.resultModeCrateCount.textContent,"2 / 5 rounds");
  assert.match(ui.resultModeCrateHint.textContent,/3 more verified Context rounds/);
  context.mode="daily";
  await context.showCrateProgress(true);
  assert.equal(ui.resultModeCrate.hidden,true,"Daily mode must not imply a mode-specific crate");
  context.mode="classic";
  context.account={online:false};
  await context.showCrateProgress(false);
  assert.equal(ui.resultModeCrateCount.textContent,"4 / 5 rounds","Guest count uses mode-specific local rounds and claims");
  console.log("Post-round crate regression PASSED (verified gate, exact mode, 24/5, 19/5, guest, non-core hidden).");
})().catch(e=>{console.error(e);process.exitCode=1});
