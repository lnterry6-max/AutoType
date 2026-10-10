'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Client}=require('pg'),{createClient}=require('@supabase/supabase-js');
assert.equal(process.env.GITHUB_ACTIONS,'true','Disposable runner only');
const dir=fs.realpathSync(process.env.AUTOTYPE_STACK_DIR);
assert.ok(dir.startsWith(fs.realpathSync(process.env.RUNNER_TEMP)+path.sep));
assert.ok(path.basename(dir).startsWith('autotype-fullstack-'));
const status=JSON.parse(fs.readFileSync(path.join(dir,'status.json'),'utf8'));
const url='http://127.0.0.1:54321';
const dburl=new URL(status.DB_URL);assert.ok(['127.0.0.1','localhost'].includes(dburl.hostname));assert.equal(dburl.port,'54322');
const connection={host:'127.0.0.1',port:54322,user:'postgres',database:'postgres',password:decodeURIComponent(dburl.password),connectionTimeoutMillis:5000};
function client(key=status.ANON_KEY,token){return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:token?{headers:{Authorization:'Bearer '+token}}:{}})}
const admin=client(status.SERVICE_ROLE_KEY);
async function database(){const db=new Client(connection);await db.connect();await db.query("set statement_timeout='10s'; set lock_timeout='5s'");const marker=await db.query('select run_id from autotype_ci.marker');assert.equal(marker.rows[0]?.run_id,process.env.AUTOTYPE_CI_RUN_ID);assert.equal(Number((await db.query('show server_version_num')).rows[0].server_version_num)>=170000,true);assert.equal(Number((await db.query('show server_version_num')).rows[0].server_version_num)<180000,true);return db;}
module.exports={status,url,dir,admin,client,database};
