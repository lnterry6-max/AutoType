"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const script=read("progression-feedback.js");
const sandbox={window:{}};
vm.runInNewContext(script,sandbox);
const model=sandbox.window.AutoTypeProgression;
assert.ok(model?.compare&&model?.render&&model?.snapshot);
const old={xp:450,level:1,into:450,perLevel:500,remaining:50,pct:90};
const advanced={xp:620,level:2,into:120,perLevel:500,remaining:380,pct:24,bestScore:130};
const before=model.snapshot(old,100);
const levelUp=model.compare(before,advanced,{confirmed:true,score:130});
assert.equal(levelUp.kind,"levelup");
assert.equal(levelUp.gain,170);
assert.equal(levelUp.title,"Level 2 unlocked");
assert.equal(levelUp.progress,"120 / 500 XP");
assert.equal(levelUp.next,"380 XP to level 3");
assert.equal(levelUp.best,true);
assert.equal(model.compare(before,advanced,{practice:true}).visible,false,"NPC races never show earned progression");
const pending=model.compare(before,advanced,{confirmed:false});
assert.equal(pending.kind,"pending","Unverified backend saves cannot show XP");
assert.equal(pending.gain,undefined,"Unverified results must not claim XP");
const local=model.compare(before,advanced,{local:true,score:0});
assert.equal(local.kind,"levelup");
assert.match(local.note,/levels|browser/i);
const regular=model.compare({xp:1200,level:3,into:200,perLevel:500,remaining:300,pct:40,bestScore:400},
{xp:1275,level:3,into:275,perLevel:500,remaining:225,pct:55},{score:125});
assert.equal(regular.kind,"progress");
assert.equal(regular.gain,75);
assert.equal(regular.best,false);
const zero=model.compare(regular,regular,{score:0});
assert.equal(zero.gain,0);
const ids=["roundProgressKicker","roundProgressTitle","roundProgressNote","roundXpGain",
 "roundXpTrack","roundXpFill","roundProgressCount","roundProgressNext","roundBestBadge"];
const nodes=Object.fromEntries(ids.map(id=>[id,{hidden:false,textContent:"",style:{},
  attributes:{},setAttribute(n,v){this.attributes[n]=v}}]));
const classes=new Set();
const host={hidden:true,classList:{toggle(n,on){if(on)classes.add(n);else classes.delete(n)}},
querySelector(sel){return nodes[sel.slice(1)]||null}};
model.render(host,levelUp);
assert.equal(host.hidden,false);
assert.equal(classes.has("level-up"),true);
assert.equal(nodes.roundXpGain.textContent,"+170 XP");
assert.equal(nodes.roundXpFill.style.width,"24%");
assert.equal(nodes.roundXpTrack.attributes["aria-valuenow"],"24");
assert.equal(nodes.roundBestBadge.hidden,false);
model.render(host,pending);
assert.equal(nodes.roundXpGain.hidden,true);
assert.equal(nodes.roundXpTrack.hidden,true);
assert.equal(nodes.roundBestBadge.hidden,true);
model.render(host,{visible:false});
assert.equal(host.hidden,true);
const play=read("play.html"),game=read("game.js");
assert.match(play, /<script src="progression-feedback\.js\?v=[^"]+"><\/script>[\s\S]*?<script src="prediction-picker\.js\?v=[^"]+"><\/script>\s*<script src="game\.js\?v=[^"]+"><\/script>/,
  "Progression and fresh-word picker must both load before the game engine");
assert.ok(play.includes('id="roundProgression"'));
assert.ok(play.includes('id="resultCoinLabel"'));
assert.ok(game.includes("confirmed:!activeAccount?.online||verifiedSaved"));
assert.ok(game.includes("practice:!!npc"));
assert.ok(game.includes("AutoTypeProgression.render"));
assert.ok(game.includes('if($("roundProgression"))$("roundProgression").hidden=true'));
for(const page of ["index.html","play.html","profile.html","achievements.html"])
 assert.ok(read(page).includes("progression-polish.css?v=20261008-progression-v1"),"Missing progression styles on "+page);
assert.match(read("achievements.html"),/id="achievementSpotlight"/);
assert.match(read("achievements.html"),/nextAchievements=AutoType\.achievementDefs/);
assert.match(read("progression-polish.css"),/prefers-reduced-motion:reduce/);
assert.match(read("progression-polish.css"),/animations-off/);
assert.doesNotMatch(script,/AutoTypeBackend|addCoins|addTickets|recordRound|localStorage|fetch\(/,
 "Presentation utility may not grant currency, call APIs or persist fabricated results");
console.log("Progression feedback regression PASSED (level-ups, NPC isolation, pending saves, guest progress, UI accessibility).");
