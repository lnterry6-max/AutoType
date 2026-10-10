'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{randomUUID,createHmac,createPrivateKey,sign:cryptoSign,verify:cryptoVerify}=require('node:crypto');
const {status,url,dir,admin,client,database}=require('./fullstack/runtime.cjs');
const root=path.resolve(__dirname,'..');let db,A,B,C,staff;const clients=[];
async function account(developer=false){
 const username='fixture_'+randomUUID().replaceAll('-','').slice(0,12),password=randomUUID()+'!aA1';
 const email=username+'@example.invalid';
 const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username,display_name:username,role:'developer'}});
 assert.equal(error,null,'Real Auth user creation: '+error?.message);
 if(developer)await db.query("update user_roles set role='developer' where user_id=$1",[data.user.id]);
 const auth=client();clients.push(auth);
 const login=await auth.auth.signInWithPassword({email,password});assert.equal(login.error,null);
 // Use the actual signed-in session for REST, Storage and Realtime alike.
 const token=login.data.session.access_token;const api=auth;
 return {id:data.user.id,username,email,password,token,auth,api};
}
async function game(user,action,payload={},expected=200){
 const r=await fetch(url+'/functions/v1/game-api',{method:'POST',headers:{apikey:status.ANON_KEY,Authorization:'Bearer '+user.token,'Content-Type':'application/json'},body:JSON.stringify({action,payload})});
 const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));return data;
}
async function rpc(name,args){const params=args.map((_,i)=>'$'+(i+1)).join(',');return (await db.query(`select public.${name}(${params}) as result`,args)).rows[0].result;}
async function snapshot(id){return (await db.query("select jsonb_build_object('stats',to_jsonb(s),'wallet',to_jsonb(w),'ledger',(select coalesce(jsonb_agg(e order by e.id),'[]'::jsonb) from economy_transactions e where e.user_id=$1)) as value from player_stats s join wallets w using(user_id) where s.user_id=$1",[id])).rows[0].value;}
async function challenge(user,mode='classic',tournamentId){const ch=await game(user,'start_round',{mode,tournamentId});await db.query("update round_challenges set issued_at=now()-interval '20 seconds' where id=$1",[ch.challenge_id]);return ch;}
function payload(ch){const words=ch.target_text.trim().split(/\s+/).length,score=words*20+Array.from({length:words},(_,i)=>Math.min(i*5,30)).reduce((a,b)=>a+b,0);return {challengeId:ch.challenge_id,roundId:randomUUID(),mode:ch.mode,score,words,erased:0,maxStreak:words,totalKeys:words*8,errors:0,durationMs:5000,oneClue:false};}
async function subscribe(api,table,filter){
 const events=[],systems=[];const channel=api.channel('fixture_'+randomUUID()).on('system','*',event=>systems.push(event)).on('postgres_changes',{event:'*',schema:'public',table,...(filter?{filter}:{})},event=>events.push(event));
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Realtime subscription timeout')),15000);channel.subscribe(state=>{if(state==='SUBSCRIBED'){clearTimeout(timer);resolve()}else if(['CHANNEL_ERROR','TIMED_OUT'].includes(state)){clearTimeout(timer);reject(new Error('Realtime '+state))}})});
 // SUBSCRIBED is the WebSocket join, not proof the WAL listener is ready.
 // https://supabase.com/docs/guides/troubleshooting/realtime-postgres-changes-troubleshooting
 try{await eventually(()=>systems.some(event=>event.extension==='postgres_changes'&&event.status==='ok'),15000)}
 catch(error){console.log('Realtime readiness diagnostics',JSON.stringify(systems));throw error}
 return {events,channel};
}
async function eventually(fn,timeout=10000){const deadline=Date.now()+timeout;while(Date.now()<deadline){if(await fn())return;await new Promise(r=>setTimeout(r,100))}throw new Error('Expected asynchronous state was not observed');}
before(async()=>{
 db=await database();console.log('REAL STACK', (await db.query('select version()')).rows[0].version, 'scenario',process.env.AUTOTYPE_STACK_SCENARIO);
 await db.query(fs.readFileSync(path.join(root,'supabase/maintenance/install.sql'),'utf8'));
 if(process.env.AUTOTYPE_STACK_SCENARIO==='upgrade'){
  const legacy=await account();await rpc('autotype_record_round',[legacy.id,randomUUID(),'custom',500,5,0,5,40,0,5000,false]);
  const order=await rpc('autotype_create_payment_order',[legacy.id,'coins_500']);await rpc('autotype_attach_checkout_session',[order.order_id,legacy.id,'cs_test_legacy']);
  await rpc('autotype_credit_coin_purchase',['evt_legacy','checkout.session.completed',legacy.id,'cs_test_legacy','pi_legacy','coins_500',99,'usd']);
  const saved=await snapshot(legacy.id);
  const files=fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.includes('_phase1_')).sort();
  await db.query('select autotype_maintenance.set_enabled(true)');
  await db.query("begin;set local autotype.maintenance_bypass='on'");
  for(const file of files){await db.query(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));console.log('UPGRADE APPLIED',file)}
  await db.query(fs.readFileSync(path.join(root,'supabase/maintenance/install.sql'),'utf8'));
  await db.query('commit');
  assert.equal((await db.query('select public.autotype_maintenance_status() as closed')).rows[0].closed,true);
  await db.query('select autotype_maintenance.set_enabled(false)');
  assert.equal(files.length,6);assert.deepEqual(await snapshot(legacy.id),saved);
  assert.equal((await db.query('select status from payment_orders where id=$1',[order.order_id])).rows[0].status,'paid');
  console.log('PASS synthetic legacy upgrade preserved stats, wallet, ledger and paid order');
  await db.query("notify pgrst, 'reload schema'");
  await new Promise(r=>setTimeout(r,1500));
 }
 await db.query("notify pgrst, 'reload schema'");await new Promise(r=>setTimeout(r,1500));
 A=await account();B=await account();C=await account();staff=await account(true);
}, {timeout:120000});
after(async()=>{for(const api of clients)await api.removeAllChannels();await db?.end()});

test('local-only guards reject hosted HTTP, TCP and WebSocket destinations',()=>{
 assert.throws(()=>fetch('https://example.invalid'),/non-local/);
 assert.throws(()=>require('node:net').connect(443,'example.invalid'),/non-local/);
 assert.throws(()=>new WebSocket('wss://example.invalid'),/non-local/);
});
test('real Auth login, refresh, logout and revoked refresh token',async()=>{
 const user=await account(),old=user.auth.auth.getSession;const initial=await user.auth.auth.getSession();assert.equal(initial.error,null);
 const refreshed=await user.auth.auth.refreshSession();assert.equal(refreshed.error,null);assert.equal(refreshed.data.user.id,user.id);
 const refresh=refreshed.data.session.refresh_token;
 const lookup=await user.auth.auth.getUser();assert.equal(lookup.data.user.id,user.id);
 assert.equal((await user.auth.auth.signOut({scope:'global'})).error,null);
 const fresh=client();assert.ok((await fresh.auth.refreshSession({refresh_token:refresh})).error);
 const wrong=await fresh.auth.signInWithPassword({email:user.email,password:'incorrect'});assert.ok(wrong.error);
});
test('actual gateway rejects missing/malformed auth and derives identity from JWT',async()=>{
 for(const headers of [{apikey:status.ANON_KEY},{apikey:status.ANON_KEY,Authorization:'Bearer invalid'}]){
  const r=await fetch(url+'/functions/v1/game-api',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({action:'start_round',payload:{mode:'classic'}})});assert.equal(r.status,401);
 }
 const ch=await game(A,'start_round',{mode:'classic',userId:B.id});assert.equal((await db.query('select user_id from round_challenges where id=$1',[ch.challenge_id])).rows[0].user_id,A.id);
});
test('user-editable Auth metadata cannot grant staff privileges',async()=>{
 assert.equal((await db.query('select role from user_roles where user_id=$1',[A.id])).rows[0].role,'player');
 await game(A,'admin_restore_tournaments',{},400);
 await A.api.from('user_roles').update({role:'developer'}).eq('user_id',A.id);
 assert.equal((await db.query('select role from user_roles where user_id=$1',[A.id])).rows[0].role,'player');
});
test('RLS isolates wallets and rejects forged wallet/stat/round writes',async()=>{
 const wallets=await A.api.from('wallets').select('*');assert.equal(wallets.error,null);assert.deepEqual(wallets.data.map(x=>x.user_id),[A.id]);
 const original=await snapshot(B.id);await A.api.from('wallets').update({coins:999999}).eq('user_id',B.id);await B.api.from('wallets').update({coins:999999}).eq('user_id',B.id);
 await B.api.from('player_stats').update({rounds:999999}).eq('user_id',B.id);
 const insert=await A.api.from('round_results').insert({id:randomUUID(),user_id:A.id,mode:'classic',score:999999});assert.ok(insert.error);
 assert.deepEqual(await snapshot(B.id),original);
 const anon=await client().from('wallets').select('*');assert.ok(anon.error||anon.data.length===0);
});
test('PostgREST browser roles cannot invoke privileged Phase 1 RPCs or read private inbox/history',async()=>{
 for(const api of [client(),A.api]){
  for(const table of ['stripe_event_inbox','tournament_run_history'])assert.ok((await api.from(table).select('*')).error);
  const ingress=await api.rpc('autotype_receive_stripe_event',{p_event_id:'evt_denied',p_event_type:'checkout.session.completed',p_kind:'credit',p_payload:{},p_livemode:false});assert.ok(ingress.error);
  assert.ok((await api.rpc('autotype_reset_builtin_tournaments',{p_actor:staff.id})).error);
 }
});
test('every competitive mode saves through actual gateway once; concurrent exact retries preserve progression',async()=>{
 for(const mode of ['classic','context','evil','daily','sentence']){
  const user=await account(),ch=await challenge(user,mode),p=payload(ch),original=await snapshot(user.id);
  if(mode==='sentence'){p.sentencePhraseWords=0;p.sentencePhraseActions=0;}
  const outcomes=await Promise.all(Array.from({length:6},()=>game(user,'round_complete',p)));
  assert.equal(outcomes.filter(x=>!x.duplicate).length,1);
  const saved=await snapshot(user.id);assert.equal(Number(saved.stats.verified_rounds),Number(original.stats.verified_rounds)+1);assert.equal(Number(saved.stats.total_score),Number(original.stats.total_score)+p.score);
  assert.equal(Number(saved.wallet.coins),Number(original.wallet.coins)+outcomes.find(x=>!x.duplicate).coins_earned);
  assert.equal((await game(user,'round_complete',p)).duplicate,true);assert.deepEqual(await snapshot(user.id),saved);
  await game(user,'round_complete',{...p,score:p.score+5},400);assert.deepEqual(await snapshot(user.id),saved);
 }
});
test('practice modes and forged/foreign/expired challenges cannot mint rewards',async()=>{
 const user=await account(),original=await snapshot(user.id);
 for(const mode of ['custom','race','npc'])assert.equal((await game(user,'round_complete',{mode,score:999999,userId:B.id})).outcome,'practice');
 assert.deepEqual(await snapshot(user.id),original);
 const ch=await challenge(user),p=payload(ch);await game(B,'round_complete',p,400);await game(user,'round_complete',{...p,score:999999},400);
 await db.query("update round_challenges set expires_at=now()-interval '1 second' where id=$1",[ch.challenge_id]);await game(user,'round_complete',p,400);assert.deepEqual(await snapshot(user.id),original);
});
test('live leaderboard and core XP/level calculations agree with real saved progression',async()=>{
 const user=await account(),ch=await challenge(user),p=payload(ch);await game(user,'round_complete',p);
 const browser={AUTOTYPE_SUPABASE:{url,publishableKey:status.ANON_KEY},supabase:{createClient:()=>user.api}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'backend.js'),'utf8'),{window:browser,console});
 const row=(await browser.AutoTypeBackend.leaderboard(100)).find(x=>x.user_id===user.id);assert.ok(row);
 const saved=await snapshot(user.id),awards=(await db.query('select achievement_id from user_achievements where user_id=$1',[user.id])).rows;
 assert.equal(row.words,Number(saved.stats.words));assert.equal(row.rounds,Number(saved.stats.rounds));assert.equal(row.best_streak,Number(saved.stats.best_streak));assert.equal(Object.keys(row.achievements).length,awards.length);
 const core=fs.readFileSync(path.join(root,'core.js'),'utf8'),defs=core.match(/const achievementDefs = (\[[\s\S]*?\n  \]);/)[1];
 const xp=core.match(/function totalXP\([\s\S]*?\n  \}/)[0],level=core.match(/function levelInfo\([\s\S]*?\n  \}/)[0],context={};
 vm.runInNewContext('const achievementDefs='+defs+';'+xp+';'+level+';globalThis.calculate=levelInfo;',context);
 const info=context.calculate({words:row.words,rounds:row.rounds,bestStreak:row.best_streak,achievements:row.achievements});
 const expected=Number(saved.stats.words)*10+Number(saved.stats.rounds)*50+Number(saved.stats.best_streak)*20+awards.length*200;
 assert.equal(info.xp,expected);assert.equal(info.level,Math.floor(expected/500)+1);assert.ok(info.xp>0);
});
test('two-account friendship and chat use real gateway and enforce outsider denial',async()=>{
 await game(A,'chat_send',{friendId:B.id,message:'Before friendship'},400);
 const request=await game(A,'send_friend_request',{username:B.username});
 const row=(await db.query('select id from friend_requests where sender_id=$1 and receiver_id=$2',[A.id,B.id])).rows[0];assert.ok(row);
 await game(B,'respond_friend_request',{requestId:row.id,accept:true});
 await game(A,'chat_send',{friendId:B.id,message:'Synthetic hello'});
 const history=await game(B,'chat_history',{friendId:A.id});assert.ok(JSON.stringify(history).includes('Synthetic hello'));
 await game(C,'chat_history',{friendId:A.id},400);
});
test('Realtime gives two race participants updates while withholding private race from outsider',{timeout:90000},async()=>{
 const room=await game(A,'create_race',{friendId:B.id});
 for(const user of [A,B]){const visible=await user.api.from('race_rooms').select('*').eq('id',room.id);assert.equal(visible.error,null);assert.equal(visible.data.length,1);}
 const a=await subscribe(A.api,'race_rooms','id=eq.'+room.id),b=await subscribe(B.api,'race_rooms','id=eq.'+room.id),c=await subscribe(C.api,'race_rooms','id=eq.'+room.id);
 try{
  const hidden=await C.api.from('race_rooms').select('*').eq('id',room.id);assert.equal(hidden.error,null);assert.equal(hidden.data.length,0);
  await db.query("update race_rooms set status='countdown' where id=$1",[room.id]);
  await eventually(()=>a.events.length>0&&b.events.length>0);await new Promise(r=>setTimeout(r,750));assert.equal(c.events.length,0);
  await A.api.removeChannel(a.channel);const again=await subscribe(A.api,'race_rooms','id=eq.'+room.id);
  await db.query("update race_rooms set status='waiting' where id=$1",[room.id]);await eventually(()=>again.events.length>0);await A.api.removeChannel(again.channel);
 }finally{await A.api.removeChannel(a.channel);await B.api.removeChannel(b.channel);await C.api.removeChannel(c.channel)}
});
test('simultaneous race finishes are immutable/idempotent and do not reward practice',async()=>{
 const room=await game(A,'create_race',{friendId:B.id});await db.query("update race_rooms set target_text='one two three four',created_at=now()-interval '1 minute',status='waiting' where id=$1",[room.id]);
 const p={raceId:room.id,score:110,durationMs:5000,errors:0,erased:0},beforeA=await snapshot(A.id),beforeB=await snapshot(B.id);
 await game(C,'submit_race_result',p,400);
 await Promise.all([game(A,'submit_race_result',p),game(B,'submit_race_result',{...p,score:130}),game(A,'submit_race_result',p)]);
 assert.equal((await db.query('select winner_id from race_rooms where id=$1',[room.id])).rows[0].winner_id,B.id);
 assert.equal((await game(A,'submit_race_result',p)).duplicate,true);await game(A,'submit_race_result',{...p,score:130},400);
 assert.deepEqual(await snapshot(A.id),beforeA);assert.deepEqual(await snapshot(B.id),beforeB);
});
test('tournament reset through staff gateway abandons old challenge; fresh run can finish and award once',async()=>{
 const tour='11111111-1111-4111-8111-111111111111',user=await account();await game(staff,'admin_restore_tournaments');await game(user,'join_tournament',{tournamentId:tour});
 await game(staff,'admin_upsert_tournament',{tournamentId:tour,status:'running',name:'Synthetic Tournament',rewardCoins:300});
 const old=await challenge(user,'tournament',tour),stale=payload(old);await game(staff,'admin_restore_tournaments');
 await game(user,'join_tournament',{tournamentId:tour});await game(staff,'admin_upsert_tournament',{tournamentId:tour,status:'running',name:'Synthetic Tournament',rewardCoins:300});
 const original=await snapshot(user.id);await game(user,'round_complete',stale,400);assert.deepEqual(await snapshot(user.id),original);
 const fresh=await challenge(user,'tournament',tour);assert.notEqual(fresh.tournament_run_id,old.tournament_run_id);const p=payload(fresh);assert.equal((await game(user,'round_complete',p)).verified,true);
 await game(user,'award_tournament',{tournamentId:tour,winnerId:user.id},400);const award=await game(staff,'award_tournament',{tournamentId:tour,winnerId:user.id});assert.equal(award.verified_score,p.score);
 await game(staff,'award_tournament',{tournamentId:tour,winnerId:user.id},400);assert.equal((await game(user,'round_complete',p)).duplicate,true);
});
test('Storage upload/upsert/delete respects ownership on real service',async()=>{
 const name=A.id+'/fixture.png',bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8L8AAAAASUVORK5CYII=','base64');
 const bucket=A.api.storage.from('backgrounds');assert.equal((await bucket.upload(name,bytes,{contentType:'image/png'})).error,null);assert.equal((await bucket.upload(name,bytes,{contentType:'image/png',upsert:true})).error,null);
 assert.ok((await B.api.storage.from('backgrounds').upload(name,bytes,{contentType:'image/png',upsert:true})).error);
 await B.api.storage.from('backgrounds').remove([name]);assert.equal((await bucket.list(A.id)).data.length,1);
 assert.equal((await bucket.remove([name])).error,null);assert.equal((await bucket.list(A.id)).data.length,0);
});
test('signed synthetic Stripe handler drives actual PostgREST reconciliation with mocked canonical reads',async()=>{
 const Stripe=require('stripe'),{edge,request}=require('./phase1-test-helpers.cjs'),signature=new Stripe('sk_test_fixture'),secret='whsec_fixture';
 const user=await account(),order=await rpc('autotype_create_payment_order',[user.id,'coins_500']),session='cs_test_'+randomUUID(),intent='pi_'+randomUUID();
 await rpc('autotype_attach_checkout_session',[order.order_id,user.id,session]);
 class FakeStripe {constructor(){return {webhooks:signature.webhooks,refunds:{retrieve:async id=>({id,livemode:false,payment_intent:intent,amount:99,status:'succeeded'})},disputes:{retrieve:async id=>({id,livemode:false,payment_intent:intent,amount:99,status:'won'})}}}static createSubtleCryptoProvider=Stripe.createSubtleCryptoProvider;}
 const handler=edge('supabase/functions/stripe-webhook/index.ts',{Stripe:FakeStripe,createClient:()=>admin,Deno:{env:{get:key=>key==='STRIPE_SECRET_KEY'?'sk_test_fixture':key==='STRIPE_WEBHOOK_SECRET'?secret:key==='SUPABASE_URL'?url:status.SERVICE_ROLE_KEY}}});
 async function event(id,type,object,expected=200){const body=JSON.stringify({id,type,livemode:false,data:{object}}),header=signature.webhooks.generateTestHeaderString({payload:body,secret});const r=await handler(new Request(url,{method:'POST',headers:{'stripe-signature':header},body}));assert.equal(r.status,expected,await r.clone().text());return r.json();}
 const refund='re_'+randomUUID();await event('evt_early_'+intent,'refund.created',{id:refund});
 const object={id:session,payment_status:'paid',payment_intent:intent,amount_total:99,currency:'usd',metadata:{order_id:order.order_id,user_id:user.id,pack_id:'coins_500'}};
 await Promise.all([event('evt_credit_'+intent,'checkout.session.completed',object),event('evt_credit_'+intent,'checkout.session.completed',object)]);
 await event('evt_refund_again_'+intent,'refund.updated',{id:refund});
 assert.equal(Number((await snapshot(user.id)).wallet.coins),500);
 assert.equal((await db.query("select count(*)::int as n from economy_transactions where user_id=$1 and kind='stripe_coin_purchase'",[user.id])).rows[0].n,1);
 assert.equal((await db.query("select count(*)::int as n from stripe_event_inbox where payment_intent=$1 and state<>'applied'",[intent])).rows[0].n,0);
 const invalid=await handler(new Request(url,{method:'POST',headers:{'stripe-signature':'invalid'},body:'{}'}));assert.equal(invalid.status,400);
});


test('validly signed expired JWT is rejected by actual Auth and Edge gateway',async()=>{
 const [header,body,signature]=A.token.split('.'),algorithm=JSON.parse(Buffer.from(header,'base64url'));
 let sign;
 if(algorithm.alg==='HS256'){
  sign=value=>createHmac('sha256',status.JWT_SECRET).update(value).digest('base64url');
  assert.equal(sign(header+'.'+body),signature,'Fixture signing secret matches the real Auth issuer');
 }else{
  assert.ok(['ES256','RS256'].includes(algorithm.alg));
  const jwk=status.CI_AUTH_SIGNING_KEYS.find(key=>key.kid===algorithm.kid);assert.ok(jwk?.d,'Private key belongs only to disposable issuer');
  const key=createPrivateKey({key:jwk,format:'jwk'}),options=algorithm.alg==='ES256'?{key,dsaEncoding:'ieee-p1363'}:{key};
  assert.ok(cryptoVerify('sha256',Buffer.from(header+'.'+body),options,Buffer.from(signature,'base64url')));
  sign=value=>cryptoSign('sha256',Buffer.from(value),options).toString('base64url');
 }
 const claims=JSON.parse(Buffer.from(body,'base64url'));claims.exp=Math.floor(Date.now()/1000)-60;
 const expiredBody=Buffer.from(JSON.stringify(claims)).toString('base64url'),expired=header+'.'+expiredBody+'.'+sign(header+'.'+expiredBody);
 assert.ok((await A.auth.auth.getUser(expired)).error);
 await game({...A,token:expired},'start_round',{mode:'classic'},401);
});
test('actual Edge webhook validates signed simulated Checkout events and denies live/invalid signatures',async()=>{
 const Stripe=require('stripe'),signer=new Stripe('sk_test_fixture'),secret=JSON.parse(fs.readFileSync(path.join(dir,'stripe_fixture.json'),'utf8')).webhook_secret;
 const user=await account(),order=await rpc('autotype_create_payment_order',[user.id,'coins_500']),session='cs_test_'+randomUUID(),intent='pi_fixture_'+randomUUID();
 await rpc('autotype_attach_checkout_session',[order.order_id,user.id,session]);
 const object={id:session,payment_status:'paid',payment_intent:intent,amount_total:99,currency:'usd',metadata:{order_id:order.order_id,user_id:user.id,pack_id:'coins_500'}};
 async function send(id,livemode=false,invalid=false){
  const body=JSON.stringify({id,type:'checkout.session.completed',livemode,data:{object}}),header=invalid?'invalid':signer.webhooks.generateTestHeaderString({payload:body,secret});
  return fetch(url+'/functions/v1/stripe-webhook',{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':header},body});
 }
 const event='evt_fixture_'+randomUUID(),outcomes=await Promise.all([send(event),send(event)]);
 for(const response of outcomes)assert.equal(response.status,200,await response.clone().text());
 assert.equal(Number((await snapshot(user.id)).wallet.coins),1000);
 assert.equal((await db.query("select count(*)::int as n from economy_transactions where user_id=$1 and kind='stripe_coin_purchase'",[user.id])).rows[0].n,1);
 const live='evt_live_fixture_'+randomUUID();assert.equal((await send(live,true)).status,400);assert.equal((await send('evt_invalid_fixture',false,true)).status,400);
 assert.equal((await db.query('select count(*)::int as n from stripe_event_inbox where event_id=$1',[live])).rows[0].n,0);
});

async function publicSnapshot(){
 const result={};for(const {tablename} of (await db.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows){
  assert.match(tablename,/^[a-z_]+$/);
  result[tablename]=(await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as rows from public.${tablename} t`)).rows[0].rows;
 }return result;
}
test('maintenance locks drain actual open transactions and timeout leaves gate open',async()=>{
 const writer=await database(),closer=await database();
 try{
  await writer.query('begin');await writer.query('update public.wallets set coins=coins where user_id=$1',[A.id]);
  await closer.query("set lock_timeout='150ms'");await assert.rejects(closer.query('select autotype_maintenance.set_enabled(true)'),{code:'55P03'});
  assert.equal((await db.query('select public.autotype_maintenance_status() as closed')).rows[0].closed,false);
  await closer.query("set lock_timeout='5s'");let settled=false;
  const close=closer.query('select autotype_maintenance.set_enabled(true)').then(()=>settled=true);
  await eventually(async()=>Number((await db.query("select count(*)::int n from pg_locks where locktype='advisory' and not granted and pid=$1",[closer.processID])).rows[0].n)===1);
  assert.equal(settled,false);await writer.query('commit');await close;assert.equal(settled,true);
  await assert.rejects(writer.query('update public.wallets set coins=coins where user_id=$1',[A.id]),{code:'PT503'});
 }finally{await writer.query('rollback');await db.query('select autotype_maintenance.set_enabled(false)');await writer.end();await closer.end()}
});
test('REPEATABLE READ snapshot cannot bypass a newly closed maintenance window',async()=>{
 const old=await database();
 try{
  await old.query('begin isolation level repeatable read');await old.query('select public.autotype_maintenance_status()');
  await db.query('select autotype_maintenance.set_enabled(true)');
  await assert.rejects(old.query('update public.wallets set coins=coins+1 where user_id=$1',[A.id]),{code:'40001'});
 }finally{await old.query('rollback');await old.end();await db.query('select autotype_maintenance.set_enabled(false)')}
});
test('public writes, old service RPCs, game and financial endpoints freeze; login/read and exact-once retry recover',{timeout:120000},async()=>{
 const user=await account(),ch=await challenge(user),p=payload(ch);
 const order=await rpc('autotype_create_payment_order',[user.id,'coins_500']),session='cs_test_'+randomUUID(),intent='pi_fixture_'+randomUUID();
 await rpc('autotype_attach_checkout_session',[order.order_id,user.id,session]);
 const Stripe=require('stripe'),signer=new Stripe('sk_test_fixture'),secret=JSON.parse(fs.readFileSync(path.join(dir,'stripe_fixture.json'),'utf8')).webhook_secret;
 const object={id:session,payment_status:'paid',payment_intent:intent,amount_total:99,currency:'usd',metadata:{order_id:order.order_id,user_id:user.id,pack_id:'coins_500'}};
 const event='evt_maintenance_'+randomUUID();
 async function webhook(type='checkout.session.completed'){
  const body=JSON.stringify({id:event,type,livemode:false,data:{object}});
  return fetch(url+'/functions/v1/stripe-webhook',{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':signer.webhooks.generateTestHeaderString({payload:body,secret})},body});
 }
 await db.query('select autotype_maintenance.set_enabled(true)');const original=await publicSnapshot();
 try{
  for(const table of Object.keys(original))await assert.rejects(db.query(`delete from public.${table} where false`),{code:'PT503'});
  await assert.rejects(db.query('truncate public.wallets cascade'),{code:'PT503'});
  await db.query("begin;set local role service_role;set local autotype.maintenance_bypass='on'");
  try{await assert.rejects(rpc('autotype_create_payment_order',[user.id,'coins_500']),{code:'PT503'})}finally{await db.query('rollback')}
  for(const api of [client(),user.api,admin]){
   assert.ok((await api.rpc('set_enabled',{p_enabled:false})).error);
   assert.ok((await api.from('control').select('*')).error);
  }
  const legacy=await admin.rpc('autotype_record_round',{p_user:user.id,p_round:randomUUID(),p_mode:'classic',p_score:100,p_words:2,p_erased:0,p_max_streak:2,p_total_keys:16,p_errors:0,p_duration_ms:5000,p_one_clue:false});assert.ok(legacy.error);
  for(const action of ['round_complete','start_round','submit_race_result','join_tournament','award_tournament','admin_restore_tournaments','admin_adjust_coins','developer_set_staff_role'])await game(staff,action,p,503);
  for(const name of ['create-checkout-session','refund-payment','delete-account']){
   const response=await fetch(url+'/functions/v1/'+name,{method:'POST',headers:{apikey:status.ANON_KEY,Authorization:'Bearer '+staff.token,'Content-Type':'application/json'},body:JSON.stringify({packId:'coins_500',returnBase:url+'/',orderId:order.order_id})});
   assert.equal(response.status,503,await response.clone().text());assert.equal(response.headers.get('Retry-After'),'60');
  }
  for(const type of ['checkout.session.completed','ignored.fixture']){const response=await webhook(type);assert.equal(response.status,503);assert.equal(response.headers.get('Cache-Control'),'no-store')}
  await assert.rejects(rpc('autotype_receive_stripe_event',['evt_direct_maintenance','checkout.session.completed','credit',{session,order_id:order.order_id,user_id:user.id,pack_id:'coins_500',payment_intent:intent,amount:99,currency:'usd'},false]),{code:'PT503'});
  const login=await user.auth.auth.signInWithPassword({email:user.email,password:user.password});assert.equal(login.error,null);
  assert.equal((await user.auth.auth.refreshSession()).error,null);assert.equal((await user.api.from('wallets').select('*')).error,null);
  assert.deepEqual(await publicSnapshot(),original,'Every public table, including all payment/stats/wallet records, stayed unchanged');
 }finally{await db.query('select autotype_maintenance.set_enabled(false)')}
 assert.equal((await game(user,'round_complete',p)).verified,true);assert.equal((await game(user,'round_complete',p)).duplicate,true);
 const before=await snapshot(user.id);for(let i=0;i<2;i++){const response=await webhook();assert.equal(response.status,200,await response.clone().text())}
 assert.equal(Number((await snapshot(user.id)).wallet.coins),Number(before.wallet.coins)+500);
 assert.equal((await db.query('select count(*)::int n from payment_events where event_id=$1',[event])).rows[0].n,1);
});
test('external-operation leases cannot be expired or bypassed to pretend the gate is closed',async()=>{
 const lease=await admin.rpc('autotype_begin_operation',{p_kind:'refund'});assert.equal(lease.error,null);
 try{
  await assert.rejects(db.query('select autotype_maintenance.set_enabled(true)'),{code:'55000'});
  assert.equal((await db.query('select public.autotype_maintenance_status() as closed')).rows[0].closed,false);
 }finally{assert.equal((await admin.rpc('autotype_end_operation',{p_id:lease.data})).error,null)}
 await db.query('select autotype_maintenance.set_enabled(true)');
 try{assert.equal((await admin.rpc('autotype_begin_operation',{p_kind:'checkout'})).error.code,'PT503')}
 finally{await db.query('select autotype_maintenance.set_enabled(false)')}
});
