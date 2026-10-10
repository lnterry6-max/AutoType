const {test,expect}=require('@playwright/test'),{randomUUID}=require('node:crypto');
const {isolate,finish}=require('./helpers.cjs');
const enabled=process.env.AUTOTYPE_BROWSER_STACK==='true';
let runtime,db,users=[];
test.describe('real disposable Auth and gameplay browser integration',()=>{
 test.skip(!enabled,'Requires the isolated GitHub Actions PostgreSQL 17 stack');
 test.beforeAll(async()=>{
  runtime=require('../fullstack/runtime.cjs');db=await runtime.database();
  for(let i=0;i<3;i++){
   const username='browser_'+randomUUID().replaceAll('-','').slice(0,12),email=username+'@example.invalid',password=randomUUID()+'!Aa1';
   const {data,error}=await runtime.admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username}});expect(error).toBeNull();users.push({id:data.user.id,username,email,password});
  }
  await db.query("update user_roles set role='developer' where user_id=$1",[users[2].id]);
 });
 test.afterAll(async()=>{await db?.end()});
 async function login(page,user){
  await isolate(page.context());await page.goto('/account');await page.locator('#loginIdentity').fill(user.email);await page.locator('#loginPassword').fill(user.password);await page.locator('#loginButton').click();
  await expect.poll(()=>page.evaluate(()=>window.AutoType?.currentAccount()?.supabaseUserId)).toBe(user.id);
 }
 test('actual login, verified five modes, practice Custom, profile wallet leaderboard and logout',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await login(page,users[0]);
  for(const mode of ['classic','context','sentence','evil','daily']){
   await page.goto('/play?mode='+mode);await finish(page);
   await expect(page.locator('#verifiedResult')).toHaveAttribute('data-outcome','verified');
   await expect(page.locator('#resultCoins')).toHaveText(/^\+\d+$/);await expect(page.locator('#roundXpGain')).toContainText('XP');
  }
  const before=(await db.query('select rounds from player_stats where user_id=$1',[users[0].id])).rows[0].rounds;
  await page.goto('/play?mode=custom&sentence=hello%20world');await finish(page);await expect(page.locator('#resultCoins')).toHaveText('Practice only');expect((await db.query('select rounds from player_stats where user_id=$1',[users[0].id])).rows[0].rounds).toBe(before);
  await page.goto('/profile');await expect(page.locator('main')).toContainText(users[0].username);
  const wallet=await page.evaluate(()=>AutoType.currentAccount().wallet.coins);expect(wallet).toBe((await db.query('select coins from wallets where user_id=$1',[users[0].id])).rows[0].coins);
  await page.goto('/leaderboard');await expect(page.locator('main')).toContainText(users[0].username);
  await page.evaluate(()=>AutoTypeBackend.signOut());await page.reload();await expect.poll(()=>page.evaluate(()=>AutoType.currentAccount())).toBeNull();expect(errors).toEqual([]);
 });
 test('two browser accounts match, finish, duplicate receipt and reconnect without reward',async({browser})=>{
  const ca=await browser.newContext(),cb=await browser.newContext();const a=await ca.newPage(),b=await cb.newPage();
  try{
   await login(a,users[0]);await login(b,users[1]);await a.goto('/play');await b.goto('/play');
   await a.locator('#quickMatchButton').click();await b.locator('#quickMatchButton').click();
   await expect(a).toHaveURL(/race=/,{timeout:20000});await expect(b).toHaveURL(/race=/,{timeout:20000});
   const raceId=new URL(a.url()).searchParams.get('race');expect(new URL(b.url()).searchParams.get('race')).toBe(raceId);
   await finish(a);await finish(b);
   const saved=(await db.query('select score,duration_ms,errors,erased from race_players where race_id=$1 and user_id=$2',[raceId,users[0].id])).rows[0];
   const duplicate=await a.evaluate(async({raceId,saved})=>AutoTypeBackend.submitRaceResult(raceId,{score:saved.score,durationMs:saved.duration_ms,errors:saved.errors,erased:saved.erased}),{raceId,saved});expect(duplicate.duplicate).toBe(true);
   await ca.setOffline(true);await ca.setOffline(false);await a.reload();await expect(a.locator('#results')).toBeVisible();await expect(a.locator('#mobileGameControls')).toBeHidden();
  }finally{await ca.close();await cb.close()}
 });
 test('friend race and tournament registration/reset reject stale browser completion',async({page,browser})=>{
  await login(page,users[1]);const staffContext=await browser.newContext(),staff=await staffContext.newPage();
  try{
   await login(staff,users[2]);await page.evaluate(username=>AutoTypeBackend.sendFriendRequest(username),users[0].username);
   const request=(await db.query('select id from friend_requests where sender_id=$1 and receiver_id=$2',[users[1].id,users[0].id])).rows[0];
   await db.query("select public.autotype_respond_friend_request($1,$2,true)",[users[0].id,request.id]);
   const race=await page.evaluate(friendId=>AutoTypeBackend.createRace(friendId),users[0].id);await page.goto('/play?race='+race.id);await finish(page);await expect(page.locator('#resultCoins')).toHaveText('Practice only');
   await staff.evaluate(()=>AutoTypeBackend.adminRestoreTournaments());await page.goto('/tournaments');await page.locator('[data-online-join]').first().click();await expect(page.locator('#registrationList')).not.toContainText('No registrations');
   const entry=(await db.query('select tournament_id from tournament_entries where user_id=$1 order by joined_at desc limit 1',[users[1].id])).rows[0];
   await staff.evaluate(id=>AutoTypeBackend.adminUpsertTournament({tournamentId:id,status:'running',name:'Browser fixture'}),entry.tournament_id);
   await page.goto('/play?tournament='+entry.tournament_id);await expect(page.locator('#target .current')).toBeVisible();await staff.evaluate(()=>AutoTypeBackend.adminRestoreTournaments());
   await finish(page);await expect(page.locator('#resultCoins')).toHaveText('Save failed');await expect(page.locator('#results')).toContainText('Check tournament registration');
  }finally{await staffContext.close()}
 });
});
