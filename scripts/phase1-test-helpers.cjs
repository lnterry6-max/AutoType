"use strict";
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {randomUUID}=require("node:crypto");
const {PGlite}=require("@electric-sql/pglite");
const {citext}=require("@electric-sql/pglite/contrib/citext");
const {pgcrypto}=require("@electric-sql/pglite/contrib/pgcrypto");
const ts=require("typescript");
const root=path.resolve(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

// Always an in-memory PostgreSQL instance. No connection string or hosted
// credentials are accepted by this harness. Auth/Storage API schemas are stubs;
// application migrations, constraints, transactions, and permissions are real SQL.
async function database({beforeMigration}={}){
  const db=new PGlite({extensions:{citext,pgcrypto}});
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage; create schema extensions;
    set search_path=public,extensions;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),current_user::text) $$;
    grant usage on schema auth to anon,authenticated,service_role;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb);
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key,name text,bucket_id text,owner uuid);
    create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
    create function public.rls_auto_enable() returns event_trigger language plpgsql as $$begin end$$;
  `);
  await db.exec(read("supabase/bootstrap/001_backend_foundation.sql"));
  for(const file of fs.readdirSync(path.join(root,"supabase/migrations")).sort()){
    try{if(beforeMigration)await beforeMigration(db,file);await db.exec(read("supabase/migrations/"+file));}
    catch(error){throw new Error(file+": "+error.message,{cause:error});}
  }
  return db;
}
async function user(db,{developer=false}={}){
  const id=randomUUID(),username="fixture_"+id.replaceAll("-","").slice(0,12);
  await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
    [id,username+"@example.invalid",{username,display_name:username}]);
  if(developer)await db.query("update public.user_roles set role='developer' where user_id=$1",[id]);
  return id;
}
async function rpc(db,name,args){
  const slots=args.map((_,i)=>"$"+(i+1)).join(",");
  return (await db.query(`select public.${name}(${slots}) as result`,args)).rows[0].result;
}
async function challenge(db,id,mode="classic",tournament=null){
  const ch=await rpc(db,"autotype_start_round",[id,mode,tournament]);
  await db.query("update public.round_challenges set issued_at=now()-interval '20 seconds' where id=$1",[ch.challenge_id]);
  return ch;
}
function metrics(id,ch,{round=randomUUID(),score,words,...patch}={}){
  const n=words??ch.target_text.trim().split(/\s+/).length;
  const bonus=Array.from({length:n},(_,i)=>Math.min(i*5,30)).reduce((a,b)=>a+b,0);
  return [id,ch.challenge_id,round,ch.mode,score??n*20+bonus,n,0,patch.streak??n,n*8,patch.errors??0,5000,patch.oneClue??false];
}
async function snapshot(db,id){
  return (await db.query(`select jsonb_build_object('stats',to_jsonb(s),'wallet',to_jsonb(w),
    'achievements',(select jsonb_agg(a) from public.user_achievements a where a.user_id=$1)) as value
    from public.player_stats s join public.wallets w on s.user_id=w.user_id where s.user_id=$1`,[id])).rows[0].value;
}
function edge(file,globals){
  let handler;
  const source=read(file).replace(/^import .*;\r?\n/gm,"");
  const code=ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS});
  vm.runInNewContext(code,{console,Response,Request,URL,crypto:globalThis.crypto,
    Deno:{serve:fn=>handler=fn,env:{get:()=>"fixture"}},...globals});
  return handler;
}
function request(body,headers={Authorization:"Bearer fixture"}){
  return new Request("https://fixture.invalid",{method:"POST",headers:{"Content-Type":"application/json",...headers},body:JSON.stringify(body)});
}
module.exports={root,read,database,user,rpc,challenge,metrics,snapshot,edge,request,randomUUID};
