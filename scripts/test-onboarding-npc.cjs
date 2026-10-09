"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");
const account = read("account.html");
const howto = read("how-to.html");
const play = read("play.html");
const game = read("game.js");
const css = read("onboarding-races.css");
const script = read("how-to-tutorial.js");

assert.match(account, /location\.href="how-to\.html#try-it"/);
assert.equal((account.match(/location\.href="how-to\.html#try-it"/g) || []).length, 2, "Both login and registration must link to How to Play");
assert.match(howto, /id="guidedTutorial"/); // Intentional: catch a wrongly named wrapper.
assert.match(howto, /id="tutorialStage"/);
assert.match(howto, /how-to-tutorial\.js/);
assert.doesNotMatch(play, /how-to-tutorial\.js/, "Tutorial must be exclusive to How to Play");
assert.match(play, /NPC_OFFER_AFTER_MS=20000/);
for (const skill of ["easy", "medium", "hard"]) {
  assert.match(play, new RegExp('data-npc-skill="' + skill + '"'));
}
assert.match(game, /if\(mode==="npc"\)\{predictorMode="classic";fixed=true\}/);
assert.match(game, /if\(activeAccount\?\.online&&!npc\)/);
assert.match(game, /else if\(!npc\)/);
assert.match(game, /if\(!activeAccount\?\.online&&!npc\)AutoTypeDailyMix\.recordGuestRound/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.doesNotMatch(script, /AutoTypeBackend|addCoins|recordRound/, "Tutorial may not change saved progression");

// Exercise the actual lesson state machine in a tiny DOM instead of only reading strings.
class FakeElement {
  constructor() {
    this.listeners = {};
    this.classList = {add(){}, remove(){}, toggle(){}, contains(){return false;}};
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.textContent = "";
    this.innerHTML = "";
    this.offsetWidth = 100;
  }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  click() { this.listeners.click?.(); }
  focus() {}
  blur() {}
}
const ids = ["guidedTutorial", "tutorialLaunch", "tutorialStage", "tutorialGuess",
  "tutorialMessage", "tutorialInput", "tutorialType", "tutorialErase",
  "tutorialLock", "tutorialRestart", "tutorialCount", "tutorialBar", "tutorialOutcome"];
const nodes = Object.fromEntries(ids.map(id => [id, new FakeElement()]));
const sandbox = {
  document: {getElementById: id => nodes[id] || null, body: {classList: {contains: () => false}}},
  window: {matchMedia: () => ({matches: true})},
};
vm.runInNewContext(script, sandbox, {filename: "how-to-tutorial.js"});
nodes.tutorialLaunch.click();
assert.equal(nodes.tutorialCount.textContent, "Step 1 of 5");
nodes.tutorialType.click();
assert.match(nodes.tutorialGuess.innerHTML, /mild/); // markup splits the word across spans
nodes.tutorialErase.click();
nodes.tutorialErase.click();
assert.equal(nodes.tutorialCount.textContent, "Step 3 of 5");
nodes.tutorialType.click();
nodes.tutorialType.click();
assert.equal(nodes.tutorialGuess.innerHTML.includes("minutes"), true);
nodes.tutorialLock.click();
assert.equal(nodes.tutorialCount.textContent, "Complete");
assert.equal(nodes.tutorialOutcome.hidden, false);
nodes.tutorialRestart.click();
assert.equal(nodes.tutorialCount.textContent, "Step 1 of 5");
console.log("Onboarding and NPC routing regression passed.");
