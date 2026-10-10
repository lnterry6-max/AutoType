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

const backend = read("backend.js");
assert.ok(backend.includes("autotype_onboarding_pending:true"), "New signups must have first-login metadata");
assert.ok(backend.includes("auth.updateUser({data:{autotype_onboarding_pending:false}})"), "First login must clear server metadata");
assert.equal(account.split("AutoTypeBackend.postSignInDestination(").length-1,3, "Login, immediate signup, and existing session each need routing");
assert.ok(account.includes("postSignInDestination(login.user)"));
assert.ok(account.includes("postSignInDestination(data.user)"));
assert.ok(account.includes("backend.js?v=20261008-first-login-v1"), "Auth page must load fresh onboarding logic");
assert.match(howto, /id="try-it"/);
assert.match(howto, /id="tutorialStage"/);
assert.match(howto, /how-to-tutorial\.js/);
assert.doesNotMatch(play, /how-to-tutorial\.js/, "Tutorial must be exclusive to How to Play");
assert.match(play, /NPC_OFFER_AFTER_MS=20000/);
for (const skill of ["easy", "medium", "hard"]) {
  assert.match(play, new RegExp('data-npc-skill="' + skill + '"'));
}
assert.match(game, /if\(mode==="npc"\)\{predictorMode="classic";fixed=true\}/);
assert.match(game, /const accountPractice=!!npc\|\|!!AutoType\.currentAccount\(\)\?\.online&&\["custom","race"\]\.includes\(mode\)/);
assert.match(game, /if\(activeAccount\?\.online&&!accountPractice\)/);
assert.match(game, /else if\(!npc&&!activeAccount\?\.online\)/);
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
const ids = ["try-it", "tutorialLaunch", "tutorialStage", "tutorialGuess",
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
assert.equal(nodes.tutorialGuess.innerHTML.replace(/<[^>]+>/g, ""), "mild");
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

/* Exercise the actual first-login function against mocked Supabase Auth metadata. */
(async()=>{
  const start=backend.indexOf("  async function postSignInDestination(");
  const end=backend.indexOf("\n  async function signOut()",start);
  assert.ok(start>=0&&end>start, "Expected isolated destination helper");
  const newUser={user_metadata:{autotype_onboarding_pending:true}};
  const oldUser={user_metadata:{username:"existing"}};
  let currentUser=newUser, writes=0;
  const sandbox={
    user:async()=>currentUser,
    getClient:()=>({auth:{updateUser:async({data})=>{
      writes++;
      Object.assign(currentUser.user_metadata,data);
      return {error:null};
    }}}),
    console:{warn:()=>{}}
  };
  vm.runInNewContext(backend.slice(start,end)+"\nthis.route=postSignInDestination;",sandbox);
  assert.equal(await sandbox.route(oldUser),"index.html","Existing users should go Home");
  assert.equal(writes,0,"Existing users should not update Auth");
  assert.equal(await sandbox.route(),"how-to.html#try-it","New users should see How to Play");
  assert.equal(writes,1);
  assert.equal(currentUser.user_metadata.autotype_onboarding_pending,false);
  assert.equal(await sandbox.route(),"index.html","Second login should go Home");
  assert.equal(writes,1,"Returning login must not write metadata again");
  console.log("First-login-only auth routing regression passed.");
})().catch(error=>{console.error(error);process.exitCode=1});
