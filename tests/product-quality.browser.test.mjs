import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {browserHarness,sleep,release} from './browser-harness.mjs';
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
    // Resolve the audit's short-text, symbol, clipped-field and simple gradient
    // cases using their actual computed foreground and surface colors.
    const contrast=await evaluate(`(()=>{
      const rgb=s=>(s.match(/[\\d.]+/g)||[]).map(Number).slice(0,3),lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0),ratio=(a,b)=>{const x=lum(rgb(a)),y=lum(rgb(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
      return [...document.querySelectorAll('#n-seed,[data-caret],#d-close,.srow>span,#d-memo,#imText,.same-rank-num,.same-rank-arrow,.mark')].filter(e=>e.getClientRects().length).map(e=>{
        let p=e,bg='';while(p){const c=getComputedStyle(p).backgroundColor;if(c!=='transparent'&&c!=='rgba(0, 0, 0, 0)'){bg=c;break;}p=p.parentElement;}bg=bg||getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
        const fg=getComputedStyle(e).color,colors=[bg];if(e.classList.contains('mark'))colors.push(getComputedStyle(document.documentElement).getPropertyValue('--seed').trim());
        const parse=s=>s.startsWith('#')?'rgb('+[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)).join(',')+')':s;
        const ratios=colors.map(b=>ratio(fg,parse(b)));if(e.hasAttribute('placeholder'))ratios.push(ratio(getComputedStyle(e,'::placeholder').color,parse(bg)));
        return {target:e.id||e.className||e.tagName,foreground:fg,background:bg,ratio:Math.min(...ratios)};
      });})()`);
    findings[findings.length-1].computedContrast=contrast;
    assert.ok(contrast.every(x=>x.ratio>=4.5),theme+' '+state+' low contrast '+JSON.stringify(contrast.filter(x=>x.ratio<4.5)));
    if(state==='same'){
     const palette=await evaluate(`(()=>{const c=netColors(),rgb=s=>s.startsWith('#')?[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)):(s.match(/[\\d.]+/g)||[]).map(Number).slice(0,3),lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0),ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)},bg=rgb(c.frame);return ['blue','green','gold','gray','line'].map(key=>{const fg=rgb(c[key]),composited=key==='line'?fg.map((v,i)=>v*.9+bg[i]*.1):fg;return {key,color:c[key],ratio:ratio(composited,bg)}});})()`);
     findings[findings.length-1].graphContrast=palette;assert.ok(palette.every(x=>x.ratio>=3),theme+' graph contrast '+JSON.stringify(palette));
    }
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
  await shot('flow-320-touch-scores');
  await evaluate('openSheet(false)');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await evaluate('document.querySelector("#themeNew").click()');
  assert.equal(await evaluate('document.querySelector("#sheet").hidden'),true,'entry hides unrelated analysis');
  assert.ok(await evaluate('document.querySelector("#main").getBoundingClientRect().width<=720'),'desktop entry keeps a readable line length');
  await shot('flow-1440-first-input');await evaluate('document.querySelector("#themeStartBack").click()');
  assert.equal(await evaluate('document.querySelector("#sheet").hidden'),false,'return restores analysis sidebar');assert.deepEqual(h.errors,[]);
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
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{x:230,y:440,id:1}]});
  await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:145,y:440,id:0}]});
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.notEqual(await evaluate('netGraph.cam.x'),panX,'remaining finger continues panning');assert.equal(await evaluate('netGraph.selected'),null,'pinch release does not select a node');
  await evaluate('document.querySelector("#netFit").click()');await wait(()=>evaluate('!netGraph.camTarget'),'fit');
  await evaluate('netSelect(null,false);document.querySelector("#netCanvas").focus()');
  const key=async(k,code,v)=>send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:v});
  await key('ArrowRight','ArrowRight',39);assert.equal(await evaluate('netGraph.selected'),'action:root');
  await key('ArrowRight','ArrowRight',39);assert.equal(await evaluate('netGraph.selected'),'action:child');
  const kz=await evaluate('netGraph.cam.z');await key('+','Equal',187);assert.ok(await evaluate('netGraph.cam.z')>kz,'keyboard zoom');
  assert.ok(await evaluate('document.querySelector("#netKeyboardStatus").textContent.includes("暮らしに合う部屋を探す")'));
  await key('Enter','Enter',13);assert.equal(await evaluate('S.tab'),'tree');assert.equal(await evaluate('S.sel'),'child');assert.equal(await evaluate('document.querySelector("#sheet").classList.contains("open")'),true);
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
  await send('DOM.enable');const documentNode=(await send('DOM.getDocument')).root.nodeId;
  const inputNode=(await send('DOM.querySelector',{nodeId:documentNode,selector:'#imFile'})).nodeId;
  await send('DOM.setFileInputFiles',{nodeId:inputNode,files:[resolve(downloads,readdirSync(downloads).find(f=>f.endsWith('.json')))]});
  await wait(()=>evaluate('!!document.querySelector("#confirmImport")'),'file import preview');
  assert.ok(await evaluate('document.querySelector("#imResult").textContent.includes("上書き 8件")'),'downloaded backup is read by the file input');await shot('backup-375-file-review');
  await evaluate('document.querySelector("#cancelImport").click()');assert.equal(await evaluate('S.nodes.size'),8);assert.equal(await evaluate('S.ideas.size'),1);
  await send('Page.reload');await wait(()=>evaluate('document.readyState==="complete"&&typeof S!=="undefined"'),'reload');assert.equal(await evaluate('S.nodes.size'),8);assert.equal(await evaluate('S.ideas.size'),1);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('press, lift, menu and return form one continuous anchored motion',{timeout:25000},async()=>{
 const h=await browserHarness(root),{send,evaluate,wait}=h,dir=resolve(root,'test-artifacts');mkdirSync(dir,{recursive:true});
 const shot=async name=>writeFileSync(resolve(dir,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 try{
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await send('Page.navigate',{url:h.url+'/index.html'});await wait(()=>evaluate('document.readyState==="complete"&&typeof S!=="undefined"'),'load');
  await evaluate('localStorage.setItem("tane.v1",'+JSON.stringify(JSON.stringify(fixture))+');loadAll();S.theme="root";render()');
  const p=await evaluate('(()=>{const r=document.querySelector(\'[data-node="child"]\').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');
  await evaluate('window.qaMotion=[];window.qaMotionStart=performance.now();requestAnimationFrame(function sample(t){const menu=document.querySelector("#treeCtx"),lift=document.querySelector("#treeCtxLift"),el=menu&&!menu.hidden&&lift&&!lift.hidden?lift:document.querySelector(\'[data-node="child"]\'),r=el.getBoundingClientRect();qaMotion.push({t:t-qaMotionStart,x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,phase:el===lift?"lift":"row"});if(t-qaMotionStart<1400)requestAnimationFrame(sample)})');
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:0}]});await sleep(180);await shot('motion-1-press');await sleep(260);await shot('motion-2-lift');await sleep(230);await shot('motion-3-menu');
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await evaluate('treeCtxClose()');await sleep(70);await shot('motion-4-return');await sleep(170);await shot('motion-5-rest');await sleep(500);
  const samples=await evaluate('qaMotion'),steps=samples.slice(1).map((b,i)=>({width:Math.abs(b.width-samples[i].width)/samples[i].width,position:Math.hypot(b.x-samples[i].x,b.y-samples[i].y)}));
  writeFileSync(resolve(dir,'motion-samples.json'),JSON.stringify({samples,maxWidthStep:Math.max(...steps.map(x=>x.width)),maxPositionStep:Math.max(...steps.map(x=>x.position))},null,2));
  assert.ok(samples.length>=20,'frame samples collected');assert.ok(samples.some(s=>s.phase==='lift'),'floating preview observed');
  assert.ok(steps.every(s=>s.width<.05&&s.position<8),'no abrupt geometry jump between source and floating preview');assert.equal(await evaluate('document.querySelector("#treeCtx").hidden'),true);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('detached context preview retains narrow-screen text geometry',{timeout:30000},async()=>{
 const h=await browserHarness(root),{send,evaluate,wait}=h,dir=resolve(root,'test-artifacts');mkdirSync(dir,{recursive:true});const results=[];
 try{
  for(const phase of ['before','after']){
   h.setRootRevision(phase==='before'?'935d0cd2d0b00a89de92b477632c8fea9e32bc9f':null);
   await send('Page.navigate',{url:h.url+'/index.html'});await sleep(100);await wait(()=>evaluate('document.readyState==="complete"&&typeof S!=="undefined"'),'load');
   await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
   for(const width of [320,375,390,430,768,1440]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<900});
    await evaluate('localStorage.setItem("tane.v1",'+JSON.stringify(JSON.stringify(fixture))+');loadAll();S.theme="root";S.sel=null;render();document.querySelector(\'[data-node-menu="child"]\').click()');
    const geometry=await evaluate('(()=>{const a=document.querySelector(\'[data-node="child"]\'),b=document.querySelector("#treeCtxLift"),ar=a.getBoundingClientRect(),br=b.getBoundingClientRect(),at=a.querySelector(".t").getBoundingClientRect(),bt=b.querySelector(".t").getBoundingClientRect();return {leftError:Math.abs((at.left-ar.left)/ar.width-(bt.left-br.left)/br.width)*a.offsetWidth,widthError:Math.abs(at.width/ar.width-bt.width/br.width)*a.offsetWidth,sourcePadding:getComputedStyle(a).padding,previewPadding:getComputedStyle(b.firstElementChild).padding}})()');results.push({phase,width,...geometry});
    if(width===375)writeFileSync(resolve(dir,'preview-text-'+phase+'-375.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    if(phase==='after'){assert.ok(geometry.leftError<1&&geometry.widthError<1,'preview text reflows at '+width+': '+JSON.stringify(geometry));}
    await evaluate('treeCtxClose(false)');
   }
  }
  assert.deepEqual(h.errors,[]);
 }finally{writeFileSync(resolve(dir,'preview-text-geometry.json'),JSON.stringify(results,null,2));await h.close();}
});

test('an installed v61 worker upgrades to the current release and keeps saved data offline',{timeout:40000},async()=>{
 const h=await browserHarness(root),{send,evaluate,wait}=h;const dir=resolve(root,'test-artifacts');mkdirSync(dir,{recursive:true});
 try{
  h.setRootRevision('429845bdd3c91526e505a6f5b30760cb9bc6550d');
  await send('Page.navigate',{url:h.url+'/index.html'});await wait(()=>evaluate('document.readyState==="complete"&&typeof S!=="undefined"'),'old app');
  await evaluate('localStorage.setItem("tane.v1",'+JSON.stringify(JSON.stringify(fixture))+');loadAll();S.theme="root";render();saveNow();navigator.serviceWorker.register("/sw.js?v=61",{updateViaCache:"none"})');
  await wait(()=>evaluate('!!navigator.serviceWorker.controller'),'old worker controls page');assert.ok(await evaluate('caches.has("tane-v61")'));
  const before=await evaluate('JSON.parse(localStorage.getItem("tane.v1"))');
  h.setRootRevision(null);await send('Page.reload');await sleep(150);await wait(()=>evaluate('document.readyState==="complete"&&typeof S!=="undefined"'),'new app through old worker');
  await evaluate('navigator.serviceWorker.register("/sw.js?v='+release+'",{updateViaCache:"none"}).then(r=>r.update())');
  await wait(()=>evaluate('navigator.serviceWorker.controller?.scriptURL.endsWith("v='+release+'")'),'new worker controller');
  await wait(()=>evaluate('caches.keys().then(k=>k.includes("tane-v'+release+'")&&!k.includes("tane-v61"))'),'old cache retired');
  const precached=await evaluate('caches.open("tane-v'+release+'").then(c=>c.keys()).then(k=>k.map(r=>r.url))');
  writeFileSync(resolve(dir,'upgraded-cache-keys.json'),JSON.stringify(precached,null,2));
  assert.ok(['ui-polish.css','tree-context.css','tree-context.js'].every(f=>precached.some(url=>url.endsWith(f+'?v='+release))),'versioned assets are precached: '+JSON.stringify(precached));
  await send('Network.enable');await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await send('Page.reload');await sleep(250);await wait(()=>evaluate('document.readyState==="complete"&&typeof S!=="undefined"&&S.nodes.size===7'),'upgraded offline app');
  assert.deepEqual(await evaluate('[...S.nodes.values()]'),before.nodes);assert.deepEqual(await evaluate('[...S.ideas.values()]'),before.ideas);assert.equal(await evaluate('getComputedStyle(document.documentElement).getPropertyValue("--paper").trim()'),'#FAFAF8');
  writeFileSync(resolve(dir,'upgraded-offline.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('150-action graph fits a small screen, filters and details remain usable',{timeout:30000},async()=>{
 const h=await browserHarness(root),{send,evaluate,wait}=h,dir=resolve(root,'test-artifacts');mkdirSync(dir,{recursive:true});
 const dense=structuredClone(fixture);for(let i=0;i<143;i++)dense.nodes.push({id:'dense'+i,parent:i<12?'root':'dense'+(i-12),order:i,text:'暮らしの条件を確認し、候補の情報を比較して判断する '+i,tags:[i%2?'情報を集める':'選択肢を比べる']});
 try{
  await send('Emulation.setDeviceMetricsOverride',{width:320,height:844,deviceScaleFactor:1,mobile:true});await send('Page.navigate',{url:h.url+'/index.html'});await wait(()=>evaluate('document.readyState==="complete"&&typeof S!=="undefined"'),'load');
  await evaluate('localStorage.setItem("tane.v1",'+JSON.stringify(JSON.stringify(dense))+');loadAll();S.tab="same";netGraph=null;window.qaDenseStart=performance.now();render()');
  await wait(()=>evaluate('!netGraph.fitOnSettle&&!netGraph.camTarget'),'dense settle');
  const settleMs=await evaluate('performance.now()-qaDenseStart');assert.equal(await evaluate('netGraph.nodes.size'),150);
  assert.equal(await evaluate('netLive.labels.filter(b=>netGraph.nodes.get(b.id).depth===0).length'),2,'both starting actions keep a readable label');
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'dense graph fits 320px');
  writeFileSync(resolve(dir,'dense-150-network.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evaluate('netSetFilters(null,"選択肢を比べる");netSelect("action:dense142",true)');assert.ok(await evaluate('!document.querySelector("#netDetail").hidden'));
  const frameMs=await evaluate('(()=>{const samples=[];for(let i=0;i<6;i++){netGraph.alpha=.1;const t=performance.now();netPhysics();netPaint();samples.push(performance.now()-t);}return samples})()');
  writeFileSync(resolve(dir,'dense-network-timings.json'),JSON.stringify({nodes:150,settleMs,physicsAndPaintMs:frameMs},null,2));assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
