const {test,expect}=require('@playwright/test'),{randomUUID}=require('node:crypto');
const {isolate,finish}=require('./helpers.cjs');
const enabled=process.env.AUTOTYPE_BROWSER_STACK==='true';
let runtime,db,users=[];
test.describe('real disposable Auth and gameplay browser integration',()=>{
 test.skip(!enabled,'Requires the isolated GitHub Actions PostgreSQL 17 stack');
 test.beforeEach(async({page})=>{page.on('console',m=>{if(m.type()==='error')console.log('Synthetic browser error:',m.text())});page.on('response',async r=>{if(r.status()>=400&&r.url().includes('/functions/v1/')){const body=await r.json().catch(()=>({}));console.log('Synthetic gateway rejection:',r.status(),body.error||'unknown')}})});
 test.beforeAll(async()=>{
  runtime=require('../fullstack/runtime.cjs');db=await runtime.database();
  for(let i=0;i<5;i++){
   const username='browser_'+randomUUID().replaceAll('-','').slice(0,12),email=username+'@example.invalid',password=randomUUID()+'!Aa1';
   const {data,error}=await runtime.admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username}});expect(error).toBeNull();users.push({id:data.user.id,username,email,password});
  }
  await db.query("update user_roles set role='developer' where user_id=$1",[users[2].id]);
 });
 test.afterAll(async()=>{await db?.end()});
 async function login(page,user){
  await isolate(page.context());await page.goto('/account');await page.locator('#loginIdentity').fill(user.email);await page.locator('#loginPassword').fill(user.password);await page.locator('#loginButton').click();await page.waitForURL('http://127.0.0.1:4173/',{waitUntil:'load'});
  await expect.poll(()=>page.evaluate(()=>window.AutoType?.currentAccount()?.supabaseUserId)).toBe(user.id);
 }
 async function emailLink(email,subject){
  let found;
  await expect.poll(async()=>{
   const list=await fetch('http://127.0.0.1:54324/api/v1/messages').then(r=>r.json());
   found=list.messages.find(m=>m.To.some(a=>a.Address===email)&&m.Subject.includes(subject));return !!found;
  },{timeout:15000}).toBe(true);
  const message=await fetch('http://127.0.0.1:54324/api/v1/message/'+found.ID).then(r=>r.json());
  const links=[...message.HTML.matchAll(/href="([^"]+)"/g)].map(m=>m[1].replaceAll('&amp;','&'));
  const link=links.find(l=>l.includes('/auth/v1/verify'));expect(new URL(link).origin).toBe(runtime.url);return link;
 }
 test('real UI signup confirmation and email recovery with local Mailpit only',async({page})=>{
  await isolate(page.context());const username='signup_'+randomUUID().replaceAll('-','').slice(0,12),email=username+'@example.invalid',password=randomUUID()+'!Aa1';
  await page.goto('/account');await page.evaluate(()=>AutoType.ready());await page.locator('[data-tab="create"]').click();
  await page.locator('#createUsername').fill(username);await page.locator('#createEmail').fill(email);await page.locator('#createPassword').fill(password);await page.locator('#createPasswordConfirm').fill(password);await page.locator('#createButton').click();
  await expect(page.locator('.toast')).toContainText('Check your email');
  await page.goto(await emailLink(email,'Confirm'));await page.waitForURL('http://127.0.0.1:4173/how-to#try-it',{waitUntil:'load'});await expect.poll(()=>page.evaluate(()=>window.AutoType?.currentAccount()?.username)).toBe(username);
  await page.evaluate(()=>AutoTypeBackend.signOut());await page.goto('/account');await page.locator('#forgotPasswordButton').click();await page.locator('#resetEmail').fill(email);await page.locator('#sendResetButton').click();
  await expect(page.locator('.toast')).toContainText('Recovery email sent');
  let releaseQuestion;const questionGate=new Promise(resolve=>releaseQuestion=resolve);await page.route('**/rest/v1/security_questions*',async route=>{await questionGate;await route.continue()});
  await page.goto(await emailLink(email,'Reset'));await expect(page.locator('#recoveryPanel')).toBeVisible();await expect(page.locator('#finishRecoveryButton')).toBeDisabled();releaseQuestion();await expect(page.locator('#finishRecoveryButton')).toBeEnabled();await page.unroute('**/rest/v1/security_questions*');
  const replacement=randomUUID()+'!Aa1';await page.locator('#recoveryPassword').fill(replacement);await page.locator('#recoveryPasswordConfirm').fill(replacement);await page.locator('#finishRecoveryButton').click();
  await expect(page.locator('#loginPanel')).toBeVisible({timeout:10000});await page.locator('#loginIdentity').fill(email);await page.locator('#loginPassword').fill(replacement);await page.locator('#loginButton').click();await page.waitForURL('http://127.0.0.1:4173/',{waitUntil:'load'});await expect.poll(()=>page.evaluate(()=>window.AutoType?.currentAccount()?.username)).toBe(username);
  await page.evaluate(()=>AutoTypeBackend.signOut());await page.goto('/account?reset=1');await expect(page.locator('#recoveryHelp')).toContainText('invalid or expired');await expect(page.locator('#finishRecoveryButton')).toBeDisabled();
 });
 test('actual login, verified five modes, practice Custom, profile wallet leaderboard and logout',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});await login(page,users[0]);
  for(const mode of ['classic','context','sentence','evil','daily']){
   await page.goto('/play?mode='+mode);await finish(page);
   await expect(page.locator('#verifiedResult')).toHaveAttribute('data-outcome','verified');
   await expect(page.locator('#resultCoins')).toHaveText(/^\+\d+$/);await expect(page.locator('#roundXpGain')).toContainText('XP');
  }
  const before=(await db.query('select rounds from player_stats where user_id=$1',[users[0].id])).rows[0].rounds;
  await page.goto('/play?mode=custom&sentence=hello%20world');await finish(page);await expect(page.locator('#resultCoins')).toHaveText('Practice only');expect((await db.query('select rounds from player_stats where user_id=$1',[users[0].id])).rows[0].rounds).toBe(before);
  await page.goto('/profile');await expect(page.locator('main')).toContainText(users[0].username);const earned=await page.evaluate(()=>AutoType.unlockedAchievements().map(a=>a.name));await expect(page.locator('#achievementText')).toContainText(earned.length+' / ');await expect(page.locator('#achievementBadges .badge')).toHaveCount(earned.length);for(const name of earned)await expect(page.locator('#achievementBadges').getByRole('img',{name,exact:true})).toBeVisible();
  const wallet=await page.evaluate(()=>AutoType.currentAccount().wallet.coins);expect(wallet).toBe(Number((await db.query('select coins from wallets where user_id=$1',[users[0].id])).rows[0].coins));
  await page.goto('/leaderboard');await expect(page.locator('main')).toContainText(users[0].username);
  await page.evaluate(()=>AutoTypeBackend.signOut());await page.reload();await expect.poll(()=>page.evaluate(()=>AutoType.currentAccount())).toBeNull();expect(errors).toEqual([]);
 });
 test('two browser accounts match, finish, duplicate receipt and reconnect without reward',async({browser})=>{
  const ca=await browser.newContext(),cb=await browser.newContext();const a=await ca.newPage(),b=await cb.newPage();
  try{
   await login(a,users[3]);await login(b,users[4]);await a.goto('/play');await b.goto('/play');await a.evaluate(()=>AutoType.ready());await b.evaluate(()=>AutoType.ready());
   await a.locator('#quickMatchButton').click();await b.locator('#quickMatchButton').click();
   await expect(a).toHaveURL(/race=/,{timeout:20000});await expect(b).toHaveURL(/race=/,{timeout:20000});
   const raceId=new URL(a.url()).searchParams.get('race');expect(new URL(b.url()).searchParams.get('race')).toBe(raceId);
   let loseResponse=true;
   await a.route('**/functions/v1/game-api',async route=>{
    const request=route.request();const body=request.method()==='POST'?request.postDataJSON():null;
    if(loseResponse&&body?.action==='submit_race_result'){loseResponse=false;const response=await route.fetch();expect(response.ok()).toBe(true);return route.abort('failed')}
    return route.continue();
   });
   await finish(a);await expect(a.locator('#resultCoins')).toHaveText('Save failed');await finish(b);
   await a.getByRole('button',{name:'Retry race save'}).click();await expect(a.getByRole('button',{name:'Retry race save'})).toBeHidden();await expect(a.locator('#resultCoins')).toHaveText('Practice only');
   const saved=(await db.query('select score,duration_ms,errors,erased from race_players where race_id=$1 and user_id=$2',[raceId,users[3].id])).rows[0];
   const duplicate=await a.evaluate(async({raceId,saved})=>AutoTypeBackend.submitRaceResult(raceId,{score:Number(saved.score),durationMs:saved.duration_ms,errors:saved.errors,erased:saved.erased}),{raceId,saved});expect(duplicate.duplicate).toBe(true);
   await ca.setOffline(true);expect(await a.evaluate(()=>fetch('/manifest.webmanifest').then(()=>false).catch(()=>true))).toBe(true);await ca.setOffline(false);await a.reload();await expect(a.locator('#results')).toBeVisible();await expect(a.locator('#mobileGameControls')).toBeHidden();
  }finally{await ca.close();await cb.close()}
 });
 test('friend race and tournament registration/reset reject stale browser completion',async({page,browser})=>{
  await login(page,users[1]);const staffContext=await browser.newContext(),staff=await staffContext.newPage();
  try{
   await login(staff,users[2]);await page.evaluate(username=>AutoTypeBackend.sendFriendRequest(username),users[0].username);
   const request=(await db.query('select id from friend_requests where sender_id=$1 and receiver_id=$2',[users[1].id,users[0].id])).rows[0];
   await db.query("select public.autotype_respond_friend_request($1,$2,true)",[users[0].id,request.id]);
   const race=await page.evaluate(friendId=>AutoTypeBackend.createRace(friendId),users[0].id);await page.goto('/play?race='+race.id);await finish(page);await expect(page.locator('#resultCoins')).toHaveText('Practice only');
   await staff.evaluate(()=>AutoTypeBackend.adminRestoreTournaments());await page.goto('/tournaments');await page.locator('[data-online-join]').first().click();await expect(page.locator('.tournament-card.registered')).toHaveCount(1);
   const entry=(await db.query('select tournament_id from tournament_entries where user_id=$1 order by joined_at desc limit 1',[users[1].id])).rows[0];
   await staff.evaluate(id=>AutoTypeBackend.adminUpsertTournament({tournamentId:id,status:'running',name:'Browser fixture'}),entry.tournament_id);
   await page.goto('/play?tournament='+entry.tournament_id);await finish(page);await expect(page.locator('#verifiedResult')).toHaveAttribute('data-outcome','verified');
   const result=(await db.query('select status,score from tournament_entries where tournament_id=$1 and user_id=$2',[entry.tournament_id,users[1].id])).rows[0];expect(result.status).toBe('finished');expect(Number(result.score)).toBeGreaterThan(0);
   await page.goto('/tournaments');await expect(page.locator('#registrationList')).toContainText('Score '+Number(result.score).toLocaleString());await expect(page.locator('.tournament-standings')).toContainText(users[1].username);
   await staff.evaluate(()=>AutoTypeBackend.adminRestoreTournaments());await page.reload();await page.locator('[data-online-join]').first().click();await expect(page.locator('.tournament-card.registered')).toHaveCount(1);
   await staff.evaluate(id=>AutoTypeBackend.adminUpsertTournament({tournamentId:id,status:'running',name:'Browser fixture reset'}),entry.tournament_id);
   await page.goto('/play?tournament='+entry.tournament_id);await expect(page.locator('#target .current')).toBeVisible();await staff.evaluate(()=>AutoTypeBackend.adminRestoreTournaments());
   await finish(page);await expect(page.locator('#resultCoins')).toHaveText('Save failed');await expect(page.locator('#results')).toContainText('Check tournament registration');
  }finally{await staffContext.close()}
 });
});
