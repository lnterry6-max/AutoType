"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {read,randomUUID,database,user,rpc,snapshot}=require('./phase1-test-helpers.cjs');
async function gameFixture({saved=false,failFirst=false,mode=null,backend={}}={}){
 const nodes=new Map(),calls=[],listeners={},id=randomUUID(),raceId=randomUUID();let clock=0;
 class Node{
  constructor(){this.handlers={};this.children=[];this.dataset={};this.style={setProperty(){}};this.hidden=false;
   const names=new Set();this.classList={add:(...v)=>v.forEach(x=>names.add(x)),remove:(...v)=>v.forEach(x=>names.delete(x)),contains:v=>names.has(v),toggle:(v,on)=>on?names.add(v):names.delete(v)};}
  addEventListener(name,fn){this.handlers[name]=fn}append(...v){this.children.push(...v)}blur(){}focus(){}closest(){return null}querySelector(){return new Node()}setAttribute(){}
 }
 const get=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id)};
 const document={getElementById:get,createElement:()=>new Node(),body:new Node(),documentElement:new Node(),querySelector:()=>new Node(),addEventListener:(n,fn)=>listeners[n]=fn};
 const room={id:raceId,mode:'classic',match_type:'friend',target_text:'zulu',status:saved?'finished':'running',winner_id:id,
 players:[{user_id:id,score:120,duration_ms:5000,errors:0,erased:0,finished_at:saved?'2026-10-09T00:00:00Z':null},{user_id:randomUUID(),profile:{display_name:'Opponent'}}]};
 const account={online:true,supabaseUserId:id},profile={};
 const AutoType={achievementDefs:[],ready:async()=>{},store:()=>({suggestions:[]}),currentAccount:()=>account,currentSettings:()=>({animations:false}),currentProfile:()=>profile,
 levelInfo:()=>({xp:100,level:1}),escapeHTML:s=>String(s),formatTime:ms=>String(ms),toast:()=>{}};
 const AutoTypeBackend={predictionsSnapshot:async()=>({suggestions:[{prefix:'z',word:'zulu'}],votes:[]}),raceById:async()=>room,
 recordRound:async()=>{throw Error('race must not mint rewards')},submitRaceResult:async(r,p)=>{
  calls.push({r,p:{...p}});if(failFirst&&calls.length===1)throw Error('fixture disconnected');room.status='finished';return {saved:true};
 }};
 Object.assign(AutoTypeBackend,backend);
 const window={addEventListener(){},matchMedia:()=>({matches:false})};
 const context={window,document,location:{search:mode?'?mode='+mode+'&sentence=zulu':'?race='+raceId},AutoType,AutoTypeBackend,URLSearchParams,crypto:globalThis.crypto,
 console:{warn(){},error(){}},Date:{now:()=>clock},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},matchMedia:window.matchMedia,
 AutoTypePredictionPicker:{choose:({target})=>target},AutoTypeDailyMix:{plan:()=>[],isComplete:()=>false}};
 vm.runInNewContext(read('progression-feedback.js'),context);context.AutoTypeProgression=window.AutoTypeProgression;
 await vm.runInNewContext(read('game.js'),context);
 return {get,calls,listeners,room,profile,advance:()=>clock=5000};
}
test('reconnecting to a saved race restores receipt and disables mobile/replay controls',async()=>{
 const f=await gameFixture({saved:true});
 assert.equal(f.get('results').hidden,false);assert.equal(f.get('resultScore').textContent,120);
 assert.equal(f.get('resultTime').textContent,'5000');assert.equal(f.get('verifiedResult').dataset.outcome,'practice');
 assert.equal(f.get('mobileGameControls').hidden,true);assert.equal(f.get('restartBtn').disabled,true);
 assert.equal(f.get('wordCount').textContent,'1 / 1');assert.equal(f.calls.length,0);
});
test('failed race save retries identical completion and never invokes account reward path',async()=>{
 const f=await gameFixture({failFirst:true}),event=key=>({key,preventDefault(){},target:{closest:()=>null}});
 f.listeners.keydown(event('z'));f.advance();f.listeners.keydown(event(' '));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.get('verifiedResult').dataset.outcome,'failed_save');assert.equal(f.get('restartBtn').disabled,true);
 const retry=f.get('results').children.find(x=>x.textContent==='Retry race save');assert.equal(retry.hidden,false);
 await retry.handlers.click();
 assert.equal(f.calls.length,2);assert.deepEqual(f.calls[0],f.calls[1]);assert.equal(Number.isInteger(f.calls[0].p.durationMs),true);
 assert.equal(f.get('verifiedResult').dataset.outcome,'practice');assert.equal(retry.hidden,true);
});

test('actual keyboard completion in all competitive modes saves verified SQL results',async()=>{
 const db=await database();
 try{for(const mode of ['classic','context','sentence','evil','daily']){
  const id=await user(db),ch=await rpc(db,'autotype_start_round',[id,mode,null]);
  await db.query("update round_challenges set target_text='zulu',target_words=1,issued_at=now()-interval '20 seconds' where id=$1",[ch.challenge_id]);ch.target_text='zulu';
  let receipt;
  const f=await gameFixture({mode,backend:{startRound:async()=>ch,hydrateLocalMirror:async()=>{},recordRound:async p=>{
   const args=[id,p.challengeId,p.roundId,p.mode,p.score,p.words,p.erased,p.maxStreak,p.totalKeys,p.errors,p.durationMs,p.oneClue];
   if(mode==='sentence')args.push(p.sentencePhraseWords,p.sentencePhraseActions);
   receipt=await rpc(db,mode==='sentence'?'autotype_record_sentence_round':'autotype_record_verified_round',args);return receipt;
  }}});
  const event=key=>({key,preventDefault(){},target:{closest:()=>null}});
  f.listeners.keydown(event('z'));f.advance();f.listeners.keydown(event(' '));
  // Finish intentionally saves asynchronously from the real key handler.
  for(let i=0;i<30&&!receipt;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(receipt?.verified,true,mode);assert.equal(f.get('verifiedResult').dataset.outcome,'verified');
  assert.equal(Number((await snapshot(db,id)).stats.rounds),1);
 }}finally{await db.close()}
});

test('online Custom and NPC keyboard completions remain practice without account mutation',async()=>{
 for(const mode of ['custom','npc']){
 const f=await gameFixture({mode}),words=[...f.get('target').innerHTML.matchAll(/>([^<]+)<\/span>/g)].map(m=>m[1]);
 const event=key=>({key,preventDefault(){},target:{closest:()=>null}});
 for(const word of words){f.listeners.keydown(event(word[0]));f.advance();f.listeners.keydown(event(' '));}
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.get('verifiedResult').dataset.outcome,'practice',mode);assert.deepEqual(f.profile,{});assert.equal(f.calls.length,0);
 }
});
test('actual round UI never presents an unknown or failed backend response as verified rewards',async()=>{
 for(const failure of [false,true]){
 const f=await gameFixture({mode:'classic',backend:{startRound:async()=>({target_text:'zulu',challenge_id:randomUUID()}),hydrateLocalMirror:async()=>{},recordRound:async()=>{
  if(failure)throw Error('fixture save outage');return {verified:false};
 }}});
 const event=key=>({key,preventDefault(){},target:{closest:()=>null}});
 f.listeners.keydown(event('z'));f.advance();f.listeners.keydown(event(' '));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.get('verifiedResult').dataset.outcome,failure?'failed_save':'unverified');
 assert.equal(f.get('resultCoins').textContent,failure?'Save failed':'Unconfirmed');
 }
});
