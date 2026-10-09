"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const all=fs.readdirSync(root).filter(p=>p.endsWith(".html"));
const asset='<link rel="stylesheet" href="site-finish.css?v=20261009-pwa-polish-v2">';
assert.equal(all.length,27,"Unexpected site page count");
for(const p of all){
  const html=read(p);
  const h=html.match(/<head>([\s\S]*?)<\/head>/i);
  assert.ok(h,"No page head on "+p);
  const links=[...h[1].matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(m=>m[0]);
  assert.equal(links.filter(x=>x===asset).length,1,"Each page should include one finish stylesheet: "+p);
  const finishIndex=links.indexOf(asset);
  assert.ok(finishIndex>=1,"Site finish should load after core styles: "+p);
  const progression='<link rel="stylesheet" href="progression-polish.css?v=20261008-progression-v1">';
  const extra=links.filter((x,i)=>i>finishIndex);
  assert.ok(extra.every(x=>x===progression),"Only approved page-specific styles may follow site finish: "+p);
  if(extra.length)assert.equal(extra.length,1,"Progression styles should load exactly once: "+p);
  assert.match(html,/href="(?:index\.html|play\.html|how-to\.html)"/,"Navigation entry missing: "+p);
}
const home=read("index.html");
assert.ok(home.includes("AutoType — Free Online Autocomplete Typing Game"),"Home SEO title must describe the game");
assert.ok(home.includes('href="how-to.html#try-it">Try the tutorial'),"The preview should lead to the original tutorial");
assert.ok(home.includes("PREDICTION PREVIEW"),"Homepage demonstration needs truthful labeling");
assert.ok(!home.includes("LIVE PREDICTOR"),"Demo must not imply a real-time service");
const css=read("site-finish.css");
for(const [label,fragment] of [
  ["brand navigation",".topbar"],["game mode discovery",".home-mode-grid"],
  ["game mode tiles",".mode-tile"],["predictor preview",".home-game-preview"],
  ["footer",".footer"],["accessible focus",":focus-visible"],
  ["user photo backgrounds",".has-photo-bg"],["user light theme",".theme-light"],
  ["reduced-motion support","prefers-reduced-motion:reduce"],
  ["animation preference","animations-off"],["mobile layout","max-width:520px"]
]){
 assert.ok(css.includes(fragment),"Site finish is missing "+label);
}
assert.ok(!css.includes("@import"),"No remote styling dependency should be introduced");
console.log("Site finish passed: 27 page stylesheets, navigation, onboarding link, themes and motion support.");
