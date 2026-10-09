"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
const window={};
vm.runInNewContext(read("sentence-forecast.js"),{window});
const {predict,clueGuess}=window.AutoTypeSentenceForecast;
const corpus=[
  "the dog ran across the yard",
  "the cat slept beside the fire",
  "the dog barked during the storm",
  "we found a tiny note under the table"
];
const pred=predict({completed:["the"],totalWords:6,corpus,random:()=>0});
assert.deepEqual(Array.from(pred),["dog","ran","across","the","yard"],
  "Sentence mode predicts every remaining word from a real matching sentence");
const alternative=predict({completed:["the"],totalWords:6,corpus,random:()=>0.99});
assert.deepEqual(Array.from(alternative),["dog","barked","during","the","storm"],
  "Different prediction choices can produce a different whole sentence");
const corrected=predict({completed:["the","cat"],totalWords:6,corpus,random:()=>0});
assert.deepEqual(Array.from(corrected),["slept","beside","the","fire"],
  "Correcting a word steers the entire future continuation");
const unknown=predict({completed:["a","totally","new"],totalWords:9,corpus,random:()=>0});
assert.equal(unknown.length,6,"Unknown prefixes still yield the correct number of predictions");
assert.ok(unknown.every(x=>/^[a-z']+$/.test(x)),"Fallback predictions consist of typeable words");
assert.equal(predict({completed:[],totalWords:7,corpus}).length,0,
  "The first word must be completed before the full sentence is predicted");
assert.equal(predict({completed:["the","dog"],totalWords:2,corpus}).length,0,
  "No predictions remain when the sentence is done");
assert.equal(clueGuess("d","dog",()=> "desk"),"dog",
  "Current AI sentence guess becomes the suggested next word when it respects the clue");
assert.equal(clueGuess("do","dog",()=> "desk"),"dog");
assert.equal(clueGuess("c","dog",()=> "cat"),"cat",
  "A conflicting clue switches away from the incorrect sentence prediction");
assert.equal(clueGuess("dog","dog",()=> "dog"),"dog",
  "Completed words use the ordinary chooser rather than an empty suffix");

const game=read("game.js"),play=read("play.html"),css=read("sentence-mode.css");
assert.match(game,/function refreshSentenceForecast\(\)/);
assert.match(game,/function renderSentenceForecast\(\)/);
assert.match(game,/predictorMode==="sentence"&&index>0/);
assert.match(game,/refreshSentenceForecast\(\);[\s\S]*?if\(index>=words.length\)finish/);
assert.match(game,/renderSentenceForecast\(\);/);
assert.match(game,/sentenceForecast=\[\];[\s\S]*?\$\("time"\)/,
  "Restart clears the previous round's sentence forecast");
assert.match(play,/sentence-forecast\.js\?v=20261009-sentence-v1/);
assert.match(play,/sentence-mode\.css\?v=20261009-sentence-v1/);
assert.match(play,/game\.js\?v=20261009-sentence-v1/);
assert.match(play,/aria-label="Full-sentence AI prediction"/);
assert.match(css,/mobile-keyboard-active #gameArea \.sentence-prediction\.is-active\{[\s\S]*?display:block/,
  "The full-sentence forecast stays visible with the mobile keyboard");
assert.doesNotMatch(read("sentence-forecast.js"),/AutoTypeBackend|fetch\(|localStorage|addCoins|recordRound/,
  "Forecasting must not affect persistence, rewards or verified round scoring");
console.log("Sentence forecast PASSED: full phrase, correction, clue integration, mobile visibility, scoring isolation.");
