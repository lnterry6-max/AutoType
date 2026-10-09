"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const url="https://auto-type.net";
const links=[
  {href:url+"/play.html?mode=sentence#round"},
  {href:url+"/index.html"},
  {href:url+"/install.html"},
  {href:"https://example.com/outside.html"},
  {href:url+"/404.html"}
];
const events={};
const classList={add(){},toggle(){}};
const current={href:url+"/play.html?mode=sentence#round",origin:url,pathname:"/play.html"};
let newLocation=null;
const document={
  readyState:"loading",
  documentElement:{classList},
  body:{dataset:{page:"admin"},classList},
  querySelector:()=>null,
  querySelectorAll:()=>links,
  getElementById:()=>null,
  addEventListener:(type,callback)=>{events[type]=callback;}
};
const window={
  matchMedia:()=>({matches:false}),
  addEventListener:(type,callback)=>{events[type]=callback;},
  history:{state:null,replaceState:(_state,_title,path)=>{newLocation=path;}},
  isSecureContext:false
};
const navigator={userAgent:"Desktop Safari",standalone:false,maxTouchPoints:0};
vm.runInNewContext(read("pwa.js"),{window,document,navigator,location:current,URL,console});
assert.equal(typeof events.DOMContentLoaded,"function");
events.DOMContentLoaded();
assert.equal(newLocation,"/play?mode=sentence#round","Address bar preserves mode and fragment");
assert.equal(links[0].href,"/play?mode=sentence#round","Play link is extensionless");
assert.equal(links[1].href,"/","Index maps to site root");
assert.equal(links[2].href,"/install","Install link becomes clean");
assert.equal(links[3].href,"https://example.com/outside.html","External link untouched");
assert.equal(links[4].href,url+"/404.html","404 special page untouched");
const dynamic={href:url+"/friends.html?tab=requests"};
events.click({target:{closest:()=>dynamic}});
assert.equal(dynamic.href,"/friends?tab=requests","Newly generated links cleaned when clicked");
const css=read("site-finish.css");
assert.match(css,/\.footer-links a\[href="install"\]\{display:none!important\}/,
  "Desktop CSS hides normalized install link");
assert.match(css,/html\.pwa-mobile-browser body:not\(\.pwa-standalone\) \.footer-links a\[href="install"\]/,
  "Mobile browser can show normalized install link");
assert.match(css,/html\.pwa-installed \.footer-links a\[href="install"\]/,
  "Installed mode hides normalized install link");
const manifest=JSON.parse(read("manifest.webmanifest"));
assert.ok(manifest.shortcuts.every(item=>!item.url.includes(".html")));
const sitemap=read("sitemap.xml");
assert.doesNotMatch(sitemap,/\.html<\/loc>/,"Sitemap must use canonical extensionless URLs");
console.log("Clean page URLs PASSED: navigation, live address, query/hash, installer, PWA and SEO.");
