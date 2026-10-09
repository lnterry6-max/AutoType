"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
const window={};
vm.runInNewContext(read("prediction-picker.js"),{window});
const pick=window.AutoTypePredictionPicker.choose;
const base={prefix:"mi",candidates:["mild","minute","milk","mineral","mild","not-a-match"]};
const first=pick({...base,random:()=>0});
const second=pick({...base,random:()=>0.99999});
assert.notEqual(first,second,"Different random draws must yield different suggestions at the same clue");
for(const mode of ["classic","sentence","evil","daily","custom","race","tournament","npc"]){
  const one=pick({...base,mode,random:()=>0.1});
  const two=pick({...base,mode,random:()=>0.91});
  assert.ok(one.startsWith("mi")&&two.startsWith("mi"),mode+" must respect the clue prefix");
  assert.notEqual(one,two,mode+" should have real variety when there are alternatives");
}
assert.equal(pick({prefix:"xy",candidates:["xyz"],random:()=>0.8}),"xyz","Single-candidate clues remain solvable");
assert.equal(pick({prefix:"xy",candidates:[],random:()=>0.8}),"xy","No candidates fall back to the typed prefix");
assert.equal(pick({prefix:"",candidates:["hello"]}),"","No suggestions without a clue");
assert.equal(pick({prefix:"a",candidates:["a","apple","apple","ant"],random:()=>0}),"apple","Prefer longer completions and deduplicate");
assert.equal(pick({prefix:"mi",candidates:["milk","mild","minute"],recent:["milk"],previous:"milk",random:()=>0}),"mild","Avoid already shown words when fresh ones exist");
assert.equal(pick({prefix:"mi",candidates:["milk","mild"],recent:["milk","mild"],previous:"milk",random:()=>0}),"mild","Never repeat the previous word when an alternative exists");
assert.equal(pick({prefix:"mi",candidates:["minute","mild"],mode:"evil",target:"minute",random:()=>0}),"mild","Evil prioritizes the wrong completion if there is one");
assert.equal(pick({prefix:"mi",candidates:["minute"],mode:"evil",target:"minute",random:()=>0}),"minute","Evil cannot make a sole remaining prefix unsolvable");
const afterM=pick({prefix:"m",candidates:["mild","milk","mango"],previous:"",random:()=>0});
const afterMi=pick({prefix:"mi",candidates:["mild","milk","minute"],recent:[afterM],previous:afterM,random:()=>0});
assert.notEqual(afterM,afterMi,"A second clue should change the prediction when possible");
const game=read("game.js"),play=read("play.html");
assert.match(game,/const chosen=predictorMode==="context"[\s\S]*?AutoTypePredictionPicker\.choose\(/,
  "Context must retain sentence-based candidates; other modes must use random selection");
assert.match(game,/recent:recentGuesses/,"The picker needs history to reduce repetition");
assert.match(game,/visible=guess\(\)/,"Typing a clue must actually request a new guess");
assert.match(game,/if\(wrongTail>0\)/,"Clue typing still respects protected correct letters and incorrect AI tails");
assert.match(game,/function promoteCorrectAI\(/,"Correct AI overlap must remain intact");
assert.match(play,/<script src="prediction-picker\.js\?v=20261009-random-clues-v1"><\/script>\s*<script src="sentence-forecast\.js\?v=20261009-sentence-v1"><\/script>\s*<script src="game\.js\?v=20261009-sentence-v1"><\/script>/,
  "Picker must load before the game engine, with a cache-busted URL");
assert.doesNotMatch(read("prediction-picker.js"),/localStorage|AutoTypeBackend|fetch\(|addCoins|recordRound/,
  "The word picker must not affect progression or the backend");
console.log("Fresh prediction regression PASSED (random per clue, all modes except Context, no repeats, Evil, mobile-shared engine).");
