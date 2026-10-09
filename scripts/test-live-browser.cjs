/* Disposable real-browser smoke test of AutoType's publicly deployed beta.
 * Guest-only. No registrations, payment flows, admin changes, or account mutations. */
"use strict";
const {chromium,devices}=require("playwright-core");
const fs=require("node:fs");
const path=require("node:path");
const BASE=process.env.AUTOTYPE_URL||"https://auto-type.net";
const dir=path.resolve("qa-screenshots");
fs.mkdirSync(dir,{recursive:true});
const issues=[],notes=[];
const log=(s)=>{console.log("QA "+s);notes.push(s)};
const problem=(s)=>{console.error("QA ISSUE: "+s);issues.push(s)};
const sleep=n=>new Promise(resolve=>setTimeout(resolve,n));
async function visit(page,route,label,{screenshot=false}={}){
  let response;
  try{
    response=await page.goto(BASE+route,{waitUntil:"domcontentloaded",timeout:30000});
    await page.waitForTimeout(900);
    const details=await page.evaluate(()=>({
      title:document.title,body:document.body?.dataset.page,
      pathname:location.pathname,host:location.host,
      h1:document.querySelector("main h1")?.textContent.trim()||""
    }));
    const status=response?.status()||0;
    if(status>=400||status===0||details.title.includes("Page not found")||details.title.includes("404"))
      problem(label+" "+route+" HTTP "+status+" => "+details.title);
    if(screenshot)await page.screenshot({path:path.join(dir,label+".png"),fullPage:true});
    log(label+" "+route+" HTTP "+status+" => "+details.pathname+" ["+details.title+"]");
    return {status,...details};
  }catch(err){problem(label+" "+route+" LOAD FAILED "+err.message.slice(0,260));return null}
}
function watchErrors(page,label){
  page.on("pageerror",e=>problem(label+" JS exception: "+e.message.slice(0,320)));
  page.on("console",msg=>{
    if(msg.type()==="error")log(label+" console.error: "+msg.text().slice(0,230));
  });
}
async function clickVisibleMenu(page){
  const button=page.locator("#mobileToggle");
  if(await button.count()&&await button.isVisible()){
    await button.click();
    await page.waitForTimeout(220);
    const open=await button.getAttribute("aria-expanded");
    log("mobile menu aria-expanded="+open);
    if(open!=="true")problem("Mobile navigation button did not expand menu");
    await page.screenshot({path:path.join(dir,"mobile-menu.png"),fullPage:false});
    return true;
  }
  problem("No visible mobile menu toggle");
  return false;
}
async function testRound(page,mode){
  const route="/play?mode="+encodeURIComponent(mode);
  const result=await visit(page,route,"round-"+mode,{screenshot:true});
  if(!result)return;
  const isGameVisible=await page.locator("#gameArea").isVisible().catch(()=>false);
  if(!isGameVisible){problem(mode+" game area not visible");return;}
  const targetWords=await page.locator("#target span").allTextContents();
  log(mode+" target length "+targetWords.length+"; starts "+targetWords.slice(0,2).join(" "));
  if(targetWords.length<2||targetWords.length>40){problem(mode+" target absent/invalid");return}
  let totalKeys=0,autoAccepted=0;
  for(let i=0;i<targetWords.length;i++){
    const goal=targetWords[i].trim().toLowerCase();
    let locked=false;
    for(let attempt=0;attempt<100;attempt++){
      const done=await page.locator("#results").isVisible();
      if(done){locked=true;break}
      const counters=(await page.locator("#wordCount").innerText()).trim();
      const m=counters.match(/^(\d+)\s*\/\s*(\d+)/);
      const indicated=m?Number(m[1]):i+1;
      if(indicated>i+1){locked=true;break}
      if(mode==="sentence"&&i>0&&await page.locator("#sentenceAcceptButton").isVisible()){
        const label=(await page.locator("#sentenceAcceptButton").innerText()).trim();
        await page.locator("#sentenceAcceptButton").click();
        autoAccepted++;
        const after=(await page.locator("#wordCount").innerText()).trim();
        log("sentence accepted "+label+" -> "+after);
        const m2=after.match(/^(\d+)\s*\/\s*(\d+)/);
        if(await page.locator("#results").isVisible()||Number(m2?.[1]||0)>i+1){locked=true;break}
      }
      const typed=(await page.locator("#typedPrefix").innerText()).trim();
      const guessed=(await page.locator("#guess").innerText()).trim().toLowerCase();
      if(guessed===goal&&typed!=="_"){
        await page.keyboard.press("Space");
        totalKeys++;
        locked=true;break;
      }
      if(typed==="_"||guessed==="type a letter…"){
        await page.keyboard.press(goal[0]);totalKeys++;continue;
      }
      if(!goal.startsWith(guessed)){
        await page.keyboard.press("Backspace");totalKeys++;continue;
      }
      if(guessed.length<goal.length){
        await page.keyboard.press(goal[guessed.length]);totalKeys++;continue;
      }
      // Unexpected guess/prefix state: record for investigation.
      problem(mode+" stuck on "+(i+1)+"/"+targetWords.length+" word "+goal+" typed="+typed+" guessed="+guessed);
      break;
    }
    if(!locked){problem(mode+" failed to lock word "+(i+1)+"/"+targetWords.length+" "+goal);break}
    if(await page.locator("#results").isVisible())break;
  }
  await page.waitForTimeout(1850);
  const final=await page.evaluate(()=>({
    counter:document.getElementById("wordCount")?.textContent,
    finished:!document.getElementById("results")?.hidden,
    doneWords:document.querySelectorAll("#target .done").length,
    totalWords:document.querySelectorAll("#target span").length,
    progress:document.getElementById("progress")?.style.width,
    result:document.getElementById("resultScore")?.textContent,
    summary:document.getElementById("roundProgressTitle")?.textContent
  }));
  log(mode+" ROUND "+JSON.stringify({final,totalKeys,autoAccepted}));
  await page.screenshot({path:path.join(dir,mode+"-results.png"),fullPage:true});
  if(!final.finished)problem(mode+" round failed to finish");
  if(final.counter!==targetWords.length+" / "+targetWords.length)
    problem(mode+" counter "+final.counter+" should be "+targetWords.length+" / "+targetWords.length);
  if(final.doneWords!==targetWords.length)
    problem(mode+" only "+final.doneWords+" of "+targetWords.length+" target words marked done");
  if(final.progress!=="100%")problem(mode+" progress remains "+final.progress);
}
(async()=>{
 const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox"]});
 try{
  const desktop=await browser.newContext({viewport:{width:1440,height:900},locale:"en-US",colorScheme:"dark"});
  const page=await desktop.newPage();
  watchErrors(page,"desktop");
  const homepage=await visit(page,"/","desktop-home",{screenshot:true});
  if(homepage){
    const urls=await page.locator("a[href]").evaluateAll(nodes=>nodes.map(n=>n.getAttribute("href")).filter(Boolean));
    const internal=urls.filter(x=>x.startsWith("/")&&x.endsWith(".html"));
    if(internal.length)problem("Home page still exposes .html links: "+internal.slice(0,6).join(","));
    log("Home hyperlinks="+urls.length+" extensionless check="+internal.length);
  }
  for(const route of ["/play","/leaderboard","/shop","/friends","/profile","/account","/how-to","/explore","/tournaments","/settings","/notifications","/feedback","/privacy","/contact","/install"]){
    await visit(page,route,"desktop-"+route.slice(1),{screenshot:route==="/play"||route==="/shop"});
  }
  // Guest play should not write competitive account rewards or charge anything.
  for(const mode of ["classic","sentence","context"])await testRound(page,mode);
  const mobile=await browser.newContext({...devices["Pixel 7"],locale:"en-US",colorScheme:"dark"});
  const phone=await mobile.newPage();
  watchErrors(phone,"mobile");
  await visit(phone,"/","mobile-home",{screenshot:true});
  await clickVisibleMenu(phone);
  await visit(phone,"/play","mobile-play",{screenshot:true});
  await visit(phone,"/play?mode=sentence","mobile-sentence",{screenshot:true});
  const input=phone.locator("#mobileTypingInput");
  const start=phone.locator("#mobileStartButton");
  if(await start.isVisible()){
    await start.click();
    await phone.waitForTimeout(300);
    const top=await phone.evaluate(()=>({
      keyboardMode:document.body.classList.contains("mobile-keyboard-active"),
      stage:Math.round(document.getElementById("mobileRoundStage").getBoundingClientRect().height),
      target:Math.round(document.getElementById("target").getBoundingClientRect().height)
    }));
    log("mobile typing activation="+JSON.stringify(top));
    if(!top.keyboardMode)problem("Mobile tap to start failed to activate typing state");
    await phone.screenshot({path:path.join(dir,"mobile-active-keyboard.png"),fullPage:false});
  }else problem("Mobile typing start button missing");
  await mobile.close();
  await desktop.close();
 }finally{await browser.close()}
 console.log("\nLIVE QA SUMMARY: "+issues.length+" issue(s); "+notes.length+" log items");
 for(const issue of issues)console.log("ISSUE: "+issue);
 fs.writeFileSync(path.join(dir,"qa-results.json"),JSON.stringify({timestamp:new Date().toISOString(),issues,notes},null,2));
 if(issues.length)process.exitCode=1;
})().catch(err=>{console.error("QA FATAL: "+err.stack);process.exitCode=1;});
