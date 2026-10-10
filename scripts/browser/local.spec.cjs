const {test,expect,devices}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path');
const AxeBuilder=require('@axe-core/playwright').default;
const {isolate,finish}=require('./helpers.cjs');
const root=path.resolve(__dirname,'../..');
test.beforeEach(async({context})=>{await isolate(context)});
test('27 pages: real scripts, clean URLs, refresh, console and asset failures',async({page})=>{
 const errors=[],failures=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('requestfailed',r=>{if(r.failure()?.errorText!=='net::ERR_ABORTED')failures.push(r.failure()?.errorText+' '+new URL(r.url()).pathname)});page.on('response',r=>{if(r.status()>=400)failures.push(r.status()+' '+new URL(r.url()).pathname)});
 for(const file of fs.readdirSync(root).filter(x=>x.endsWith('.html'))){
  const route=file==='index.html'?'/':file==='404.html'?'/404.html':'/'+file.replace('.html','');
  await page.goto(route);await page.waitForTimeout(80);await expect(page.locator('main')).toHaveCount(1);
  if(file!=='404.html')expect(new URL(page.url()).pathname).toBe(route);
  await page.reload();
 }
 expect(errors).toEqual([]);expect(failures).toEqual([]);
});
for(const mode of ['classic','context','sentence','evil','daily','custom'])test('guest '+mode+' completes final word and progress once',async({page})=>{
 await page.goto('/play?mode='+mode+(mode==='custom'?'&sentence=hello%20world':''));
 await finish(page);await expect(page.locator('#resultCoins')).toHaveText('Sign in');
 await page.keyboard.press('Space');await expect(page.locator('#guess')).toHaveText('DONE');await expect(page.locator('#roundDoneOverlay')).toBeHidden({timeout:3000});
});
test('navigation and mode links, account menu keyboard focus and axe serious findings',async({page})=>{
 await page.goto('/account');await expect(page.locator('#loginPanel').getByLabel('Email',{exact:true}).filter({visible:true})).toHaveAttribute('id','loginIdentity');await page.locator('#loginPanel').getByLabel('Password',{exact:true}).click();await expect(page.locator('#loginPassword')).toBeFocused();
 await page.goto('/');await page.getByRole('link',{name:'Play',exact:true}).first().click();await expect(page).toHaveURL(/\/play$/);
 const modes=await page.locator('.mode-tile').evaluateAll(xs=>xs.map(x=>x.getAttribute('href')));expect(modes.length).toBe(6);
 await page.locator('#accountMenuButton').click();await expect(page.locator('#accountMenuButton')).toHaveAttribute('aria-expanded','true');
 await page.keyboard.press('Escape');await expect(page.locator('#accountMenuButton')).toHaveAttribute('aria-expanded','false');
 await page.goto('/');await page.evaluate(()=>AutoType.patchCurrentSettings({backgroundColor:'#ffffff'}));await expect(page.locator('body')).toHaveClass(/theme-light/);const preview=await new AxeBuilder({page}).include('.home-game-preview').withTags(['wcag2a','wcag2aa']).analyze();expect(preview.violations.filter(v=>['serious','critical'].includes(v.impact))).toEqual([]);await page.evaluate(()=>AutoType.patchCurrentSettings({backgroundColor:'#1f2328'}));
 const findings=[];for(const route of ['/','/play','/account']){await page.goto(route);if(route==='/account')await expect(page.locator('.toast')).toHaveCSS('opacity','1');const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();findings.push(...result.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({route,id:v.id,nodes:v.nodes.map(n=>({target:n.target,reason:n.failureSummary}))})))}expect(findings).toEqual([]);
});
test('PWA worker activates, replaces legacy cache, clean deep link and manifest',async({page})=>{
 await page.goto('/play.html?mode=custom&sentence=hello#game');await expect(page).toHaveURL(/\/play\?mode=custom&sentence=hello#game$/);
 await page.evaluate(async()=>{await caches.open('autotype-offline-old');const registration=await navigator.serviceWorker.register('/service-worker.js?fixture='+Date.now());await navigator.serviceWorker.ready;await registration.update()});
 await expect.poll(()=>page.evaluate(()=>caches.keys())).not.toContain('autotype-offline-old');
 await page.reload();await expect(page.locator('#target')).toContainText('hello');
 const manifest=await page.evaluate(async()=>fetch('/manifest.webmanifest').then(r=>r.json()));expect(manifest.start_url).toBe('/');expect(manifest.shortcuts[0].url).toBe('/play');
});
test.describe('touch viewport emulation (not native iOS)',()=>{
 const {defaultBrowserType,...phone}=devices['iPhone 13'];test.use(phone);
 test('keyboard focus, touch lock, resize, mobile drawer and installation visibility',async({page})=>{
  await page.goto('/play?mode=custom&sentence=hello%20world');await expect(page.locator('html')).toHaveClass(/pwa-mobile-browser/);
  await page.locator('#mobileStartButton').tap();await expect(page.locator('#mobileTypingInput')).toBeFocused();
  await page.setViewportSize({width:390,height:420});await expect(page.locator('body')).toHaveClass(/mobile-keyboard-active/);
  await finish(page,true);await expect(page.locator('#mobileGameControls')).toBeHidden();
  await page.goto('/');await page.locator('#mobileToggle').tap();await expect(page.locator('#mobileToggle')).toHaveAttribute('aria-expanded','true');await page.keyboard.press('Escape');await expect(page.locator('#mobileToggle')).toHaveAttribute('aria-expanded','false');
 });
});
