import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {browserHarness,sleep} from './browser-harness.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
const fixture={version:2,nodes:[
 {id:'root',text:'家を借りる',parent:null,order:0},
 {id:'child',text:'暮らしに合う部屋を探す',parent:'root',order:0,tags:['選択肢を比べる'],seed:true,scores:{now:2,repeat:2},reasons:[{id:'r1',text:'安心して暮らせる場所が必要だから',kind:'need',star:true,status:'still'}]},
 {id:'leaf',text:'物件の写真と間取りを比較する',parent:'child',order:0},
 {id:'child2',text:'内見の日程を調整する',parent:'root',order:1,frictions:['wait','parties']},
 {id:'child3',text:'書類を集めて申し込む',parent:'root',order:2,tags:['信頼を示す']},
 {id:'root2',text:'移動する',parent:null,order:1},
 {id:'other',text:'路線と所要時間を比較する',parent:'root2',order:0,tags:['選択肢を比べる']}
],ideas:[{id:'idea1',title:'暮らしの条件から部屋を選ぶ',status:'idea',sources:[{type:'node',id:'child'}],customer:'引っ越しを考える人',pain:'写真だけでは暮らしが想像できない',next:'引っ越したばかりの3人に話を聞く',fit:{}}]};

test('six widths × two themes × empty, populated, dense, context and analysis; before/after evidence',{timeout:240000},async()=>{
 const h=await browserHarness(root),{send,evaluate,wait}=h;const dir=resolve(root,'test-artifacts');mkdirSync(dir,{recursive:true});const results=[],failures=[];
 const shot=async name=>writeFileSync(resolve(dir,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 const seed=async dense=>{const f=structuredClone(fixture);if(dense)for(let i=0;i<35;i++)f.nodes.push({id:'dense'+i,parent:i<7?'child':'dense'+(i-7),order:i,text:'候補の情報を集め、暮らしの条件に合わせて比較しながら次の行動を考える '+i,tags:['選択肢を比べる','暮らしの条件を整理する','情報を集める'],seed:i%3===0});await evaluate('localStorage.setItem("tane.v1",'+JSON.stringify(JSON.stringify(f))+');loadAll();S.theme="root";S.sel=null;S.detailFor=null;S.tab="tree";render()');};
 const overflow=()=>evaluate('({width:innerWidth,document:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll("#main>*")].filter(e=>e.getBoundingClientRect().right>document.documentElement.clientWidth+1).map(e=>({class:e.className,right:e.getBoundingClientRect().right}))})');
 try{for(const phase of ['before','after']){
  await send('Page.navigate',{url:h.url+(phase==='before'?'/before/index.html':'/index.html')});await wait(()=>evaluate("document.readyState==='complete'&&typeof S!=='undefined'"),'app load');
  for(const width of [320,375,390,430,768,1440])for(const theme of ['light','dark']){
   const height=width===1440?1000:width===768?1024:844;
   await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});
   await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]});
   await evaluate('openSheet(false);S.nodes.clear();S.ideas.clear();S.sel=null;S.theme=null;S.detailFor=null;S.tab="tree";render()');
   await sleep(300);const prefix=phase+'-'+width+'-'+theme;
   await shot(prefix+'-empty');await seed(false);await shot(prefix+'-tree');
   await evaluate('document.querySelector(\'[data-node-menu="child"]\').click()');await sleep(620);await shot(prefix+'-menu');
   const box=await evaluate('(()=>{const r=document.querySelector("#treeCtxStage").getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom}})()');
   if(phase==='after'&&!(box.left>=0&&box.top>=0&&box.right<=width+1&&box.bottom<=height+1))failures.push('menu fits '+prefix);
   await evaluate('treeCtxClose()');await sleep(220);
   await evaluate('document.querySelector(\'[data-node="child"]\').click()');await sleep(330);await shot(prefix+'-sheet');await evaluate('openSheet(false)');await sleep(330);
   for(const tab of ['same','seed','idea','data']){await evaluate('S.tab='+JSON.stringify(tab)+';render()');if(tab==='same')await wait(()=>evaluate('!netGraph||!netGraph.fitOnSettle&&!netGraph.camTarget'),'network settle');else await sleep(30);await shot(prefix+'-'+tab);if(phase==='after'){const o=await overflow();if(o.document>width+1)failures.push('overflow in '+tab+' '+prefix+' '+JSON.stringify(o));}}
   await seed(true);await shot(prefix+'-dense');const layout=await overflow();results.push({phase,width,theme,layout,box});
   if(phase==='after'&&layout.document>width+1)failures.push('dense tree fits '+prefix+' '+JSON.stringify(layout));
  }
 }
 assert.deepEqual(failures,[],'responsive regressions');assert.deepEqual(h.errors,[],'no uncaught exceptions');
 }finally{writeFileSync(resolve(dir,'qa-matrix.json'),JSON.stringify({results,failures,errors:h.errors},null,2));await h.close();}
});

test('keyboard modal boundaries, input workflows, persistence and reduced motion',{timeout:60000},async()=>{
 const h=await browserHarness(root),{send,evaluate,wait}=h;
 try{
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Page.navigate',{url:h.url+'/index.html'});await wait(()=>evaluate("document.readyState==='complete'&&typeof S!=='undefined'"),'app load');
  await evaluate('localStorage.setItem("tane.v1",'+JSON.stringify(JSON.stringify(fixture))+');loadAll();S.theme="root";render()');
  await evaluate('document.querySelector(\'[data-node="child"]\').click()');
  assert.equal(await evaluate('document.querySelector("#sheet").getAttribute("aria-modal")'),'true');
  assert.equal(await evaluate('document.querySelector("#main").inert'),true);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  assert.equal(await evaluate('document.activeElement.id'),'d-close');
  await evaluate('document.querySelector(\'[data-st="res"]\').focus()');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  assert.equal(await evaluate('document.activeElement.dataset.st'),'tag');
  await evaluate('document.querySelector("#d-tag-in").value="暮らしを想像する";document.querySelector("#d-tagf").requestSubmit()');
  assert.ok(await evaluate('S.nodes.get("child").tags.includes("暮らしを想像する")'));
  await evaluate('document.querySelector(\'[data-st="seed"]\').click();document.querySelector(\'[data-sk="gap"][data-sv="2"]\').click()');
  assert.equal(await evaluate('S.nodes.get("child").scores.gap'),2);
  await evaluate('document.querySelector(\'[data-st="etc"]\').click();const f=document.querySelector("#d-memo");f.value="観察メモを残す";f.dispatchEvent(new Event("input",{bubbles:true}))');
  await sleep(500);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  assert.equal(await evaluate('document.querySelector("#main").inert'),false);
  assert.equal(await evaluate('document.activeElement.dataset.node'),'child');
  assert.equal(await evaluate('document.querySelector("#sheet").inert'),true);
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await evaluate('document.querySelector(\'[data-node-menu="child"]\').click()');
  assert.equal(await evaluate('document.querySelector("#treeCtxLift").getAnimations().length'),0);
  assert.equal(await evaluate('document.querySelector("#treeCtxLift").inert'),true);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  assert.equal(await evaluate('document.activeElement.id'),'chooseAdd');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});
  assert.equal(await evaluate('document.activeElement.id'),'zoomHere');
  await evaluate('treeCtxClose()');assert.equal(await evaluate('document.querySelector("#treeCtx").hidden'),true);
  await evaluate('saveNow()');
  await send('Page.reload');await wait(()=>evaluate("document.readyState==='complete'&&typeof S!=='undefined'"),'reload');
  assert.ok(await evaluate('S.nodes.get("child").tags.includes("暮らしを想像する")'));
  assert.equal(await evaluate('S.nodes.get("child").scores.gap'),2);
  assert.equal(await evaluate('S.nodes.get("child").memo'),'観察メモを残す');
  assert.equal(await evaluate('S.ideas.size'),1);
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('analysis lenses, idea menus and offline PWA keep saved data',{timeout:65000},async()=>{
 const h=await browserHarness(root),{send,evaluate,wait}=h;const dir=resolve(root,'test-artifacts');mkdirSync(dir,{recursive:true});
 const shot=async name=>writeFileSync(resolve(dir,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 try{
  await send('Emulation.setDeviceMetricsOverride',{width:320,height:844,deviceScaleFactor:1,mobile:true});
  await send('Page.navigate',{url:h.url+'/index.html'});await wait(()=>evaluate("document.readyState==='complete'&&typeof S!=='undefined'"),'load');
  await evaluate('localStorage.setItem("tane.v1",'+JSON.stringify(JSON.stringify(fixture))+');loadAll();S.theme="root";render();select("child",true)');await sleep(350);
  for(const lens of ['depth','breadth','struct','time']){
   await evaluate('document.querySelector(\'[data-st="res"]\').click();document.querySelector(\'[data-lens="'+lens+'"]\').click();document.querySelector("#sheet").scrollTop=0');
   await shot('detail-320-'+lens);
   assert.ok(await evaluate('document.querySelector("#sheet").scrollWidth<=document.querySelector("#sheet").clientWidth+1'),'lens fits '+lens);
  }
  await evaluate('document.querySelector(\'[data-lens="breadth"]\').click();document.querySelector("#a-add").click()');
  await evaluate('{const f=document.querySelector(\'[data-af="name"]\');f.value="借りる人";f.dispatchEvent(new Event("input",{bubbles:true}))}');
  await evaluate('document.querySelector(\'[data-lens="time"]\').click();{const f=document.querySelector(\'[data-nf="since"]\');f.value="生活が変わったときから";f.dispatchEvent(new Event("input",{bubbles:true}))}');
  for(const tab of ['tag','seed','etc']){await evaluate('document.querySelector(\'[data-st="'+tab+'"]\').click();document.querySelector("#sheet").scrollTop=0');await shot('detail-320-'+tab);}
  await evaluate('openSheet(false);S.tab="idea";render();document.querySelector(\'[data-idea-menu="idea1"]\').click()');
  assert.ok(await evaluate('document.querySelector("#main").inert'));await shot('detail-320-idea-menu');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  assert.ok(await evaluate('document.querySelector("#ideaMenu").contains(document.activeElement)'));
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  assert.equal(await evaluate('document.querySelector("#ideaMenu").hidden'),true);
  await evaluate('document.querySelector(\'[data-idea="idea1"]\').click()');await shot('detail-320-idea-editor');
  assert.equal(await evaluate('S.ideaSel'),'idea1');assert.equal(await evaluate('document.querySelector("#sheet").hidden'),true);
  // Force clipboard denial in this isolated browser to exercise the real fallback UI.
  await evaluate('Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:()=>Promise.reject(new Error("test denial"))}});copyText("検証用のプロンプト")');
  await wait(()=>evaluate('!document.querySelector("#copyFallback").hidden'),'fallback');await shot('detail-320-copy-fallback');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  assert.equal(await evaluate('document.querySelector("#copyFallback").hidden'),true);assert.equal(await evaluate('document.querySelector("#main").inert'),false);
  await evaluate('saveNow();navigator.serviceWorker.register("/sw.js?v=65",{updateViaCache:"none"})');
  await wait(()=>evaluate('!!navigator.serviceWorker.controller'),'worker active');
  assert.ok(await evaluate('caches.has("tane-v65")'),'current cache installed');
  const snapshot=await evaluate('JSON.parse(localStorage.getItem("tane.v1"))');
  await send('Network.enable');await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await send('Page.reload');await sleep(350);await wait(()=>evaluate('document.readyState==="complete"&&typeof S!=="undefined"&&S.nodes.size===7'),'offline app');
  assert.equal(await evaluate('S.nodes.get("child").since'),'生活が変わったときから');
  assert.equal(await evaluate('S.nodes.get("child").actors[0].name'),'借りる人');
  assert.equal(await evaluate('S.ideas.size'),snapshot.ideas.length);
  assert.equal(await evaluate('getComputedStyle(document.documentElement).getPropertyValue("--paper").trim()'),'#FAFAF7','versioned CSS available offline');
  await shot('detail-320-offline');assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('removing superseded CSS preserves computed design across widths and themes',{timeout:90000},async()=>{
 const h=await browserHarness(root),{send,evaluate,wait}=h;
 const properties=['display','position','padding','margin','gap','color','background-color','border','border-radius','box-shadow','font-family','font-size','font-weight','line-height','letter-spacing','text-align','min-width','min-height','max-width','max-height','overflow-x','overflow-y','flex','grid-template-columns','width','height'];
 const styleSnapshot=()=>evaluate('(()=>{const props='+JSON.stringify(properties)+';return [...document.querySelectorAll("#main *,#sheet *,#topBar *,.bottom *")].filter(e=>e.getClientRects().length).map(e=>({tag:e.tagName,cls:e.className,styles:Object.fromEntries(props.map(p=>[p,getComputedStyle(e).getPropertyValue(p)]))}));})()');
 try{
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  for(const width of [320,375,390,430,768,1440])for(const theme of ['light','dark']){
   await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<900});
   await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme},{name:'prefers-reduced-motion',value:'reduce'}]});
   const sides=[];
   for(const ref of ['reference','']){
    await send('Page.navigate',{url:h.url+(ref?'/reference/index.html':'/index.html')});await sleep(100);await wait(()=>evaluate('document.readyState==="complete"&&typeof S!=="undefined"'),'reference load');await evaluate('document.fonts.ready');
    await evaluate('localStorage.setItem("tane.v1",'+JSON.stringify(JSON.stringify(fixture))+');loadAll();S.theme="root";S.sel="child";S.detailFor=null;S.tab="tree";render();openSheet(true)');
    const states=[];
    for(const tab of ['res','tag','seed','etc']){await evaluate('document.querySelector(\'[data-st="'+tab+'"]\').click()');states.push(await styleSnapshot());}
    for(const tab of ['idea','data']){await evaluate('openSheet(false);S.tab='+JSON.stringify(tab)+';render()');states.push(await styleSnapshot());}
    sides.push(states);
   }
   const diffs=[];for(let s=0;s<sides[0].length;s++){const a=sides[0][s],b=sides[1][s];if(a.length!==b.length)diffs.push({state:s,expectedLength:a.length,actualLength:b.length});for(let i=0;i<Math.min(a.length,b.length);i++)if(JSON.stringify(a[i])!==JSON.stringify(b[i]))diffs.push({state:s,index:i,tag:a[i].tag,cls:a[i].cls,properties:Object.fromEntries(properties.filter(p=>a[i].styles[p]!==b[i].styles[p]).map(p=>[p,{expected:a[i].styles[p],actual:b[i].styles[p]}]))});}if(diffs.length){writeFileSync(resolve(root,'test-artifacts','css-equivalence-diffs.json'),JSON.stringify({width,theme,diffs},null,2));}assert.equal(diffs.length,0,'effective CSS differs at '+width+' '+theme+' '+JSON.stringify(diffs.slice(0,4)));
  }
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
