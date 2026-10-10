"use strict";
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {database,user,rpc,snapshot,edge,request,randomUUID}=require('./phase1-test-helpers.cjs');
let db;
before(async()=>{db=await database()});after(async()=>{await db?.close()});
async function race(status='waiting',kind='friend'){
 const a=await user(db),b=await user(db),id=randomUUID();
 await db.query("insert into race_rooms(id,host_id,mode,target_text,status,match_type,created_at) values($1,$2,'context','one two three four',$3,$4,now()-interval '1 minute')",[id,a,status,kind]);
 await db.query('insert into race_players(race_id,user_id) values($1,$2),($1,$3)',[id,a,b]);
 return {id,a,b};
}
const finish=(r,id,score=110,time=5000,errors=0)=>rpc(db,'autotype_submit_race_result',[id,r.id,score,time,errors,0]);
test('cancelled/countdown/missing/invalid races reject without saving',async()=>{
 for(const status of ['cancelled','countdown']){const r=await race(status);await assert.rejects(finish(r,r.a),/not accepting/)}
 const r=await race();await assert.rejects(finish(r,await user(db)),/not in/);
 for(const [score,time,errors] of [[0,5000,0],[100000,5000,0],[81,5000,0],[80,1,0],[80,5000,-1]])await assert.rejects(finish(r,r.a,score,time,errors));
 await assert.rejects(finish({...r,id:randomUUID()},r.a),/not found/);
 assert.equal((await db.query('select finished_at from race_players where race_id=$1 and user_id=$2',[r.id,r.a])).rows[0].finished_at,null);
});
test('friend and quick-match results are immutable and exact retries are idempotent',async()=>{
 for(const kind of ['friend','matchmaking']){
 const r=await race('waiting',kind),initial=await snapshot(db,r.a);
 assert.equal((await finish(r,r.a)).finished,false);
 assert.equal((await finish(r,r.a)).duplicate,true);
 await assert.rejects(finish(r,r.a,130),/already finalized/);
 const done=await finish(r,r.b,130);assert.equal(done.winnerId,r.b);assert.equal(done.finished,true);
 assert.equal((await finish(r,r.a)).duplicate,true);
 assert.deepEqual(await snapshot(db,r.a),initial);
 // Reconnect reads the receipt, including all metrics needed for an exact retry.
 const mine=(await db.query('select * from race_players where race_id=$1 and user_id=$2',[r.id,r.a])).rows[0];
 assert.equal((await rpc(db,'autotype_submit_race_result',[r.a,r.id,Number(mine.score),mine.duration_ms,mine.errors,mine.erased])).duplicate,true);
 }
});
test('simultaneously scheduled finishes and retries yield one stable winner or tie',async()=>{
 for(const [otherTime,otherErrors,winner] of [[5000,0,'tie'],[5001,0,'a'],[5000,1,'a'],[4999,0,'b']]){
 const r=await race();await Promise.all([finish(r,r.a),finish(r,r.b,110,otherTime,otherErrors),finish(r,r.a)]);
 const row=(await db.query('select * from race_rooms where id=$1',[r.id])).rows[0];
 assert.equal(row.status,'finished');assert.equal(row.winner_id,winner==='tie'?null:r[winner]);
 }
});
test('friend race creation and participant insertion are one authorized transaction',async()=>{
 const a=await user(db),b=await user(db);await assert.rejects(rpc(db,'autotype_create_friend_race',[a,b]),/friend/);
 await db.query('insert into friendships(user_a,user_b) values(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid))',[a,b]);
 const room=await rpc(db,'autotype_create_friend_race',[a,b]);
 assert.equal((await db.query('select count(*)::int as n from race_players where race_id=$1',[room.id])).rows[0].n,2);
 await db.exec('set role authenticated');try{await assert.rejects(finish({id:room.id},a),/permission denied/)}finally{await db.exec('reset role')}
});
test('gateway derives participant from authentication and rejects fractional metrics',async()=>{
 const a=randomUUID(),calls=[];
 const handler=edge('supabase/functions/game-api/index.ts',{createClient:()=>({auth:{getUser:async()=>({data:{user:{id:a}}})},rpc:async(name,args)=>{if(name==='autotype_begin_operation')return {data:randomUUID()};if(name==='autotype_end_operation')return {};calls.push({name,args});return {data:{saved:true}}}})});
 assert.equal((await handler(request({action:'submit_race_result',payload:{raceId:randomUUID(),userId:randomUUID(),score:80,durationMs:5000,errors:0,erased:0}}))).status,200);
 assert.equal(calls[0].args.p_user,a);
 assert.equal((await handler(request({action:'submit_race_result',payload:{score:80,durationMs:5000.5,errors:0,erased:0}}))).status,400);
 assert.equal(calls.length,1);
});
