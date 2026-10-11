/* Tree context interaction: deliberately separate from the legacy idea-card menu.
   Touch scroll stays native until the long press threshold is reached. */
'use strict';
let treeCtxMouse = null;
let treeCtxPreviousFocus = null;
let treeCtxOrigin = null;
let treeCtxOpenedAt = 0;
let treeCtxLiftedRow = null;
let treeCtxClosing = null;
const treeCtxOpen = () => !!document.querySelector('#treeCtx:not([hidden]):not(.is-closing)');
const treeCtxIcons = {
  chooseAdd:'<path d="M12 5v14M5 12h14"/>',
  changeLayer:'<path d="M8 20V4m0 0-4 4m4-4 4 4M16 4v16m0 0-4-4m4 4 4-4"/>',
  openSheet:'<circle cx="12" cy="12" r="8"/><path d="M12 8v8m-4-4h8"/>',
  zoomHere:'<circle cx="10" cy="10" r="6"/><path d="m14.5 14.5 6 6M7.5 10h5"/>',
  zoomAll:'<path d="M3 10V3h7m4 0h7v7M3 14v7h7m4 0h7v-7"/>'
};
function treeCtxEnsure(){
  if(document.getElementById('treeCtx'))return;
  const el=document.createElement('div');
  el.id='treeCtx';el.className='tree-ctx';el.hidden=true;
  el.innerHTML='<div id="treeCtxStage" class="tree-ctx-stage" role="dialog" aria-modal="true" aria-labelledby="treeCtxHeading" tabindex="-1">'+
    '<div class="tree-ctx-preview" id="treeCtxPreview"><div id="treeCtxHeading"></div></div>'+
    '<div class="tree-ctx-commands" id="treeCtxCommands"></div></div>'+ 
    '<div class="tree-ctx-lift" id="treeCtxLift" aria-hidden="true"></div>';
  document.body.appendChild(el);
  el.addEventListener('click',e=>{
    if(e.target===el && performance.now()-treeCtxOpenedAt>250)treeCtxClose();
  });
  document.addEventListener('keydown',e=>{
    if(!treeCtxOpen())return;
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();treeCtxClose();return;}
    if(e.key==='Tab'){
      const all=[...el.querySelectorAll('button:not([disabled]):not([hidden]),input:not([disabled]),select:not([disabled])')]
        .filter(x=>x.getClientRects().length>0);
      if(!all.length)return;
      const first=all[0],last=all[all.length-1];
      if(e.shiftKey&&(document.activeElement===first||document.activeElement===document.querySelector('#treeCtxStage'))){
        e.preventDefault();last.focus();
      }else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===document.querySelector('#treeCtxStage'))){
        e.preventDefault();first.focus();
      }
    }
  },true);
  document.addEventListener('pointermove',e=>{
    if(!treeCtxMouse||treeCtxMouse.id!==e.pointerId)return;
    const p=treeCtxMouse;
    if(!p.opened){
      if(Math.hypot(e.clientX-p.x,e.clientY-p.y)>12){clearTimeout(p.timer);p.button.classList.remove('is-pressing');treeCtxMouse=null;}
    }else{p.moved ||= Math.hypot(e.clientX-p.x,e.clientY-p.y)>12;treeCtxHover(e.clientX,e.clientY);}
  },true);
  document.addEventListener('pointerup',e=>{
    const p=treeCtxMouse;if(!p||p.id!==e.pointerId)return;
    clearTimeout(p.timer);p.button.classList.remove('is-pressing');
    treeCtxMouse=null;
    if(p.opened)treeCtxEndGesture(e.clientX,e.clientY,p.moved);
  },true);
  document.addEventListener('pointercancel',e=>{
    const p=treeCtxMouse;if(!p||p.id!==e.pointerId)return;
    clearTimeout(p.timer);p.button.classList.remove('is-pressing');
    treeCtxMouse=null;if(p.opened)treeCtxClose();
  },true);
  window.addEventListener('resize',()=>{if(treeCtxOpen())treeCtxPosition();});
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize',()=>{if(treeCtxOpen())treeCtxPosition();});
    window.visualViewport.addEventListener('scroll',()=>{if(treeCtxOpen())treeCtxPosition();});
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&treeCtxOpen())treeCtxClose();});
  // After the menu has opened, a fresh touch inside it can slide-select as on iOS.
  let menuTouch=null;
  el.addEventListener('touchstart',e=>{
    if(e.touches.length!==1||!treeCtxOpen())return;
    const t=e.touches[0];
    if(!t.target.closest('#treeCtxCommands button'))return;
    menuTouch={id:t.identifier,x:t.clientX,y:t.clientY,moved:false};
  },{passive:true});
  el.addEventListener('touchmove',e=>{
    if(!menuTouch)return;
    const t=[...e.touches].find(t=>t.identifier===menuTouch.id);if(!t)return;
    if(Math.hypot(t.clientX-menuTouch.x,t.clientY-menuTouch.y)>12){
      menuTouch.moved=true;
      // Prevent only slide-to-select gestures; simple scrolling is allowed on the panel.
      if(e.cancelable && !e.target.closest('.tree-ctx-commands.is-submenu'))e.preventDefault();
    }
    if(menuTouch.moved)treeCtxHover(t.clientX,t.clientY);
  },{passive:false});
  el.addEventListener('touchend',e=>{
    if(!menuTouch)return;
    const t=[...e.changedTouches].find(t=>t.identifier===menuTouch.id);if(!t)return;
    const moved=menuTouch.moved;menuTouch=null;
    if(moved){if(e.cancelable)e.preventDefault();treeCtxEndGesture(t.clientX,t.clientY,true);}
  },{passive:false});
  el.addEventListener('touchcancel',()=>{menuTouch=null;treeCtxClearHover();},{passive:true});
}
function treeCtxPosition(){
  if(!treeCtxOpen())return;
  const stage=document.querySelector('#treeCtxStage');
  const anchor=document.querySelector('#treeCtx')._anchor;
  if(!anchor)return;
  const vv=window.visualViewport;
  const vw=vv?.width||innerWidth, vh=vv?.height||innerHeight;
  const ox=vv?.offsetLeft||0, oy=vv?.offsetTop||0;
  stage.style.maxHeight=Math.max(120,vh-32)+'px';
  // Layout dimensions remain stable during the spring-scale entrance animation.
  const w=stage.offsetWidth,h=stage.offsetHeight;
  const left=Math.max(ox+12,Math.min(ox+vw-w-12,anchor.left+Math.min(anchor.width*.28,36)));
  // Small fixed-size context surface anchored to the pressed row.
  const belowSpace=oy+vh-anchor.bottom;
  const aboveSpace=anchor.top-oy;
  const above=belowSpace<h+18 && aboveSpace>belowSpace;
  stage.classList.toggle('above',above);
  const wantedTop=above?anchor.top-h-6:anchor.bottom+6;
  stage.style.left=left+'px';
  stage.style.top=Math.max(oy+12,Math.min(oy+vh-h-12,wantedTop))+'px';
}
function treeCtxRender(){
  if(!treeCtxOpen())return;
  const menu=document.querySelector('#treeCtx');
  const n=S.nodes.get(menu.dataset.node);
  if(!n){treeCtxClose();return;}
  if(treeCtxLiftedRow&&!treeCtxLiftedRow.isConnected){
    treeCtxLiftedRow=document.querySelector('[data-node="'+CSS.escape(n.id)+'"]');
    treeCtxLiftedRow?.classList.add('tree-ctx-original');
  }
  const panel=document.querySelector('#treeCtxCommands');
  const mode=S.adding?.id===n.id?S.adding.mode:null;
  panel.innerHTML=actionBar(n);
  panel.classList.toggle('is-submenu',!!mode);
  panel.classList.remove('tree-ctx-content-enter');
  void panel.offsetWidth;
  panel.classList.add('tree-ctx-content-enter');
  if(mode){
    panel.insertAdjacentHTML('afterbegin','<button class="tree-ctx-back" id="treeCtxBack" type="button">‹ 戻る</button>');
    document.querySelector('#treeCtxBack').onclick=()=>{S.adding=null;treeCtxRender();};
  }else{
    panel.querySelectorAll('.actions .act').forEach(b=>{
      b.querySelector('b i')?.remove();
      if(treeCtxIcons[b.id])b.insertAdjacentHTML('beforeend',
        '<span class="tree-ctx-icon" aria-hidden="true"><svg viewBox="0 0 24 24">'+treeCtxIcons[b.id]+'</svg></span>');
    });
  }
  bindActionBar();
  requestAnimationFrame(treeCtxPosition);
}
function treeCtxShow(id,opener){
  treeCtxEnsure();
  const n=S.nodes.get(id);if(!n)return;
  if(treeCtxClosing)treeCtxClosing();
  if(treeCtxOpen())treeCtxClose(false);
  const menu=document.querySelector('#treeCtx');
  const row=opener?.matches?.('[data-node]')?opener:document.querySelector('[data-node="'+CSS.escape(id)+'"]');
  const rect=row?.getBoundingClientRect()||{left:innerWidth*.1,top:innerHeight*.3,bottom:innerHeight*.3+52,width:innerWidth*.8};
  const sourceTransform=row?getComputedStyle(row).transform:'none';
  menu._anchor={left:rect.left,top:rect.top,bottom:rect.bottom,width:rect.width};
  const lift=document.querySelector('#treeCtxLift');
  if(treeCtxLiftedRow)treeCtxLiftedRow.classList.remove('tree-ctx-original');
  treeCtxLiftedRow=row?.matches?.('[data-node]')?row:null;
  lift.replaceChildren();
  if(treeCtxLiftedRow){
    const clone=treeCtxLiftedRow.cloneNode(true);
    clone.removeAttribute('id');clone.removeAttribute('data-node');
    clone.removeAttribute('tabindex');clone.removeAttribute('aria-haspopup');
    clone.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
    clone.classList.remove('is-pressing');clone.classList.add('tree-ctx-lifted-content');
    lift.appendChild(clone);
    const width=row.offsetWidth,height=row.offsetHeight;
    const matrix=new DOMMatrix(sourceTransform);
    lift.style.left=(rect.left+(rect.width-width)/2-matrix.m41)+'px';
    lift.style.top=(rect.top+(rect.height-height)/2-matrix.m42)+'px';
    lift.style.width=width+'px';lift.style.height=height+'px';
    const scale=Math.min(1.045,(innerWidth-24)/width);
    const destination='translateY(-3px) scale('+scale+')';
    lift.getAnimations().forEach(a=>a.cancel());
    lift.style.transform=destination;
    if(!matchMedia('(prefers-reduced-motion:reduce)').matches)
      lift.animate([{transform:sourceTransform},{transform:destination}],
        {duration:210,easing:'cubic-bezier(.2,.8,.2,1)'});
    treeCtxLiftedRow.classList.add('tree-ctx-original');
  }
  lift.hidden=!treeCtxLiftedRow;
  treeCtxPreviousFocus=document.activeElement;
  treeCtxOrigin=id;treeCtxOpenedAt=performance.now();
  S.sel=id;S.adding=null;
  // Opening the menu must not synchronously rebuild the analysis sheet.
  // Defer sheet work until the user explicitly opens it.
  openSheet(false);
  document.querySelector('#treeCtxPreview').innerHTML='<span class="tree-ctx-level">L'+depth(id)+'</span>'+
    '<div class="tree-ctx-name" id="treeCtxHeading">'+esc(n.text)+'</div>'+
    (badges(n)?'<div class="meta">'+badges(n)+'</div>':'');
  menu.dataset.node=id;menu.hidden=false;
  modalBackground('tree',true);
  document.body.classList.add('tree-ctx-open');
  document.documentElement.style.overflow='hidden';
  row?.classList.remove('is-pressing');
  treeCtxRender();treeCtxPosition();
  document.querySelector('#treeCtxStage').focus({preventScroll:true});
}
function treeCtxClose(restoreFocus=true){
  if(!treeCtxOpen())return;
  const menu=document.querySelector('#treeCtx');
  menu.classList.add('is-closing');menu.inert=true;
  const lift=document.querySelector('#treeCtxLift');
  const last=treeCtxPreviousFocus,origin=treeCtxOrigin;
  const finish=()=>{
    if(treeCtxClosing!==finish)return;
    treeCtxClosing=null;
    menu.hidden=true;menu.inert=false;menu.classList.remove('is-closing');
    delete menu.dataset.node;menu._anchor=null;
    menu.getAnimations({subtree:true}).forEach(a=>a.cancel());
    lift.getAnimations().forEach(a=>a.cancel());
    if(treeCtxLiftedRow){treeCtxLiftedRow.classList.remove('tree-ctx-original');treeCtxLiftedRow=null;}
    lift.hidden=true;lift.replaceChildren();
    document.querySelector('#treeCtxCommands').replaceChildren();
    document.querySelector('#treeCtxPreview').replaceChildren();
    if(restoreFocus){
      if(last?.isConnected&&last!==document.body)last.focus({preventScroll:true});
      else document.querySelector('[data-node="'+CSS.escape(origin||'')+'"]')?.focus({preventScroll:true});
    }
  };
  treeCtxClosing=finish;
  document.body.classList.remove('tree-ctx-open');
  document.documentElement.style.overflow='';
  modalBackground('tree',false);
  S.adding=null;
  treeCtxPreviousFocus=null;treeCtxOrigin=null;
  if(!restoreFocus||matchMedia('(prefers-reduced-motion:reduce)').matches){finish();return;}
  const transform=getComputedStyle(lift).transform;
  lift.getAnimations().forEach(a=>a.cancel());
  lift.animate([{transform},{transform:'none',boxShadow:'0 0 0 rgba(0,0,0,0)'}],
    {duration:170,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
  document.querySelector('#treeCtxStage').animate([{opacity:1},{opacity:0,transform:'translateY(3px) scale(.98)'}],{duration:120,fill:'forwards'});
  menu.animate([{backgroundColor:getComputedStyle(menu).backgroundColor,backdropFilter:'blur(5px)'},
    {backgroundColor:'transparent',backdropFilter:'blur(0px)'}],{duration:170,fill:'forwards'}).finished.then(finish,finish);
}
function treeCtxHit(x,y){
  if(!treeCtxOpen())return null;
  const b=document.elementFromPoint(x,y)?.closest?.('button');
  if(!b||!document.querySelector('#treeCtx').contains(b)||b.disabled)return null;
  if(b.matches('.act,.add-mode,.tree-ctx-back'))return b;
  return null;
}
function treeCtxClearHover(){
  document.querySelectorAll('#treeCtx .is-hovered').forEach(el=>el.classList.remove('is-hovered'));
}
function treeCtxHover(x,y){
  const hit=treeCtxHit(x,y);
  treeCtxClearHover();if(hit)hit.classList.add('is-hovered');
  return hit;
}
function treeCtxEndGesture(x,y,moved){
  const hit=treeCtxHit(x,y);treeCtxClearHover();
  if(moved&&hit)hit.click();
}
function bindTreeNodePress(m){
  treeCtxEnsure();
  m.querySelectorAll('[data-node-menu]').forEach(b=>b.onclick=()=>treeCtxShow(b.dataset.nodeMenu,b));
  m.querySelectorAll('[data-node]').forEach(b=>{
    let timer=null,touchId=null,touchStart=null,touchOpened=false,touchMoved=false,ignoreClickUntil=0;
    const clear=()=>{clearTimeout(timer);timer=null;b.classList.remove('is-pressing');};
    b.addEventListener('touchstart',e=>{
      if(e.touches.length!==1||treeCtxOpen())return;
      const t=e.touches[0];clear();
      touchId=t.identifier;touchStart={x:t.clientX,y:t.clientY};
      touchOpened=false;touchMoved=false;
      b.classList.add('is-pressing');
      timer=setTimeout(()=>{
        if(touchId===null||treeCtxOpen())return;
        touchOpened=true;ignoreClickUntil=performance.now()+1300;
        clearTimeout(timer);timer=null;treeCtxShow(b.dataset.node,b);
      },420);
    },{passive:true});
    b.addEventListener('touchmove',e=>{
      const t=[...e.touches].find(t=>t.identifier===touchId);
      if(!t||!touchStart)return;
      const d=Math.hypot(t.clientX-touchStart.x,t.clientY-touchStart.y);
      if(touchOpened){
        if(e.cancelable)e.preventDefault();
        if(d>12)touchMoved=true;
        treeCtxHover(t.clientX,t.clientY);
      }else if(d>12){touchId=null;touchStart=null;clear();}
    },{passive:false});
    b.addEventListener('touchend',e=>{
      const t=[...e.changedTouches].find(t=>t.identifier===touchId);if(!t)return;
      const wasOpen=touchOpened,moved=touchMoved;
      touchId=null;touchStart=null;touchOpened=false;touchMoved=false;
      clear();
      if(wasOpen){
        if(e.cancelable)e.preventDefault();
        treeCtxEndGesture(t.clientX,t.clientY,moved);
      }
    },{passive:false});
    b.addEventListener('touchcancel',()=>{
      const wasOpen=touchOpened;
      touchId=null;touchStart=null;touchOpened=false;clear();
      if(wasOpen)treeCtxClose();
    },{passive:true});
    b.addEventListener('pointerdown',e=>{
      if(e.pointerType==='touch'||e.button!==0||treeCtxOpen())return;
      if(treeCtxMouse){clearTimeout(treeCtxMouse.timer);treeCtxMouse.button.classList.remove('is-pressing');}
      b.classList.add('is-pressing');
      const press={id:e.pointerId,button:b,x:e.clientX,y:e.clientY,opened:false,moved:false,timer:null};
      treeCtxMouse=press;
      press.timer=setTimeout(()=>{
        if(treeCtxMouse!==press||treeCtxOpen())return;
        press.opened=true;ignoreClickUntil=performance.now()+1300;
        treeCtxShow(b.dataset.node,b);
      },420);
    });
    b.addEventListener('contextmenu',e=>{
      e.preventDefault();clear();
      ignoreClickUntil=performance.now()+1300;
      if(!treeCtxOpen())treeCtxShow(b.dataset.node,b);
    });
    b.addEventListener('keydown',e=>{
      if(e.key==='ContextMenu'||(e.key==='F10'&&e.shiftKey)){
        e.preventDefault();clear();treeCtxShow(b.dataset.node,b);
      }
    });
    b.addEventListener('click',e=>{
      if(performance.now()<ignoreClickUntil||treeCtxOpen()){
        e.preventDefault();return;
      }
      // Single tap means details, long press means context actions.
      select(b.dataset.node,true);
    });
  });
}
