import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,extname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const chrome=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser']
 .find(x=>x&&existsSync(x))||spawnSync('which',['google-chrome'],{encoding:'utf8'}).stdout.trim();
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json',
 '.svg':'image/svg+xml','.png':'image/png'};
async function waitFor(fn,label,timeout=15000){
 const stop=Date.now()+timeout;
 while(Date.now()<stop){try{if(await fn())return;}catch{}await sleep(125);}
 throw Error('Timed out: '+label);
}

test('real-browser iOS-like menu gestures and responsive layout',{timeout:85000},async()=>{
 assert.ok(chrome,'Chrome/Chromium is installed');
 const server=createServer((req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=resolve(root,'.'+(path==='/'?'/index.html':path));
  if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}
  try{res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream'});res.end(readFileSync(file));}
  catch{res.writeHead(404);res.end();}
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const port=server.address().port,debugPort=29297;
 const profile=mkdtempSync(join(tmpdir(),'tane-browser-'));
 const browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu',
  '--disable-dev-shm-usage','--remote-allow-origins=*','--remote-debugging-port='+debugPort,
  '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 let socket=null,seq=0;const pending=new Map(),exceptions=[];
 try{
  let target=null;
  await waitFor(async()=>{
   const res=await fetch('http://127.0.0.1:'+debugPort+'/json');
   target=(await res.json()).find(x=>x.type==='page');
   return !!target;
  },'Chrome CDP');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((yes,no)=>{
   socket.addEventListener('open',yes,{once:true});
   socket.addEventListener('error',no,{once:true});
  });
  socket.addEventListener('message',e=>{
   const msg=JSON.parse(String(e.data));
   if(msg.method==='Runtime.exceptionThrown')exceptions.push(msg.params.exceptionDetails?.text||'Uncaught script exception');
   if(!msg.id)return;
   const p=pending.get(msg.id);if(!p)return;pending.delete(msg.id);
   if(msg.error)p.reject(Error(JSON.stringify(msg.error)));else p.resolve(msg.result);
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
   const id=++seq;pending.set(id,{resolve,reject});
   socket.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async expression=>{
   const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
   if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
   return r.result.value;
  };
  await send('Page.enable');await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/index.html'});
  await waitFor(()=>evaluate("document.readyState==='complete'"),'first page load');
  const fixture={version:2,nodes:[
   {id:'fixture-root',text:'庭をつくる',parent:null,order:0},
   {id:'fixture-child',text:'土を整える',parent:'fixture-root',order:0}
  ],ideas:[]};
  await evaluate('localStorage.setItem("tane.v1",'+JSON.stringify(JSON.stringify(fixture))+');'+
   'localStorage.setItem("tane.theme","fixture-root")');
  // Reload would trigger the app's pagehide autosave and erase the injected fixture.
  await evaluate('loadAll();S.theme="fixture-root";render()');
  try{
   await waitFor(()=>evaluate('document.querySelectorAll("[data-node]").length===2'),'seeded tree');
  }catch(error){
   const diagnostic=await evaluate('({url:location.href,count:document.querySelectorAll("[data-node]").length,main:document.querySelector("#main")?.innerText.slice(0,600),nodes:typeof S==="undefined"?"undefined":S.nodes.size,theme:typeof S==="undefined"?"undefined":S.theme,local:localStorage.getItem("tane.v1")?.slice(0,300)})').catch(e=>String(e));
   console.error('SEED DIAGNOSTIC:',JSON.stringify({diagnostic,exceptions}));
   throw error;
  }
  assert.equal(await evaluate('document.querySelectorAll(".node-stack .actions").length'),0);
  mkdirSync(join(root,'test-artifacts'),{recursive:true});
  writeFileSync(join(root,'test-artifacts','tree-default-mobile.png'),
   Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evaluate('document.querySelector("[data-node]").click()');
  assert.equal(await evaluate('treeCtxOpen()'),false);
  assert.equal(await evaluate('document.querySelector("#sheet").classList.contains("open")'),true);
  await evaluate('openSheet(false)');
  await evaluate('document.querySelector("[data-node-menu]").click()');
  assert.equal(await evaluate('treeCtxOpen()'),true);
  assert.ok((await evaluate('[...document.querySelectorAll("#treeCtxCommands .act")].some(b=>b.textContent.includes("追加"))')));
  await sleep(340);
  const shape=await evaluate('(()=>{const r=document.querySelector("#treeCtxStage").getBoundingClientRect(),s=getComputedStyle(document.querySelector("#treeCtx"));return [r.left,r.top,r.right,r.bottom,innerWidth,innerHeight,s.backdropFilter||s.webkitBackdropFilter]})()');
  assert.ok(shape[0]>=-2&&shape[1]>=-2&&shape[2]<=shape[4]+2&&shape[3]<=shape[5]+2,'within viewport');
  assert.match(shape[6],/blur/);
  const dir=join(root,'test-artifacts');mkdirSync(dir,{recursive:true});
  let screenshot=await send('Page.captureScreenshot',{format:'png'});
  writeFileSync(join(dir,'tree-menu-mobile.png'),Buffer.from(screenshot.data,'base64'));
  await evaluate('treeCtxClose()');
  const center=()=>evaluate('(()=>{const r=document.querySelector("[data-node]").getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()');
  const start=async()=>{const p=await center();await send('Input.dispatchTouchEvent',
   {type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:1}]});return p;};
  const finish=()=>send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  let p=await start();await sleep(85);
  await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x,y:p.y+70,id:1}]});
  await sleep(615);assert.equal(await evaluate('treeCtxOpen()'),false,'scroll cancels press');await finish();
  await start();await sleep(670);
  assert.equal(await evaluate('treeCtxOpen()'),true,'hold opens menu');
  await finish();assert.equal(await evaluate('treeCtxOpen()'),true,'release retains menu');
  await evaluate('treeCtxClose()');
  await start();await sleep(650);
  const hit=await evaluate('(()=>{const r=document.querySelector("#chooseAdd").getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()');
  await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:hit.x,y:hit.y,id:1}]});
  await sleep(80);await finish();await sleep(80);
  assert.equal(await evaluate('S.adding?.mode'),'choose','drag release selects an action');
  assert.equal(await evaluate('document.querySelector("#treeCtxCommands").classList.contains("is-submenu")'),true);
  // Touch-initiated submenu should not show a large keyboard focus outline.
  assert.equal(await evaluate('document.activeElement?.id'),'treeCtxStage');
  assert.equal(await evaluate('getComputedStyle(document.querySelector("#treeCtxStage")).outlineStyle'),'none');
  writeFileSync(join(dir,'tree-add-submenu.png'),
   Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  // Existing action-add workflow remains functional inside the floating menu.
  await evaluate('document.querySelector(\'[data-add="down"]\').click()');
  await evaluate('document.querySelector("#addIn").value="苗を植える";document.querySelector("#addForm").requestSubmit()');
  assert.equal(await evaluate('S.nodes.size'),3,'adding a child works from context menu');
  assert.equal(await evaluate('treeCtxOpen()'),true,'context remains open for repeated child entries');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  assert.equal(await evaluate('treeCtxOpen()'),false);
  assert.equal(await evaluate('document.documentElement.style.overflow'),'');
  assert.deepEqual(exceptions,[],'no uncaught exceptions');
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await evaluate('document.querySelector("[data-node-menu]").click()');
  await sleep(340);
  const desktop=await evaluate('(()=>{const r=document.querySelector("#treeCtxStage").getBoundingClientRect();return [r.left,r.top,r.right,r.bottom,innerWidth,innerHeight]})()');
  assert.ok(desktop[0]>=0&&desktop[1]>=0&&desktop[2]<=desktop[4]&&desktop[3]<=desktop[5]);
  screenshot=await send('Page.captureScreenshot',{format:'png'});
  writeFileSync(join(dir,'tree-menu-desktop.png'),Buffer.from(screenshot.data,'base64'));
  await evaluate('treeCtxClose()');
 }finally{
  if(socket)socket.close();
  browser.kill('SIGTERM');
  await sleep(550);
  try{rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});}catch{}
  await new Promise(ok=>server.close(ok));
 }
});
