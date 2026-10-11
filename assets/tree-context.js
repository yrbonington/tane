/* Tree context interaction: deliberately separate from the legacy idea-card menu.
   Touch scroll stays native until the long press threshold is reached. */
'use strict';
let treeCtxMouse = null;
let treeCtxPreviousFocus = null;
let treeCtxOrigin = null;
let treeCtxOpenedAt = 0;
const treeCtxOpen = () => !!document.querySelector('#treeCtx:not([hidden])');
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
    '<div class="tree-ctx-commands" id="treeCtxCommands"></div></div>';
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
  const vw=innerWidth,vh=innerHeight;
  const w=stage.getBoundingClientRect().width,h=stage.getBoundingClientRect().height;
  const left=Math.max(16,Math.min(vw-w-16,anchor.left+anchor.width*.5-w*.5));
  // The preview stays close to the item; the menu reverses above a low item.
  const above=(anchor.top>vh*.57 && anchor.top>h*.5);
  stage.classList.toggle('above',above);
  const wantedTop=above?anchor.bottom-h:anchor.top-4;
  stage.style.left=left+'px';
  stage.style.top=Math.max(16,Math.min(vh-h-16,wantedTop))+'px';
}
function treeCtxRender(){
  if(!treeCtxOpen())return;
  const menu=document.querySelector('#treeCtx');
  const n=S.nodes.get(menu.dataset.node);
  if(!n){treeCtxClose();return;}
  const panel=document.querySelector('#treeCtxCommands');
  const mode=S.adding?.id===n.id?S.adding.mode:null;
  panel.innerHTML=actionBar(n);
  panel.classList.toggle('is-submenu',!!mode);
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
  if(treeCtxOpen())treeCtxClose(false);
  const menu=document.querySelector('#treeCtx');
  const row=opener?.matches?.('[data-node]')?opener:document.querySelector('[data-node="'+CSS.escape(id)+'"]');
  const rect=row?.getBoundingClientRect()||{left:innerWidth*.1,top:innerHeight*.3,bottom:innerHeight*.3+52,width:innerWidth*.8};
  menu._anchor={left:rect.left,top:rect.top,bottom:rect.bottom,width:rect.width};
  treeCtxPreviousFocus=document.activeElement;
  treeCtxOrigin=id;treeCtxOpenedAt=performance.now();
  S.sel=id;S.adding=null;
  document.querySelector('#treeCtxPreview').innerHTML='<span class="tree-ctx-level">L'+depth(id)+'</span>'+
    '<div class="tree-ctx-name" id="treeCtxHeading">'+esc(n.text)+'</div>'+
    (badges(n)?'<div class="meta">'+badges(n)+'</div>':'');
  menu.dataset.node=id;menu.hidden=false;
  document.body.classList.add('tree-ctx-open');
  document.documentElement.style.overflow='hidden';
  row?.classList.remove('is-pressing');
  treeCtxRender();treeCtxPosition();
  document.querySelector('#treeCtxStage').focus({preventScroll:true});
}
function treeCtxClose(restoreFocus=true){
  if(!treeCtxOpen())return;
  const menu=document.querySelector('#treeCtx');
  menu.hidden=true;delete menu.dataset.node;menu._anchor=null;
  document.body.classList.remove('tree-ctx-open');
  document.documentElement.style.overflow='';
  document.querySelector('#treeCtxCommands').replaceChildren();
  document.querySelector('#treeCtxPreview').replaceChildren();
  S.adding=null;
  const last=treeCtxPreviousFocus,origin=treeCtxOrigin;
  treeCtxPreviousFocus=null;treeCtxOrigin=null;
  if(restoreFocus){
    if(last?.isConnected)last.focus({preventScroll:true});
    else document.querySelector('[data-node="'+CSS.escape(origin||'')+'"]')?.focus({preventScroll:true});
  }
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
        clear();treeCtxShow(b.dataset.node,b);
      },520);
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
        b.classList.remove('is-pressing');treeCtxShow(b.dataset.node,b);
      },520);
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
