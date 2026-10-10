'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
let config='window.AUTOTYPE_SUPABASE={}; window.AUTOTYPE_FRIENDS_BETA=true;';
if(process.env.AUTOTYPE_BROWSER_STACK==='true'){
 const {status,url}=require('../fullstack/runtime.cjs');
 config='window.AUTOTYPE_SUPABASE='+JSON.stringify({url,publishableKey:status.ANON_KEY})+'; window.AUTOTYPE_FRIENDS_BETA=true;';
}
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json','.txt':'text/plain'};
http.createServer((req,res)=>{
 let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1:4173').pathname)}catch{res.writeHead(400).end();return}
 if(pathname==='/backend-config.js'){res.setHeader('Content-Type','text/javascript');res.end(config);return}
 if(pathname==='/__sdk.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(root,'node_modules/@supabase/supabase-js/dist/umd/supabase.js')));return}
 // Serve only public root assets. Never serve Git metadata, migrations, test files or local config.
 if(pathname.includes('..')||pathname.startsWith('/.')||pathname.split('/').length>2&&!pathname.startsWith('/assets/')){res.writeHead(404).end();return}
 let file=path.join(root,pathname==='/'?'index.html':pathname);
 if(!path.extname(file))file+='.html';
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end('Not found');return}
 const ext=path.extname(file);if(!types[ext]){res.writeHead(404).end();return}
 res.setHeader('Content-Type',types[ext]);res.setHeader('Cache-Control','no-store');
 let content=fs.readFileSync(file);if(ext==='.html')content=content.toString().replace('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2','/__sdk.js');
 res.end(content);
}).listen(4173,'127.0.0.1',()=>console.log('Synthetic browser server: http://127.0.0.1:4173'));
