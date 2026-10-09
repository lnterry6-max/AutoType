"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const overlay={hidden:true,classes:new Set(),classList:{add(v){overlay.classes.add(v)},remove(v){overlay.classes.delete(v)}}};
const handles=new Map();let next=0,lastDelay=null;
const ctx={
 window:{matchMedia:()=>({matches:false})},
 document:{getElementById:k=>k==="roundDoneOverlay"?overlay:null,body:{classList:{contains:()=>false}}},
 setTimeout:(cb,ms)=>{lastDelay=ms;const n=++next;handles.set(n,cb);return n},
 clearTimeout:id=>handles.delete(id)
};
vm.runInNewContext(read("completion-feedback.js"),ctx);
const completion=ctx.window.AutoTypeCompletion;
completion.show();
assert.equal(overlay.hidden,false,"DONE appears immediately");
assert.ok(overlay.classes.has("is-visible"),"DONE fades in");
assert.equal(lastDelay,1650,"DONE fades out in under two seconds");
assert.equal(handles.size,1);
completion.show();
assert.equal(handles.size,1,"Repeated finish cancels prior hide timer");
completion.hide();
assert.equal(overlay.hidden,true,"Reset removes banner");
assert.equal(handles.size,0,"Reset prevents a stale timer");
ctx.window.matchMedia=()=>({matches:true});
completion.show();
assert.equal(lastDelay,750,"Reduced motion uses a short static cue");
const cb=[...handles.values()][0];cb();
assert.equal(overlay.hidden,true,"DONE hides automatically");

const game=read("game.js"),play=read("play.html"),
  arcade=read("plinko.js"),plinko=read("plinko.html"),css=read("completion-feedback.css");
assert.match(game,/let roundFinishing=false/);
assert.match(game,/textContent=\x60\$\{Math\.min\(index,words\.length\)\} \/ \$\{words\.length\}\x60/,
  "Counter reflects completed words, not the next word number");
assert.match(game,/if\(index>=words\.length\)\{[\s\S]*?\$\("guess"\)\.textContent="DONE"/,
  "Final word renders a completed target state instead of another clue");
assert.match(game,/async function finish\(\)\{[\s\S]*?render\(\);[\s\S]*?AutoTypeCompletion\?\.show\(\)/,
  "Every finish path must render 100% before showing DONE or awaiting a save");
assert.match(game,/if\(index>=words\.length\)finish\(\);else render\(\)/,
  "Both manual word locks and Accept Phrase use finish()");
assert.equal((game.match(/if\(index>=words\.length\)finish\(\);else render\(\)/g)||[]).length,2,
  "Manual Lock and Accept Phrase both complete through the same finish function");
assert.match(game,/results\.scrollIntoView\?\.\(\{behavior:reduced\?"auto":"smooth",block:"start"\}\)/,
  "Player should not need to scroll to find round results");
assert.match(game,/window\.AutoTypeCompletion\?\.hide\(\)/,
  "Replay clears any old DONE banner");
assert.match(game,/document\.body\.classList\.remove\("mobile-keyboard-active"\)/,
  "Completion exits the fixed keyboard layout");
assert.match(game,/if\(roundFinishing\|\|index<words\.length\)return/,
  "Finishing is guarded against duplicate saves");
assert.match(arcade,/drops === MAX_DROPS\)[\s\S]*?AutoTypeCompletion\?\.show\(\)/,
  "Fifth and final Plinko drop triggers DONE");
assert.match(arcade,/function resetRound\(\)[\s\S]*?AutoTypeCompletion\?\.hide\(\)/);
for(const html of [play,plinko]){
 assert.match(html,/id="roundDoneOverlay"[^>]*role="status"[^>]*aria-live="polite"/,
  "DONE is announced accessibly");
 assert.match(html,/completion-feedback\.css\?v=20261009-round-done-v1/);
 assert.match(html,/completion-feedback\.js\?v=20261009-round-done-v1/);
}
assert.match(css,/roundDoneFade/);
assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
assert.match(css,/animations-off/);
assert.match(css,/pointer-events:none/);
console.log("Round completion PASSED: DONE overlay, manual/phrase finish, full count, result reveal, mobile, Plinko, reduced motion.");