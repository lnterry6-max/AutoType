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

const {matchingPrefix}=window.AutoTypeSentenceForecast;
assert.equal(matchingPrefix(["dog","ran","wrong"],["dog","ran","across"]),2,
  "One tap may accept exactly two correct predicted words");
assert.equal(matchingPrefix(["cat","ran"],["dog","ran"]),0,
  "A wrong first word cannot be accepted");
assert.equal(matchingPrefix(["dog","ran","across"],["dog"]),1,
  "A match never exceeds the actual target");
const withoutAnswer=predict({
  completed:["the","dog"],totalWords:6,corpus,
  exclude:"the dog ran across the yard",random:()=>0
});
assert.notDeepEqual(Array.from(withoutAnswer),["ran","across","the","yard"],
  "The target sentence must not reveal itself through a memorized unique continuation");

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
const edge=read("supabase/functions/game-api/index.ts");
const sql=read("supabase/migrations/20261009183747_sentence_phrase_acceptance.sql");
assert.match(game,/function acceptSentencePhrase\(\)/,"Sentence Mode has a real one-tap acceptance action");
assert.match(game,/sentencePhraseWords\+=count/);
assert.match(game,/sentencePhraseActions\+\+/);
assert.match(game,/score\+=20\+Math\.min\(streak\*5,30\)/,
  "Auto-accepted words cannot claim full single-clue points");
assert.match(game,/sentencePhraseWords,[\s\S]*?sentencePhraseActions,[\s\S]*?errors/,
  "Round reports real phrase metrics alongside real key presses");
assert.match(play,/id="sentenceAcceptButton"/);
assert.match(play,/<strong>Sentence:<\/strong> Accepted AI words earn 20 points each/);
assert.match(css,/sentence-accept-button\[hidden\]\{display:none!important\}/);
assert.match(edge,/rpc\("autotype_record_sentence_round"/);
assert.match(edge,/rpc\("autotype_record_verified_round",metrics\)/,
  "Other competitive modes retain their existing RPC");
assert.match(sql,/p_total_keys < \(p_words-p_batch_words\)\*2\+p_batch_actions/);
assert.match(sql,/max_score:=max_score-100\*p_batch_words/);
assert.match(sql,/revoke execute on function public\.autotype_record_sentence_round/,
  "Only the trusted service role may submit verified phrase results");
console.log("Sentence Mode PASSED: phrase matching, target exclusion, truthful input, score cap, server route and mobile UI.");
