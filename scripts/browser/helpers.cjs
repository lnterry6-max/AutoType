const {expect}=require('@playwright/test');
async function isolate(context){
 const blocked=[];
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.protocol==='data:'||u.protocol==='blob:'||u.origin==='http://127.0.0.1:4173'||process.env.AUTOTYPE_BROWSER_STACK==='true'&&u.origin==='http://127.0.0.1:54321')return route.continue();
  blocked.push(u.origin);return route.abort('blockedbyclient');
 });
 return blocked;
}
async function finish(page,mobile=false){
 await expect(page.locator('#target .current')).toBeVisible();
 if(mobile){if(!await page.locator('#mobileTypingInput').evaluate(el=>document.activeElement===el))await page.locator('#mobileStartButton').tap();}else await page.locator('#target').click();
 for(let word=0;word<40;word++){
  if(!await page.locator('#target .current').count())break;
  const target=await page.locator('#target .current').textContent();
  for(let action=0;action<150;action++){
   const guess=await page.locator('#guess').textContent();
   const prefix=await page.locator('#typedPrefix').textContent();
   if(guess===target){await page.waitForTimeout(150);if(mobile)await page.locator('#mobileLockButton').tap();else await page.keyboard.press('Space');break;}
   if(prefix==='_'||guess==='type a letter…'){
    if(mobile)await page.locator('#mobileTypingInput').press(target[0]);else await page.keyboard.press(target[0]);
   }else if(!target.startsWith(guess)){
    if(mobile)await page.locator('#mobileEraseButton').tap();else await page.keyboard.press('Backspace');
   }else{
    if(mobile)await page.locator('#mobileTypingInput').press(target[guess.length]);else await page.keyboard.press(target[guess.length]);
   }
  }
 }
 await expect(page.locator('#guess')).toHaveText('DONE');
 await expect(page.locator('#roundDoneOverlay')).toBeVisible();
 await expect.poll(()=>page.locator('#progress').evaluate(el=>el.style.width)).toBe('100%');
 const count=(await page.locator('#wordCount').textContent()).split('/').map(x=>+x.trim());expect(count[0]).toBe(count[1]);
 await expect(page.locator('#results')).toBeVisible();
}
module.exports={isolate,finish};
