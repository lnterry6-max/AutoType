'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {database,read,user,rpc,snapshot,edge,request,randomUUID}=require('./phase1-test-helpers.cjs');
let db,id;before(async()=>{db=await database();id=await user(db);await db.exec(read('supabase/maintenance/install.sql'))});after(async()=>db?.close());
test('maintenance preserves state on reinstall, blocks every public-table write and reopens reversibly',async()=>{
 const original=await snapshot(db,id);
 await db.exec('select autotype_maintenance.set_enabled(true)');
 try{
  await db.exec(read('supabase/maintenance/install.sql'));
  assert.equal((await db.query('select public.autotype_maintenance_status() as closed')).rows[0].closed,true);
  const tables=(await db.query("select tablename from pg_tables where schemaname='public'")).rows;
  for(const {tablename} of tables){
   assert.match(tablename,/^[a-z_]+$/);
   await assert.rejects(db.exec(`delete from public.${tablename} where false`),{code:'PT503'});
  }
  await assert.rejects(db.exec('truncate public.wallets cascade'),{code:'PT503'});
  await assert.rejects(rpc(db,'autotype_create_payment_order',[id,'coins_500']),{code:'PT503'});
  assert.deepEqual(await snapshot(db,id),original);
 }finally{await db.exec('select autotype_maintenance.set_enabled(false)')}
 const o=await rpc(db,'autotype_create_payment_order',[id,'coins_500']);assert.ok(o.order_id);
});
test('browser and service roles cannot toggle or forge maintenance bypass',async()=>{
 await db.exec('select autotype_maintenance.set_enabled(true)');
 try{
  for(const role of ['anon','authenticated','service_role']){
   await db.exec('set role '+role+";set autotype.maintenance_bypass='on'");
   try{
    await assert.rejects(db.exec('select autotype_maintenance.set_enabled(false)'),/permission denied/);
    if(role==='service_role')await assert.rejects(rpc(db,'autotype_create_payment_order',[id,'coins_500']),{code:'PT503'});
    else await assert.rejects(rpc(db,'autotype_begin_operation',['checkout']),/permission denied/);
   }finally{await db.exec('reset role;reset autotype.maintenance_bypass')}
  }
 }finally{await db.exec('select autotype_maintenance.set_enabled(false)')}
});
test('unfinished external operation prevents close, release permits close, closed entry refuses',async()=>{
 const lease=await rpc(db,'autotype_begin_operation',['refund']);
 await assert.rejects(db.exec('select autotype_maintenance.set_enabled(true)'),{code:'55000'});
 assert.equal((await db.query('select public.autotype_maintenance_status() as closed')).rows[0].closed,false);
 await rpc(db,'autotype_end_operation',[lease]);await rpc(db,'autotype_end_operation',[lease]);
 await db.exec('select autotype_maintenance.set_enabled(true)');
 try{await assert.rejects(rpc(db,'autotype_begin_operation',['checkout']),{code:'PT503'})}
 finally{await db.exec('select autotype_maintenance.set_enabled(false)')}
});
function mock(closed=true){
 const writes=[];const admin={auth:{getUser:async()=>({data:{user:{id:randomUUID()}}}),admin:{deleteUser:async()=>{writes.push('delete');return {}}}},
 rpc:async(name)=>{if(name==='autotype_maintenance_status')return {data:closed};if(name==='autotype_begin_operation')return {error:{code:'PT503'}};writes.push(name);throw Error('Unexpected mutation')},
 from:()=>({select:()=>({eq:()=>({single:async()=>({data:{role:'developer'}})})})})};
 return {admin,writes};
}
test('game, checkout, refund and deletion fail closed before database/provider mutations',async()=>{
 for(const name of ['game-api','create-checkout-session','refund-payment','delete-account']){
  const m=mock();let providerCalls=0;
  const handler=edge('supabase/functions/'+name+'/index.ts',{createClient:()=>m.admin,Stripe:class{constructor(){providerCalls++}},Deno:{env:{get:key=>key==='STRIPE_SECRET_KEY'?'sk_test_fixture':'fixture'}}});
  const r=await handler(request({action:'round_complete',packId:'coins_500',returnBase:'https://fixture.invalid/'}));
  assert.equal(r.status,503,name);assert.equal(r.headers.get('Retry-After'),'60');assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal(providerCalls,0);assert.deepEqual(m.writes,[]);
 }
});
test('missing maintenance installation fails closed and checkout status remains read-only',async()=>{
 const m=mock();m.admin.rpc=async()=>({error:{code:'42883'}});
 const handler=edge('supabase/functions/game-api/index.ts',{createClient:()=>m.admin});
 assert.equal((await handler(request({action:'start_round'}))).status,503);
 const status=edge('supabase/functions/create-checkout-session/index.ts',{createClient:()=>mock().admin,Deno:{env:{get:()=>'sk_test_fixture'}}});
 const r=await status(request({action:'status'}));assert.equal(r.status,200);assert.equal((await r.json()).configured,false);
});
test('signed Stripe deliveries including ignored types get retryable 503 without hydration or acknowledgement',async()=>{
 const Stripe=require('stripe'),signer=new Stripe('sk_test_fixture'),secret='whsec_fixture';let calls=0;
 class FixtureStripe{constructor(){return {webhooks:signer.webhooks,refunds:{retrieve:()=>{calls++;throw Error('No provider calls allowed')}}}}static createSubtleCryptoProvider=Stripe.createSubtleCryptoProvider;}
 const m=mock(),handler=edge('supabase/functions/stripe-webhook/index.ts',{Stripe:FixtureStripe,createClient:()=>m.admin,Deno:{env:{get:key=>key==='STRIPE_SECRET_KEY'?'sk_test_fixture':key==='STRIPE_WEBHOOK_SECRET'?secret:'fixture'}}});
 for(const type of ['refund.updated','checkout.session.completed','ignored.fixture']){
  const body=JSON.stringify({id:'evt_fixture',type,livemode:false,data:{object:{id:'re_fixture'}}});
  const r=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{'stripe-signature':signer.webhooks.generateTestHeaderString({payload:body,secret})},body}));
  assert.equal(r.status,503);assert.equal(r.headers.get('Retry-After'),'60');
 }
 assert.equal(calls,0);assert.deepEqual(m.writes,[]);
});
test('checkout transport failure retains its lease; successful checkout releases only after attachment',async()=>{
 for(const fail of [true,false]){
  const calls=[],id=randomUUID(),lease=randomUUID();
  const admin={auth:{getUser:async()=>({data:{user:{id}}})},rpc:async(name)=>{
   calls.push(name);if(name==='autotype_begin_operation')return {data:lease};
   if(name==='autotype_create_payment_order')return {data:{order_id:randomUUID(),currency:'usd',amount_cents:99,coins:500,pack_id:'coins_500'}};
   return {};
  }};
  class StripeFixture{checkout={sessions:{create:async()=>{calls.push('provider');if(fail)throw Error('Simulated uncertain transport failure');return {id:'cs_test_fixture',url:'https://fixture.invalid/checkout'}}}}}
  const handler=edge('supabase/functions/create-checkout-session/index.ts',{Stripe:StripeFixture,createClient:()=>admin,Deno:{env:{get:key=>key==='STRIPE_SECRET_KEY'?'sk_test_fixture':'fixture'}}});
  const response=await handler(request({packId:'coins_500',returnBase:'https://fixture.invalid/'}));assert.equal(response.status,fail?400:200);
  assert.equal(calls.includes('autotype_end_operation'),!fail);
  if(!fail)assert.ok(calls.indexOf('autotype_end_operation')>calls.indexOf('autotype_attach_checkout_session'));
 }
});
test('refund transport failure retains its lease; success releases after accounting and audit',async()=>{
 for(const fail of [true,false]){
  const calls=[],orderId=randomUUID(),id=randomUUID();
  const admin={auth:{getUser:async()=>({data:{user:{id}}})},
   rpc:async name=>{calls.push(name);return {data:name==='autotype_begin_operation'?randomUUID():{applied:true}}},
   from:table=>({select:()=>({eq:()=>({single:async()=>({data:table==='user_roles'?{role:'developer'}:{id:orderId,user_id:id,provider_payment_intent_id:'pi_fixture',status:'paid',amount_cents:99,refunded_amount_cents:0}})})}),insert:async()=>{calls.push('audit');return {}}})};
  class StripeFixture{refunds={create:async()=>{calls.push('provider');if(fail)throw Error('Simulated uncertain transport failure');return {id:'re_fixture',status:'succeeded',amount:99}}}}
  const handler=edge('supabase/functions/refund-payment/index.ts',{Stripe:StripeFixture,createClient:()=>admin,Deno:{env:{get:key=>key==='STRIPE_SECRET_KEY'?'sk_test_fixture':'fixture'}}});
  assert.equal((await handler(request({orderId}))).status,fail?400:200);
  assert.equal(calls.includes('autotype_end_operation'),!fail);
  if(!fail)assert.ok(calls.indexOf('autotype_end_operation')>calls.indexOf('audit'));
 }
});
