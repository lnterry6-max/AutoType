"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const pages=fs.readdirSync(root).filter(x=>x.endsWith(".html")).sort();
const scripts=fs.readdirSync(root).filter(x=>x.endsWith(".js")).sort();
const styles=fs.readdirSync(root).filter(x=>x.endsWith(".css")).sort();
assert.equal(pages.length,27,"Each expected beta page is present");
const missingNames=[],dupeIds=[],brokenLabels=[],h1Anomalies=[],unlabelledImages=[];
let menuCount=0,coreScripts=0,backendCalls=0,externalWindows=0;
const backend=read("backend.js"),ex=backend.match(/window\.AutoTypeBackend=\{([\s\S]*?)\n\s*\};/);
assert.ok(ex,"Backend must expose its shared API");
const backendExports=new Set(ex[1].split(",").map(x=>x.trim().split(":")[0].trim()).filter(Boolean));
for(const filename of [...pages,...scripts]){
 const s=read(filename);
 for(const m of s.matchAll(/AutoTypeBackend\.([a-zA-Z_]\w*)/g)){
  backendCalls++;
  if(!backendExports.has(m[1]))missingNames.push(filename+" → "+m[1]);
 }
}
assert.deepEqual(missingNames,[],"All frontend method names must exist on AutoTypeBackend");
for(const filename of pages){
 const s=read(filename);
 assert.equal((s.match(/<main\b/g)||[]).length,1,"One main landmark: "+filename);
 assert.equal((s.match(/<\/main>/g)||[]).length,1,"One close main landmark: "+filename);
 assert.match(s,/<html lang="en">/,"Explicit document language: "+filename);
 const headings=(s.match(/<h1\b/g)||[]).length;
 if(headings!==1 && !(filename==="admin.html"&&headings===2&&s.includes('id="adminDenied"')&&s.includes('id="adminConsole"')))h1Anomalies.push(filename+" ("+headings+")");
 const ids=[...s.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 const duplicates=[...new Set(ids.filter((x,i)=>ids.indexOf(x)!==i))];
 if(duplicates.length)dupeIds.push(filename+": "+duplicates.join(", "));
 for(const m of s.matchAll(/<img\b([^>]*)>/g)){
  if(!/\balt=/.test(m[1]))unlabelledImages.push(filename+": "+m[0].slice(0,120));
 }
 for(const m of s.matchAll(/<a\b([^>]*target="_blank"[^>]*)>/g)){
  externalWindows++;
  if(!/rel="[^"]*noopener/.test(m[1]))brokenLabels.push(filename+": unsafe new tab");
 }
 if(!["404.html","backend-test.html"].includes(filename)){
  const account=s.match(/<button\b([^>]*id="accountMenuButton"[^>]*)><\/button>/);
  if(!account)brokenLabels.push(filename+": missing account button");
  else{
   menuCount++;
   for(const bit of ['type="button"','aria-label="Account menu"','aria-controls="accountDropdown"','aria-expanded="false"']){
    if(!account[1].includes(bit))brokenLabels.push(filename+": account control missing "+bit);
   }
   if(!s.includes('id="accountDropdown"'))brokenLabels.push(filename+": missing controlled dropdown");
  }
  const match=[...s.matchAll(/<script src="core\.js\?v=([^"]+)"/g)];
  coreScripts+=match.length;
  if(match.length!==1||match[0][1]!=="20261009-accessibility-v1")brokenLabels.push(filename+": stale or missing core.js dependency");
 }
}
assert.deepEqual(h1Anomalies,[],"Every page has a sensible primary heading");
assert.deepEqual(dupeIds,[],"No duplicate DOM IDs");
assert.deepEqual(unlabelledImages,[],"Images need explicit alt, including decorative images");
assert.deepEqual(brokenLabels,[],"Accessible shared menu, correct script dependency and safe external links");
assert.equal(menuCount,25,"Shared account menu on all standard pages");
assert.equal(coreScripts,25,"Consistent shared menu script on all standard pages");
const core=read("core.js");
assert.match(core,/const setAccountMenuOpen=open=>/,"Reusable account-menu state");
assert.match(core,/accountBtn\.setAttribute\("aria-expanded",String\(open\)\)/,"Expose expanded menu state");
assert.match(core,/if\(e\.key!=="Escape"\|\|!dropdown/,"Escape closes the account dropdown");
assert.match(core,/accountBtn\?\.focus\(\{preventScroll:true\}\)/,"Restore keyboard focus when closing");
assert.match(core,/\$\{escapeHTML\(a\.avatarImage\)\}/,"Escape user-supplied avatar-image URL in HTML attribute");
const admin=read("admin.html");
assert.match(admin,/id="playerSearch"[^>]*aria-label="Search players by username"/);
assert.match(admin,/data-staff-role aria-label="Permission level for \$\{AutoType\.escapeHTML\(a\.username\)\}"/);
assert.match(admin,/data-role-badge aria-label="Display badge for \$\{AutoType\.escapeHTML\(a\.username\)\}"/);
// Balancing braces catches CSS editing accidents that JS syntax checks cannot detect.
for(const file of styles){
 const s=read(file);let depth=0,quote=null,comment=false;
 for(let i=0;i<s.length;i++){
  const ch=s[i],next=s[i+1];
  if(comment){if(ch==="*"&&next==="/"){comment=false;i++}continue}
  if(quote){if(ch==="\\"){i++;continue}if(ch===quote)quote=null;continue}
  if(ch==="/"&&next==="*"){comment=true;i++;continue}
  if(ch==="'"||ch==='"'){quote=ch;continue}
  if(ch==="{")depth++;
  if(ch==="}"){depth--;assert.ok(depth>=0,"Unexpected closing brace in "+file+" at "+i)}
 }
 assert.equal(depth,0,"Unclosed CSS block in "+file);
 assert.ok(!comment&&!quote,"Unclosed CSS comment or string in "+file);
}
console.log("Release integrity PASSED: "+pages.length+" page landmarks, "+menuCount+" accessible menus, "+backendCalls+" backend calls, "+styles.length+" balanced stylesheets and safe avatar attributes.");