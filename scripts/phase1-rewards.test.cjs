"use strict";
const {test,before,after}=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm");
const {database,user,rpc,challenge,metrics,snapshot,edge,request,read,randomUUID}=require("./phase1-test-helpers.cjs");
let db;
before(async()=>{db=await database()});after(async()=>{await db?.close()});
test("legacy custom/race results never change existing stats, wallets, achievements",async()=>{
  const id=await user(db),before=await snapshot(db,id);
  for(const mode of ["custom","race"]){
    const args=[id,randomUUID(),mode,1000000,0,0,200,0,0,250,true];
    const result=await rpc(db,"autotype_record_round",args);
    assert.equal(result.outcome,"practice");assert.equal(result.coins_earned,0);
    assert.deepEqual(await snapshot(db,id),before);
  }
  await assert.rejects(rpc(db,"autotype_record_round",[id,randomUUID(),"classic",20,1,0,1,2,0,250,false]),/challenge/);
});
test("each competitive mode saves an authorized completion once and permits exact retry",async()=>{
  const id=await user(db);
  for(const mode of ["classic","context","evil","daily","sentence"]){
    const ch=await challenge(db,id,mode),args=metrics(id,ch);
    const name=mode==="sentence"?"autotype_record_sentence_round":"autotype_record_verified_round";
    if(mode==="sentence")args.push(0,0);
    const result=await rpc(db,name,args);
    assert.equal(result.outcome,"verified");assert.equal(result.verified,true);
    const saved=await snapshot(db,id),retry=await rpc(db,name,args);
    assert.equal(retry.duplicate,true);assert.equal(retry.coins_earned,0);
    assert.deepEqual(await snapshot(db,id),saved);
    const changed=[...args];changed[4]+=5;
    await assert.rejects(rpc(db,name,changed),/already bound/);
    const newId=[...args];newId[2]=randomUUID();
    await assert.rejects(rpc(db,name,newId),/no longer active/);
  }
});
test("empty, fabricated, null, expired, foreign and arbitrary challenges cannot mint rewards",async()=>{
  const id=await user(db),other=await user(db),ch=await challenge(db,id),args=metrics(id,ch);
  const original=await snapshot(db,id);
  for(const [index,value] of [[4,1000000],[5,0],[4,21],[8,null],[7,200],[1,randomUUID()],[0,other]]){
    const forged=[...args];forged[index]=value;
    await assert.rejects(rpc(db,"autotype_record_verified_round",forged));
    assert.deepEqual(await snapshot(db,id),original);
  }
  await db.query("update public.round_challenges set expires_at=now()-interval '1 second' where id=$1",[ch.challenge_id]);
  await assert.rejects(rpc(db,"autotype_record_verified_round",args),/expired/);
  assert.deepEqual(await snapshot(db,id),original);
});
test("concurrently scheduled retries produce one reward transaction",async()=>{
  const id=await user(db),ch=await challenge(db,id),args=metrics(id,ch);
  const results=await Promise.all(Array.from({length:8},()=>rpc(db,"autotype_record_verified_round",args)));
  assert.equal(results.filter(r=>!r.duplicate).length,1);
  assert.equal(Number((await snapshot(db,id)).stats.rounds),1);
});
test("browser roles cannot invoke reward-writing RPCs",async()=>{
  const id=await user(db),ch=await challenge(db,id),args=metrics(id,ch);
  for(const role of ["anon","authenticated"]){
    await db.exec("set role "+role);
    try{await assert.rejects(rpc(db,"autotype_record_verified_round",args),/permission denied/)}
    finally{await db.exec("reset role")}
  }
});
test("gateway validates user and practice never calls reward SQL",async()=>{
  const calls=[],dbMock={auth:{getUser:async()=>({data:{user:{id:randomUUID()}},error:null})},
    rpc:async(name,args)=>{if(name==='autotype_maintenance_status')return {data:false};calls.push({name,args});return {data:{verified:true},error:null}}};
  const handler=edge("supabase/functions/game-api/index.ts",{createClient:()=>dbMock});
  for(const mode of ["custom","race","npc"]){
    const response=await handler(request({action:"round_complete",payload:{mode,words:0,score:1000000}}));
    assert.equal((await response.json()).outcome,"practice");
  }
  assert.equal(calls.length,0);
  assert.equal((await handler(request({action:"round_complete",payload:{mode:"classic"}}))).status,400);
  assert.equal((await handler(request({},{}))).status,401);
});
test("frontend distinguishes confirmed, unverified, practice and failed saves",()=>{
  const context={window:{}};vm.runInNewContext(read("progression-feedback.js"),context);
  const outcome=context.window.AutoTypeProgression.outcome;
  assert.equal(outcome({verified:true}).state,"verified");
  assert.equal(outcome({verified:false}).state,"unverified");
  assert.equal(outcome({outcome:"practice"}).state,"practice");
  assert.equal(outcome(null,{failed:true}).state,"failed_save");
  assert.equal(outcome({outcome:"practice"}).rewarded,false);
});

test("perfect-round scores must match streak and one-clue reporting",async()=>{
 const id=await user(db),ch=await challenge(db,id),args=metrics(id,ch),original=await snapshot(db,id);
 for(const forged of [[...args.slice(0,4),args[4]+5,...args.slice(5)],metrics(id,ch,{oneClue:true})]){
  await assert.rejects(rpc(db,"autotype_record_verified_round",forged),/streak and clue/);
  assert.deepEqual(await snapshot(db,id),original);
 }
 const valid=metrics(id,ch,{score:args[4]+100,oneClue:true});assert.equal((await rpc(db,"autotype_record_verified_round",valid)).verified,true);
});

test("score cannot claim too few keys and valid Sentence phrase metrics retain reduced scoring",async()=>{
 const id=await user(db),ch=await challenge(db,id),args=metrics(id,ch);args[8]=ch.target_text.trim().split(/\s+/).length*2;
 await assert.rejects(rpc(db,"autotype_record_verified_round",args),/Key count does not match/);
 const sentence=await challenge(db,id,"sentence"),n=sentence.target_text.trim().split(/\s+/).length;
 const phrase=metrics(id,sentence,{oneClue:true});phrase[4]+=100;phrase[8]=3;phrase.push(n-1,1);
 assert.equal((await rpc(db,"autotype_record_sentence_round",phrase)).verified,true);
});
