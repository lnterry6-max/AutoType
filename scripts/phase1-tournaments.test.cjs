"use strict";
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {database,user,rpc,challenge,metrics,snapshot,read,randomUUID}=require('./phase1-test-helpers.cjs');
let db;before(async()=>{db=await database()});after(async()=>{await db?.close()});
async function setup(){
 const actor=await user(db,{developer:true}),id=await user(db),tournament=randomUUID();
 await db.query("insert into tournaments(id,slug,name,status,max_players,reward_coins) values($1,$2,'Fixture','open',16,300)",[tournament,'fixture_'+tournament]);
 await rpc(db,'autotype_join_tournament',[id,tournament]);
 await db.query("update tournaments set status='running' where id=$1",[tournament]);
 const ch=await challenge(db,id,'tournament',tournament);
 return {actor,id,tournament,ch,args:metrics(id,ch)};
}
test('reset during an active round invalidates old run and preserves fresh re-registration',async()=>{
 const actor=await user(db,{developer:true}),id=await user(db),tournament='11111111-1111-4111-8111-111111111111';
 await rpc(db,'autotype_reset_builtin_tournaments',[actor]);
 await rpc(db,'autotype_join_tournament',[id,tournament]);await db.query("update tournaments set status='running' where id=$1",[tournament]);
 const old=await challenge(db,id,'tournament',tournament),oldArgs=metrics(id,old),original=await snapshot(db,id);
 await rpc(db,'autotype_reset_builtin_tournaments',[actor]);
 assert.equal((await db.query('select status from round_challenges where id=$1',[old.challenge_id])).rows[0].status,'abandoned');
 await rpc(db,'autotype_join_tournament',[id,tournament]);await db.query("update tournaments set status='running' where id=$1",[tournament]);
 await assert.rejects(rpc(db,'autotype_record_verified_round',oldArgs),/run changed/);
 assert.deepEqual(await snapshot(db,id),original);
 const fresh=await challenge(db,id,'tournament',tournament);assert.notEqual(fresh.tournament_run_id,old.tournament_run_id);
 const result=await rpc(db,'autotype_record_verified_round',metrics(id,fresh));assert.equal(result.verified,true);
 const entry=(await db.query('select * from tournament_entries where tournament_id=$1 and user_id=$2',[tournament,id])).rows[0];
 assert.equal(entry.run_id,fresh.tournament_run_id);assert.equal(entry.status,'finished');
 const archive=(await db.query('select previous_entries from tournament_reset_archives where tournament_id=$1 order by reset_at desc limit 1',[tournament])).rows[0];assert.equal(archive.previous_entries[0].run_id,old.tournament_run_id);
});
test('cancel, close, deletion and withdrawal/disqualification reject before account rewards',async()=>{
 for(const action of ['cancelled','closed','delete','withdrawn','disqualified','missing-entry']){
 const r=await setup(),original=await snapshot(db,r.id);
 if(action==='delete')await db.query('delete from tournaments where id=$1',[r.tournament]);
 else if(action==='missing-entry')await db.query('delete from tournament_entries where tournament_id=$1',[r.tournament]);
 else if(['withdrawn','disqualified'].includes(action))await db.query('update tournament_entries set status=$1 where tournament_id=$2',[action,r.tournament]);
 else await db.query('update tournaments set status=$1 where id=$2',[action,r.tournament]);
 await assert.rejects(rpc(db,'autotype_record_verified_round',r.args),/not running|eligible|no longer available/);
 assert.deepEqual(await snapshot(db,r.id),original);
 }
});
test('valid run saves once, retry survives closing, and only current top score can win',async()=>{
 const r=await setup();const results=await Promise.all([rpc(db,'autotype_record_verified_round',r.args),rpc(db,'autotype_record_verified_round',r.args)]);
 assert.equal(results.filter(x=>!x.duplicate).length,1);
 const saved=await snapshot(db,r.id);await assert.rejects(challenge(db,r.id,'tournament',r.tournament),/registered|complete/);
 const award=await rpc(db,'autotype_award_tournament',[r.actor,r.tournament,r.id]);assert.equal(award.verified_score,Number(r.args[4]));
 assert.equal((await rpc(db,'autotype_record_verified_round',r.args)).duplicate,true);
 await assert.rejects(rpc(db,'autotype_award_tournament',[r.actor,r.tournament,r.id]),/not running|already awarded/);
 assert.equal(Number((await snapshot(db,r.id)).wallet.coins),Number(saved.wallet.coins)+300);
 const row=(await db.query('select tournament_run_id from round_results where id=$1',[r.args[2]])).rows[0];assert.equal(row.tournament_run_id,r.ch.tournament_run_id);
});
test('reopening rotates run, excludes old standings, and permits a fresh attempt',async()=>{
 const r=await setup();await rpc(db,'autotype_record_verified_round',r.args);
 await db.query("update tournaments set status='closed' where id=$1",[r.tournament]);
 await db.query("update tournaments set status='open' where id=$1",[r.tournament]);
 const joined=await rpc(db,'autotype_join_tournament',[r.id,r.tournament]);assert.equal(joined.entry.score,null);assert.notEqual(joined.entry.run_id,r.ch.tournament_run_id);
 await db.query("update tournaments set status='running' where id=$1",[r.tournament]);
 await assert.rejects(rpc(db,'autotype_record_verified_round',r.args),/run changed/);
 await assert.rejects(rpc(db,'autotype_award_tournament',[r.actor,r.tournament,r.id]),/completed/);
 const fresh=await challenge(db,r.id,'tournament',r.tournament);assert.equal((await rpc(db,'autotype_record_verified_round',metrics(r.id,fresh))).verified,true);
});
test('same-user starts reuse one challenge and unauthorized roles cannot reset or save',async()=>{
 const r=await setup();
 const rounds=await Promise.all(Array.from({length:4},()=>rpc(db,'autotype_start_round',[r.id,'tournament',r.tournament])));
 assert.equal(new Set(rounds.map(ch=>ch.challenge_id)).size,1);
 await assert.rejects(rpc(db,'autotype_reset_builtin_tournaments',[r.id]),/access/);
 await db.exec('set role authenticated');try{await assert.rejects(rpc(db,'autotype_record_verified_round',r.args),/permission denied/)}finally{await db.exec('reset role')}
});
test('frontend tournament and admin snapshots exclude prior-run registrations',async()=>{
 const tournaments=[{id:'tour',run_id:'new'}],entries=[{tournament_id:'tour',run_id:'old',user_id:'old'},{tournament_id:'tour',run_id:'new',user_id:'current'}];
 const client={functions:{invoke:async()=>({data:{role:'admin',tournaments,entries:[...entries]}})},from:table=>({select:()=>table==='tournaments'?{order:async()=>({data:tournaments})}:table==='tournament_entries'?Promise.resolve({data:entries}):{in:async()=>({data:[]})}})};
 const browser={AUTOTYPE_SUPABASE:{url:'https://fixture.invalid',publishableKey:'fixture'},supabase:{createClient:()=>client}};
 vm.runInNewContext(read('backend.js'),{window:browser,console});
 const snapshot=await browser.AutoTypeBackend.tournamentsSnapshot();assert.equal(snapshot.entries.length,1);assert.equal(snapshot.entries[0].user_id,'current');
 assert.equal((await browser.AutoTypeBackend.adminSnapshot()).entries.length,1);
});
test('upgrade preserves existing balances, stats, achievements, purchases and completed tournament scores',async()=>{
 let id,actor,ch,original,orderId,completedId,completedScore,tournament='11111111-1111-4111-8111-111111111111';
 const upgrade=await database({beforeMigration:async(db,file)=>{
 if(file==='20261009231001_phase1_reward_verification.sql'){
 id=await user(db);actor=await user(db,{developer:true});
 await rpc(db,'autotype_record_round',[id,randomUUID(),'custom',500,5,0,5,40,0,5000,false]);
 await rpc(db,'autotype_reset_builtin_tournaments',[actor]);await rpc(db,'autotype_join_tournament',[id,tournament]);
 await db.query("update tournaments set status='running' where id=$1",[tournament]);
 ch=await challenge(db,id,'tournament',tournament);
 completedId=await user(db);completedScore=777;
 await db.query("insert into tournament_entries(tournament_id,user_id,status,score,finished_at) values($1,$2,'finished',$3,now())",[tournament,completedId,completedScore]);
 const o=await rpc(db,'autotype_create_payment_order',[id,'coins_500']);orderId=o.order_id;
 await rpc(db,'autotype_attach_checkout_session',[orderId,id,'cs_test_upgrade']);
 await rpc(db,'autotype_credit_coin_purchase',['evt_upgrade','checkout.session.completed',id,'cs_test_upgrade','pi_upgrade','coins_500',99,'usd']);
 original=await snapshot(db,id);
 }
 }});
 try{
 assert.deepEqual(await snapshot(upgrade,id),original);
 assert.equal((await upgrade.query('select score from tournament_entries where tournament_id=$1 and user_id=$2',[tournament,completedId])).rows[0].score,completedScore);
 assert.equal((await upgrade.query('select status from payment_orders where id=$1',[orderId])).rows[0].status,'paid');
 assert.equal((await upgrade.query('select status,tournament_run_id from round_challenges where id=$1',[ch.challenge_id])).rows[0].status,'abandoned');
 await assert.rejects(rpc(upgrade,'autotype_record_verified_round',metrics(id,ch)),/run changed/);
 const fresh=await challenge(upgrade,id,'tournament',tournament);assert.equal((await rpc(upgrade,'autotype_record_verified_round',metrics(id,fresh))).verified,true);
 }finally{await upgrade.close()}
});
test('browser roles cannot read the inbox/run archives or execute internal helpers',async()=>{
 for(const role of ['anon','authenticated']){
 await db.exec('set role '+role);
 try{
 for(const table of ['stripe_event_inbox','tournament_run_history'])await assert.rejects(db.query('select * from public.'+table),/permission denied/);
 await assert.rejects(rpc(db,'autotype_lock_tournament_challenge',[randomUUID(),randomUUID(),false]),/permission denied/);
 await assert.rejects(rpc(db,'autotype_apply_stripe_inbox',['evt_untrusted']),/permission denied/);
 }finally{await db.exec('reset role')}
 }
});
