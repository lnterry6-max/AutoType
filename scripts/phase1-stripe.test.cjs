"use strict";
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),Stripe=require('stripe');
const {database,user,rpc,snapshot,edge,randomUUID}=require('./phase1-test-helpers.cjs');
let db;before(async()=>{db=await database()});after(async()=>{await db?.close()});
const send=(id,kind,payload,live=false)=>rpc(db,'autotype_receive_stripe_event',[id,kind==='credit'?'checkout.session.completed':kind+'.updated',kind,payload,live]);
async function order({attach=true,small=false}={}){
 const id=await user(db),pack=small?'fixture-small':'coins_500';
 if(small)await db.exec("insert into coin_packs(id,name,coins,amount_cents,currency) values('fixture-small','Small fixture',2,100,'usd') on conflict do nothing");
 const o=await rpc(db,'autotype_create_payment_order',[id,pack]),session='cs_test_'+randomUUID(),pi='pi_'+randomUUID();
 if(attach)await rpc(db,'autotype_attach_checkout_session',[o.order_id,id,session]);
 const balance=Number((await snapshot(db,id)).wallet.coins);
 return {o,id,session,pi,balance,credit:{order_id:o.order_id,user_id:id,session,pack_id:pack,payment_intent:pi,amount:o.amount_cents,currency:o.currency}};
}
const adjustment=(o,object,status='succeeded',amount=o.o.amount_cents)=>({object_id:object,payment_intent:o.pi,amount,status});
const coins=async o=>Number((await snapshot(db,o.id)).wallet.coins);
test('early refund persists pending and applies exactly once after Checkout credit',async()=>{
 const o=await order(),event='evt_'+randomUUID(),refund=adjustment(o,'re_'+randomUUID());
 assert.equal((await send(event,'refund',refund)).state,'pending');assert.equal(await coins(o),o.balance);
 assert.equal((await send('evt_'+randomUUID(),'credit',o.credit)).state,'applied');assert.equal(await coins(o),o.balance);
 assert.equal((await send(event,'refund',refund)).state,'already_processed');
 await send('evt_'+randomUUID(),'refund',refund);await send('evt_'+randomUUID(),'credit',o.credit);assert.equal(await coins(o),o.balance);
 const history=(await db.query('select status,coins_reversed from payment_orders where id=$1',[o.o.order_id])).rows[0];
 assert.equal(history.status,'refunded');assert.equal(history.coins_reversed,o.o.coins);
});
test('early disputes reconcile active, lost and won without duplicate holds or credits',async()=>{
 for(const terminal of ['lost','won']){
 const o=await order(),object='dp_'+randomUUID();
 await send('evt_'+randomUUID(),'dispute',adjustment(o,object,'needs_response'));
 await send('evt_'+randomUUID(),'dispute',adjustment(o,object,terminal));
 await send('evt_'+randomUUID(),'credit',o.credit);
 assert.equal(await coins(o),o.balance+(terminal==='won'?o.o.coins:0));
 await send('evt_'+randomUUID(),'dispute',adjustment(o,object,'needs_response'));
 assert.equal(await coins(o),o.balance+(terminal==='won'?o.o.coins:0));
 }
});
test('unique adjustment objects handle zero-rounded refunds and overlapping dispute/refund recovery',async()=>{
 const o=await order({small:true});await send('evt_'+randomUUID(),'credit',o.credit);
 const tiny=adjustment(o,'re_'+randomUUID(),'succeeded',1);
 await send('evt_'+randomUUID(),'refund',tiny);await send('evt_'+randomUUID(),'refund',tiny);
 assert.equal((await db.query('select refunded_amount_cents from payment_orders where id=$1',[o.o.order_id])).rows[0].refunded_amount_cents,1);
 const dp='dp_'+randomUUID();await send('evt_'+randomUUID(),'dispute',adjustment(o,dp,'needs_response'));
 assert.equal(await coins(o),o.balance);
 await send('evt_'+randomUUID(),'refund',adjustment(o,'re_'+randomUUID(),'succeeded',99));
 await send('evt_'+randomUUID(),'dispute',adjustment(o,dp,'won'));assert.equal(await coins(o),o.balance);
});
test('Checkout before attach binds metadata order safely and uses its original snapshot',async()=>{
 const o=await order({attach:false});
 await db.query('update coin_packs set active=false,coins=999,amount_cents=101 where id=$1',[o.o.pack_id]);
 assert.equal((await send('evt_'+randomUUID(),'credit',o.credit)).state,'applied');assert.equal(await coins(o),o.balance+o.o.coins);
 assert.equal(await rpc(db,'autotype_attach_checkout_session',[o.o.order_id,o.id,o.session]),true);
 await db.exec("update coin_packs set active=true,coins=500,amount_cents=99 where id='coins_500'");
 const bad={...o.credit,amount:999};const result=await send('evt_'+randomUUID(),'credit',bad);
 assert.equal(result.state,'pending');assert.match(result.error,/original order/);assert.equal(await coins(o),o.balance+o.o.coins);
});
test('pending failures persist and are safely retried; event identities cannot be rebound',async()=>{
 const o=await order(),event='evt_'+randomUUID(),invalid=adjustment(o,'re_'+randomUUID(),'invalid');
 await send('evt_'+randomUUID(),'credit',o.credit);
 const failed=await send(event,'refund',invalid);assert.equal(failed.state,'pending');assert.match(failed.error,/Unsupported/);
 const fixed={...invalid,status:'succeeded'};assert.equal((await send(event,'refund',fixed)).state,'applied');
 assert.equal(await coins(o),o.balance);
 await assert.rejects(send(event,'refund',{...fixed,amount:1}),/identity mismatch/);
 await assert.rejects(send('evt_live','credit',o.credit,true),/Live payments/);
 await db.exec('set role authenticated');try{await assert.rejects(send('evt_browser','credit',o.credit),/permission denied/)}finally{await db.exec('reset role')}
});
test('simultaneously scheduled early adjustments and credits settle once',async()=>{
 const o=await order(),event='evt_'+randomUUID();
 await Promise.all([send('evt_'+randomUUID(),'refund',adjustment(o,'re_'+randomUUID())),...Array.from({length:4},()=>send(event,'credit',o.credit))]);
 assert.equal(await coins(o),o.balance);
 assert.equal((await db.query("select count(*)::int as n from economy_transactions where user_id=$1 and kind='stripe_coin_purchase'",[o.id])).rows[0].n,1);
});
function webhook({key='sk_test_fixture',fail=false}={}){
 const calls=[],secret='whsec_fixture',stripe=new Stripe('sk_test_fixture');
 function MockStripe(){return {webhooks:stripe.webhooks,refunds:{retrieve:async id=>({id,livemode:false,payment_intent:'pi_fixture',amount:99,status:'succeeded'})},disputes:{retrieve:async id=>({id,livemode:false,payment_intent:'pi_fixture',amount:99,status:'won'})}}}
 MockStripe.createSubtleCryptoProvider=Stripe.createSubtleCryptoProvider;
 const handler=edge('supabase/functions/stripe-webhook/index.ts',{Stripe:MockStripe,
 Deno:{env:{get:name=>name==='STRIPE_SECRET_KEY'?key:name==='STRIPE_WEBHOOK_SECRET'?secret:'fixture'},serve:undefined},
 createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return fail?{error:new Error('database unavailable')}:{data:{state:'pending',received:true}}}})});
 return {calls,secret,handler,stripe};
}
async function delivery(w,{live=false,signature=true,type='refund.updated'}={}){
 const body=JSON.stringify({id:'evt_fixture',type,livemode:live,data:{object:{id:'re_fixture',status:'pending'}}});
 const sig=signature?w.stripe.webhooks.generateTestHeaderString({payload:body,secret:w.secret}):'t=1,v1=bad';
 return w.handler(new Request('https://fixture.invalid',{method:'POST',headers:{'stripe-signature':sig},body}));
}
test('real Stripe signature verification rejects tampering and live mode, hydrates stale test snapshots',async()=>{
 const w=webhook();assert.equal((await delivery(w,{signature:false})).status,400);assert.equal(w.calls.length,0);
 assert.equal((await delivery(w,{live:true})).status,400);assert.equal(w.calls.length,0);
 assert.equal((await delivery(w)).status,200);assert.equal(w.calls[0].args.p_payload.status,'succeeded');
 assert.equal(w.calls[0].args.p_livemode,false);
 assert.equal((await delivery(webhook({key:'sk_live_fixture'}))).status,503);
 assert.equal((await delivery(webhook({fail:true}))).status,500);
});
test('legacy session-only pending credit drains after attachment',async()=>{
 const o=await order({attach:false}),p={...o.credit};delete p.order_id;
 assert.equal((await send('evt_'+randomUUID(),'credit',p)).state,'pending');
 await rpc(db,'autotype_attach_checkout_session',[o.o.order_id,o.id,o.session]);assert.equal(await coins(o),o.balance+o.o.coins);
});
test('checkout/refund reject live or unknown keys even when live toggle is true',async()=>{
 for(const file of ['create-checkout-session','refund-payment'])for(const key of ['sk_live_fixture','rk_live_fixture','unknown']){
 let writes=0;
 const handler=edge('supabase/functions/'+file+'/index.ts',{Stripe:class{constructor(){writes++;throw Error('must not reach Stripe')}},
 Deno:{env:{get:name=>name==='STRIPE_SECRET_KEY'?key:name==='STRIPE_LIVE_ENABLED'?'true':'fixture'}},
 createClient:()=>({auth:{getUser:async()=>({data:{user:{id:randomUUID()}}})},rpc:async()=>{writes++;throw Error('must not write order')}})});
 const response=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:'{}'}));
 assert.equal(response.status,503);assert.equal(writes,0);
 }
});

test('retry of an applied credit drains adjustments whose application failed',async()=>{
 const o=await order(),creditEvent='evt_'+randomUUID();
 await send('evt_'+randomUUID(),'refund',adjustment(o,'re_'+randomUUID()));
 await db.exec(`create function fixture_fail_reverse() returns trigger language plpgsql as $$begin
  if new.coins<old.coins or new.coin_debt>old.coin_debt then raise exception 'Fixture reverse outage'; end if;return new;end;$$;
  create trigger fixture_reverse_outage before update on wallets for each row execute function fixture_fail_reverse();`);
 try{
  const first=await send(creditEvent,'credit',o.credit);assert.equal(first.state,'applied');assert.ok(first.reconciled.some(x=>x.error));
  assert.equal(await coins(o),o.balance+o.o.coins);
 }finally{await db.exec('drop trigger fixture_reverse_outage on wallets;drop function fixture_fail_reverse()')}
 const retry=await send(creditEvent,'credit',o.credit);assert.equal(retry.state,'already_processed');assert.equal(await coins(o),o.balance);
});
