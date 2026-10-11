import {createServer} from 'node:http';
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {extname,join,resolve} from 'node:path';
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export const release=readFileSync(new URL('../sw.js',import.meta.url),'utf8').match(/tane-v(\d+)/)[1];
export async function browserHarness(root){
 const chrome=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(x=>x&&existsSync(x))||spawnSync('which',['google-chrome'],{encoding:'utf8'}).stdout.trim();
 if(!chrome)throw Error('Chrome/Chromium is required; this is not a skipped test');
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
 let rootRevision=null;
 const server=createServer((req,res)=>{
  let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),before=pathname.startsWith('/before/'),reference=pathname.startsWith('/reference/'),cleanup=pathname.startsWith('/cleanup/');
  if(before||reference||cleanup)pathname=pathname.slice(reference?10:cleanup?8:7);
  const filename=pathname==='/'?'index.html':pathname.slice(1);
  const file=resolve(root,filename);
  if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}
  const revision=reference?'143b85421784c0fa0a83683df7fba1f854e82d00':cleanup?'e6206b0fe0e4a04613166ca84cfeb1802612d362':before?'429845bdd3c91526e505a6f5b30760cb9bc6550d':rootRevision;
  try{const data=revision?execFileSync('git',['show',revision+':'+filename],{cwd:root,stdio:['ignore','pipe','ignore'],maxBuffer:5e6}):readFileSync(file);res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const profile=mkdtempSync(join(tmpdir(),'tane-qa-'));
 const browserProcess=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 const errors=[],pending=new Map();let socket,seq=0;
 try{
  const stop=Date.now()+15000;let target;
  while(Date.now()<stop){try{const port=Number(readFileSync(join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);target=(await(await fetch('http://127.0.0.1:'+port+'/json')).json()).find(t=>t.type==='page');if(target)break;}catch{}await sleep(100);}
  if(!target)throw Error('Chrome CDP did not start');
  socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
  socket.addEventListener('message',e=>{const m=JSON.parse(String(e.data));if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails?.exception?.description||m.params.exceptionDetails?.text);if(!m.id)return;const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const wait=async(fn,label)=>{const stop=Date.now()+10000;while(Date.now()<stop){try{if(await fn())return;}catch{}await sleep(60);}throw Error('Timed out: '+label);};
  await send('Page.enable');await send('Runtime.enable');
  return {send,evaluate,wait,errors,setRootRevision:ref=>{rootRevision=ref;},url:'http://127.0.0.1:'+server.address().port,close:async()=>{socket?.close();browserProcess.kill('SIGTERM');await sleep(300);rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});await new Promise(r=>server.close(r));}};
 }catch(e){socket?.close();browserProcess.kill('SIGTERM');server.close();throw e;}
}
