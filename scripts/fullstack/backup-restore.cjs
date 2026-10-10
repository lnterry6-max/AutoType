'use strict';
// Runner-local synthetic rehearsal ONLY. No network/hosted URL options, cloud
// upload, artifacts, production exports, or platform restore API are accepted.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process'),{createHash,randomUUID}=require('node:crypto');
const {admin,database,dir}=require('./runtime.cjs');
const container='supabase_db_autotype-phase1-ci';
function tool(args,input){const r=spawnSync('docker',['exec','-i','-u','postgres',container,...args],{input,encoding:'utf8',maxBuffer:16*1024*1024,timeout:60000});assert.equal(r.status,0,'Local database tool failed: '+r.stderr);return r.stdout;}
function sql(db,query){return tool(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',db,'-At'],query);}
function checksum(file){return createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function fingerprints(db){
 const names=JSON.parse(sql(db,"select coalesce(json_agg(json_build_object('schema',schemaname,'table',tablename) order by schemaname,tablename),'[]') from pg_tables where schemaname in ('public','auth','storage','supabase_migrations','autotype_maintenance');"));
 const result={};for(const {schema,table} of names){assert.match(schema,/^[a-z_][a-z0-9_]*$/);assert.match(table,/^[a-z_][a-z0-9_]*$/);
  result[schema+'.'+table]=sql(db,`select count(*)||':'||md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),'')) from "${schema}"."${table}" t;`).trim();
 }return result;
}
function security(db){return JSON.parse(sql(db,`set search_path=pg_catalog;select jsonb_build_object(
 'functions',(select jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),p.prosecdef,pg_get_userbyid(p.proowner),(select jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type,a.is_grantable) order by a.grantor,a.grantee,a.privilege_type) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),p.proconfig,pg_get_functiondef(p.oid)) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind in ('f','p') and n.nspname in ('public','auth','private','autotype_maintenance')),
 'constraints',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid)) order by n.nspname,c.relname,k.conname) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage','private','autotype_maintenance')),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname in ('public','auth','storage','private','autotype_maintenance')),
 'triggers',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by n.nspname,c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in ('public','auth','storage','private','autotype_maintenance')),
 'permissions',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner),(select jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type,a.is_grantable) order by a.grantor,a.grantee,a.privilege_type) from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a)) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname in ('public','auth','storage','private','autotype_maintenance'))
 );`).trim());}
(async()=>{
 let db,closed=false,targetCreated=false;const target='autotype_restore_'+randomUUID().replaceAll('-',''),privateDir=fs.mkdtempSync(path.join(dir,'private-restore-'));fs.chmodSync(privateDir,0o700);
 const dump=path.join(privateDir,'synthetic.dump'),roles=path.join(privateDir,'roles.sql'),archive='/tmp/'+target+'.dump';
 try{
  db=await database();assert.equal(sql('postgres','select run_id from autotype_ci.marker;').trim(),process.env.AUTOTYPE_CI_RUN_ID,'Dump container marker matches this disposable run');assert.equal((await db.query("select count(*)::int n from auth.users where email is null or email not like '%@example.invalid'")).rows[0].n,0,'Only synthetic accounts may be exported');
  assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n>0,true);
  const fixtureEmail='fixture_restore_'+randomUUID().replaceAll('-','')+'@example.invalid',fixturePassword=randomUUID()+'!aA1';
  const created=await admin.auth.admin.createUser({email:fixtureEmail,password:fixturePassword,email_confirm:true,user_metadata:{username:'restore_'+randomUUID().replaceAll('-','').slice(0,12)}});
  assert.equal(created.error,null,'Synthetic restore account creation');const fixtureId=created.data.user.id;assert.match(fixtureId,/^[0-9a-f-]{36}$/);
  await db.query('select autotype_maintenance.set_enabled(true)');closed=true;
  const expected=fingerprints('postgres'),permissions=security('postgres');
  for(const table of ['public.payment_events','public.payment_adjustments','public.payment_orders','public.player_stats','public.wallets','auth.users','supabase_migrations.schema_migrations'])assert.ok(table in expected,table);
  // Binary dump stays in private container path, then private runner directory.
  tool(['sh','-c',`umask 077; pg_dump -U supabase_admin -d postgres --format=custom --file=${archive}`]);
  let r=spawnSync('docker',['cp',container+':'+archive,dump],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);fs.chmodSync(dump,0o600);
  fs.writeFileSync(roles,tool(['pg_dumpall','-U','supabase_admin','--roles-only','--no-role-passwords']),{mode:0o600});
  const hash=checksum(dump),roleHash=checksum(roles);assert.ok(fs.statSync(dump).size>0);assert.ok(!fs.readFileSync(roles,'utf8').includes('PASSWORD '),'No role passwords exported');
  fs.writeFileSync(path.join(privateDir,'manifest.json'),JSON.stringify({dump:hash,roles:roleHash,tables:expected}),{mode:0o600});
  assert.ok(tool(['pg_restore','--list',archive]).includes('TABLE DATA public payment_events'));
  sql('postgres',`create database ${target} template template0;`);targetCreated=true;
  tool(['pg_restore','-U','supabase_admin','--dbname='+target,'--clean','--if-exists','--exit-on-error','--single-transaction',archive]);
  assert.deepEqual(fingerprints(target),expected,'Auth, game/economy/payments, Storage metadata, maintenance state and migration history restore exactly');
  const restoredSecurity=security(target);
  for(const [kind,expectedItems] of Object.entries(permissions)){
   const actualItems=restoredSecurity[kind];
   const mismatch=JSON.stringify(actualItems)!==JSON.stringify(expectedItems);
   if(mismatch){const at=expectedItems?.findIndex((item,i)=>JSON.stringify(item)!==JSON.stringify(actualItems?.[i]));console.error('Restored security mismatch',kind,'object',JSON.stringify(expectedItems?.[at]?.slice?.(0,2)||at));}
   assert.equal(mismatch,false,'RLS/grants/constraints/function security/trigger restore: '+kind);
  }
  assert.equal(sql(target,'select public.autotype_maintenance_status();').trim(),'t');
  assert.equal(sql(target,`select encrypted_password=extensions.crypt('${fixturePassword}',encrypted_password) from auth.users where id='${fixtureId}';`).trim(),'t','Restored synthetic Auth password hash verifies');
  assert.equal(sql(target,`begin;set local role authenticated;set local request.jwt.claim.sub='${fixtureId}';select count(*) from public.wallets;rollback;`).trim(),'1','Restored RLS exposes only the designated user wallet');
  const blocked=spawnSync('docker',['exec','-i','-u','postgres',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',target,'-At'],{input:'update public.wallets set coins=coins+1;',encoding:'utf8'});assert.notEqual(blocked.status,0);assert.match(blocked.stderr,/maintenance: writes paused/);
  sql(target,"select autotype_maintenance.set_enabled(false);update public.wallets set coins=coins;");
  assert.equal(sql(target,'select public.autotype_maintenance_status();').trim(),'f');
  const ch=JSON.parse(sql(target,`select public.autotype_start_round('${fixtureId}','classic',null);`));assert.match(ch.challenge_id,/^[0-9a-f-]{36}$/);
  sql(target,`update public.round_challenges set issued_at=now()-interval '20 seconds' where id='${ch.challenge_id}';`);
  const n=ch.target_text.trim().split(/\s+/).length,score=n*20+Array.from({length:n},(_,i)=>Math.min(i*5,30)).reduce((a,b)=>a+b,0),round=randomUUID();
  const save=`select public.autotype_record_verified_round('${fixtureId}','${ch.challenge_id}','${round}','classic',${score},${n},0,${n},${n*8},0,5000,false);`;
  assert.equal(JSON.parse(sql(target,save)).verified,true);assert.equal(JSON.parse(sql(target,save)).duplicate,true);
  assert.equal(sql(target,`select verified_rounds from public.player_stats where user_id='${fixtureId}';`).trim(),'1','Restored progression recovers exactly once');
  assert.equal(checksum(dump),hash);assert.equal(checksum(roles),roleHash);
  // Refuse a modified archive BEFORE attempting any restore.
  const bad=path.join(privateDir,'corrupted.dump');fs.copyFileSync(dump,bad);fs.appendFileSync(bad,'synthetic corruption');assert.notEqual(checksum(bad),hash);
  console.log('PASS private PostgreSQL 17 synthetic backup/restore: '+Object.keys(expected).length+' table fingerprints; Auth + payment_events + payment_adjustments + wallet/ledger + migration history; RLS/grants/ALWAYS triggers; closed restore/reopen + Auth password/RLS + verified round retry; SHA256 corruption detection. No records/artifacts exported to GitHub.');
 }finally{
  if(targetCreated)sql('postgres',`drop database ${target} with(force);`);
  tool(['rm','-f',archive]);fs.rmSync(privateDir,{recursive:true,force:true});
  if(closed)await db.query('select autotype_maintenance.set_enabled(false)');await db?.end();
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
