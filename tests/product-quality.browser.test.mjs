import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {browserHarness,sleep} from './browser-harness.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
const fixture={version:2,nodes:[
 {id:'root',text:'家を借りる',parent:null,order:0},
 {id:'child',text:'暮らしに合う部屋を探す',parent:'root',order:0,tags:['選択肢を比べる'],seed:true,scores:{now:2}},
 {id:'leaf',text:'物件の写真と間取りを比較する',parent:'child',order:0},
 {id:'child2',text:'内見の日程を調整する',parent:'root',order:1},
 {id:'child3',text:'書類を集めて申し込む',parent:'root',order:2},
 {id:'root2',text:'移動する',parent:null,order:1},
 {id:'other',text:'路線と所要時間を比較する',parent:'root2',order:0,tags:['選択肢を比べる']}
],ideas:[]};

test('WCAG automated audit of both themes, screens and analysis states',{timeout:90000},async()=>{
 assert.ok(process.env.TANE_AXE_PATH,'axe-core must be installed; audit cannot silently skip');
 const axe=readFileSync(process.env.TANE_AXE_PATH,'utf8'),h=await browserHarness(root),{send,evaluate,wait}=h;
 const dir=resolve(root,'test-artifacts');mkdirSync(dir,{recursive:true});const findings=[];
 try{
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Page.navigate',{url:h.url+'/index.html'});await wait(()=>evaluate('document.readyState==="complete"&&typeof S!=="undefined"'),'load');await evaluate(axe);
  for(const theme of ['light','dark']){
   await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme},{name:'prefers-reduced-motion',value:'reduce'}]});
   for(const state of ['empty','first','tree','menu','res','tag','seed','etc','same','ranking','list','idea','data','paste']){
    await evaluate('if(treeCtxOpen())treeCtxClose(false);openSheet(false);S.themeStart=false;S.nodes.clear();S.ideas.clear();S.theme=null;S.sel=null;S.tab="tree";render()');
    if(state!=='empty'&&state!=='first')await evaluate('localStorage.setItem("tane.v1",'+JSON.stringify(JSON.stringify(fixture))+');loadAll();S.theme="root";render()');
    if(state==='first')await evaluate('document.querySelector("#startNewTheme").click()');
    if(state==='menu')await evaluate('document.querySelector(\'[data-node-menu="child"]\').click()');
    if(['res','tag','seed','etc'].includes(state))await evaluate('select("child",true);document.querySelector(\'[data-st="'+state+'"]\').click()');
    if(['same','ranking','list','idea','data','paste'].includes(state))await evaluate('S.tab='+JSON.stringify(state==='paste'?'data':['ranking','list'].includes(state)?'same':state)+';render()');
    if(state==='paste')await evaluate('document.querySelector("#imPasteOpen").click()');
    if(['ranking','list'].includes(state))await evaluate('document.querySelector(\'[data-same-view="'+state+'"]\').click()');
    await sleep(80);
    const result=await evaluate('axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]}}).then(r=>({violations:r.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,html:n.html,summary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,html:n.html,summary:n.failureSummary}))}))}))');findings.push({theme,state,...result});
   }
  }
  const failures=findings.filter(x=>x.violations.length);assert.equal(failures.length,0,'accessibility findings: '+JSON.stringify(failures.slice(0,2)));
 }finally{writeFileSync(resolve(dir,'accessibility-audit.json'),JSON.stringify(findings,null,2));await h.close();}
});

test('first observation needs no extra choice; AI remains optional; scoring has touch-sized targets',{timeout:30000},async()=>{
 const h=await browserHarness(root),{send,evaluate,wait}=h,dir=resolve(root,'test-artifacts');mkdirSync(dir,{recursive:true});
 const shot=async name=>writeFileSync(resolve(dir,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 try{
  await send('Emulation.setDeviceMetricsOverride',{width:320,height:844,deviceScaleFactor:1,mobile:true});
  await send('Page.navigate',{url:h.url+'/index.html'});await wait(()=>evaluate('document.readyState==="complete"&&typeof S!=="undefined"'),'load');
  await evaluate('document.querySelector("#startNewTheme").click()');
  assert.equal(await evaluate('document.querySelector("#startThemeForm").hidden'),false);
  assert.equal(await evaluate('document.querySelector("#themeAIActions").hidden'),true);
  await shot('flow-320-first-input');
  await evaluate('document.querySelector("#startThemeForm").requestSubmit()');assert.equal(await evaluate('S.nodes.size'),0,'empty observation is not saved');
  await evaluate('document.querySelector("#startThemeInput").focus()');await send('Input.insertText',{text:'家を借りる'});
  await evaluate('document.querySelector("#themeStartAI").click()');await shot('flow-320-first-ai');
  assert.equal(await evaluate('document.querySelector("#themeStartAI").getAttribute("aria-expanded")'),'true');
  assert.equal(await evaluate('document.querySelectorAll("#themeAIActions [data-ai-provider]").length'),2);
  assert.equal(await evaluate('document.querySelector("#startThemeInput").value'),'家を借りる');
  await evaluate('document.querySelector("#themeStartAI").click();document.querySelector("#startThemeForm").requestSubmit()');
  assert.equal(await evaluate('[...S.nodes.values()][0].text'),'家を借りる');
  await evaluate('saveNow()');await send('Page.reload');await wait(()=>evaluate('document.readyState==="complete"&&typeof S!=="undefined"'),'reload');
  assert.equal(await evaluate('S.nodes.size'),1);
  await evaluate('document.querySelector("[data-node]").click();document.querySelector(\'[data-st="seed"]\').click();document.querySelector("#d-seed").click()');await sleep(300);
  const sizes=await evaluate('[...document.querySelectorAll("#d-score button")].map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}))');
  assert.ok(sizes.every(x=>x.w>=44&&x.h>=44),'all scoring choices are 44×44');
  assert.ok(await evaluate('document.querySelector("#sheet").scrollWidth<=document.querySelector("#sheet").clientWidth+1'),'scores fit 320px');
  await shot('flow-320-touch-scores');assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('network settles faster, labels are interactive, filters and touch gestures keep working',{timeout:65000},async()=>{
 const h=await browserHarness(root),{send,evaluate,wait}=h,dir=resolve(root,'test-artifacts');mkdirSync(dir,{recursive:true});const timings=[];
 const shot=async name=>writeFileSync(resolve(dir,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 try{
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  for(const phase of ['before','after']){
   await send('Page.navigate',{url:h.url+(phase==='before'?'/before/index.html':'/index.html')});await sleep(150);await wait(()=>evaluate('document.readyState==="complete"&&typeof S!=="undefined"'),'load');
   await evaluate('localStorage.setItem("tane.v1",'+JSON.stringify(JSON.stringify(fixture))+');loadAll();netStop();netGraph=null;S.tab="same";window.qaStart=performance.now();render()');
   await sleep(420);await shot('graph-'+phase+'-420ms');
   await wait(()=>evaluate('!netGraph.fitOnSettle&&!netGraph.camTarget'),'graph settle');
   timings.push({phase,settleMs:await evaluate('performance.now()-qaStart'),labels:await evaluate('netLive.labels?.length??0')});await sleep(600);await shot('graph-'+phase+'-settled');
  }
  assert.ok(timings[1].settleMs<timings[0].settleMs*.8,'initial layout is materially faster: '+JSON.stringify(timings));
  assert.ok(await evaluate('netLive.labels.length>=5'),'sparse graph has readable names without a zoom gesture');
  const box=await evaluate('(()=>{const b=netLive.labels.find(b=>netGraph.nodes.get(b.id)?.source==="child"),r=netLive.canvas.getBoundingClientRect();return b&&{id:b.id,x:r.left+b.x+b.w/2,y:r.top+b.y+b.h/2}})()');assert.ok(box,'child has a visible label');
  const tap=async(x,y)=>{await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:0}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
  await tap(box.x,box.y);assert.equal(await evaluate('netGraph.selected'),box.id,'label is a touch target');await sleep(350);await shot('graph-after-selected');
  await evaluate('document.querySelector("#netLocalToggle").click()');assert.equal(await evaluate('netGraph.focus'),box.id);
  await evaluate('document.querySelector("#netLocalDismiss").click();document.querySelector("#netClose").click()');assert.equal(await evaluate('netGraph.focus'),null);
  await evaluate('const r=document.querySelector("#netRootFilter");r.value="root";r.dispatchEvent(new Event("change"));const t=document.querySelector("#netTagFilter");t.value="選択肢を比べる";t.dispatchEvent(new Event("change"))');
  assert.ok(await evaluate('document.querySelector("#netFilterStatus").textContent.startsWith("1行動が一致")'));
  await shot('graph-after-filter');await evaluate('document.querySelector("#netFilterClear").click()');
  const p=await evaluate('(()=>{const n=netGraph.nodes.get("action:child"),r=netLive.canvas.getBoundingClientRect();return {x:r.left+netGraph.cam.x+n.x*netGraph.cam.z,y:r.top+netGraph.cam.y+n.y*netGraph.cam.z,nx:n.x}})()');
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:0}]});await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x+32,y:p.y+15,id:0}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.notEqual(await evaluate('netGraph.nodes.get("action:child").x'),p.nx,'drag changes position');
  const z=await evaluate('netGraph.cam.z');
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:430,id:0},{x:230,y:430,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:100,y:430,id:0},{x:250,y:430,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok(await evaluate('netGraph.cam.z')>z,'pinch enlarges graph');
  const panX=await evaluate('netGraph.cam.x');
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:440,id:0},{x:230,y:440,id:1}]});
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{x:120,y:440,id:0}]});
  await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:145,y:440,id:0}]});
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.notEqual(await evaluate('netGraph.cam.x'),panX,'remaining finger continues panning');assert.equal(await evaluate('netGraph.selected'),null,'pinch release does not select a node');
  await evaluate('document.querySelector("#netFit").click()');await wait(()=>evaluate('!netGraph.camTarget'),'fit');
  await evaluate('netSelect("action:child",false);document.querySelector("#netAnalyze").click()');assert.equal(await evaluate('S.tab'),'tree');assert.equal(await evaluate('S.sel'),'child');
  await evaluate('openSheet(false);S.tab="same";render();document.querySelector(\'[data-same-view="ranking"]\').click();document.querySelector("[data-rank-open]").click()');await shot('graph-after-ranking');
  await evaluate('document.querySelector(\'[data-same-view="list"]\').click()');await shot('graph-after-list');assert.deepEqual(h.errors,[]);
 }finally{writeFileSync(resolve(dir,'network-timings.json'),JSON.stringify(timings,null,2));await h.close();}
});

test('backup preview, cancel, confirmed merge and file export preserve unrelated data',{timeout:35000},async()=>{
 const h=await browserHarness(root),{send,evaluate,wait}=h,dir=resolve(root,'test-artifacts');mkdirSync(dir,{recursive:true});const downloads=resolve(dir,'downloads');mkdirSync(downloads,{recursive:true});
 const shot=async name=>writeFileSync(resolve(dir,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 try{
  await send('Emulation.setDeviceMetricsOverride',{width:375,height:844,deviceScaleFactor:1,mobile:true});await send('Page.navigate',{url:h.url+'/index.html'});await wait(()=>evaluate('document.readyState==="complete"&&typeof S!=="undefined"'),'load');
  await evaluate('localStorage.setItem("tane.v1",'+JSON.stringify(JSON.stringify(fixture))+');loadAll();S.tab="data";render();document.querySelector("#imPasteOpen").click()');
  const initial=await evaluate('exportJSON()');
  await evaluate('document.querySelector("#imText").value="invalid JSON";document.querySelector("#imPasteGo").click()');
  assert.ok(await evaluate('document.querySelector("#imResult").textContent.includes("読み取れません")'));
  assert.equal(await evaluate('S.nodes.size'),7);
  const imported={version:3,nodes:[{id:'child',text:'生活の条件を整理して部屋を探す',parent:'root',order:0,tags:['暮らしを想像する']},{id:'new',text:'近隣の様子を歩いて確認する',parent:'child',order:0}],ideas:[{id:'newIdea',title:'暮らしを想像できる内見',status:'idea',sources:[{type:'node',id:'child'}]}]};
  const paste=()=>evaluate('document.querySelector("#imText").value='+JSON.stringify(JSON.stringify(imported))+';document.querySelector("#imPasteGo").click()');
  await paste();assert.equal(await evaluate('S.nodes.get("child").text'),'暮らしに合う部屋を探す','preview does not mutate');await shot('backup-375-review');
  await evaluate('document.querySelector("#cancelImport").click()');assert.equal(await evaluate('S.nodes.size'),7);assert.equal(await evaluate('S.ideas.size'),0);
  await paste();await evaluate('document.querySelector("#confirmImport").click()');assert.equal(await evaluate('S.nodes.size'),8);assert.equal(await evaluate('S.ideas.size'),1);
  assert.equal(await evaluate('S.nodes.get("root2").text'),'移動する','unrelated root remains');assert.equal(await evaluate('S.nodes.get("child").text'),'生活の条件を整理して部屋を探す');await shot('backup-375-imported');
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});await evaluate('document.querySelector("#exShare").click()');
  await wait(()=>readdirSync(downloads).some(f=>f.endsWith('.json')),'backup download');
  const exported=JSON.parse(readFileSync(resolve(downloads,readdirSync(downloads).find(f=>f.endsWith('.json'))),'utf8'));
  assert.equal(exported.app,'tane');assert.equal(exported.version,2);assert.equal(exported.nodes.length,8);assert.equal(exported.ideas.length,1);
  assert.equal(exported.nodes.find(n=>n.id==='root2').text,JSON.parse(initial).nodes.find(n=>n.id==='root2').text);
  await send('Page.reload');await wait(()=>evaluate('document.readyState==="complete"&&typeof S!=="undefined"'),'reload');assert.equal(await evaluate('S.nodes.size'),8);assert.equal(await evaluate('S.ideas.size'),1);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
