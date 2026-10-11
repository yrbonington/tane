import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const file = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=file('index.html');
const gesture=file('assets/tree-context.js');
const styles=file('assets/tree-context.css');
const worker=file('sw.js');

test('all application JavaScript parses',()=>{
  const embedded=html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  assert.ok(embedded,'inline app script exists');
  assert.doesNotThrow(()=>new Script(embedded,{filename:'index.html'}));
  assert.doesNotThrow(()=>new Script(gesture,{filename:'tree-context.js'}));
  assert.doesNotThrow(()=>new Script(worker,{filename:'sw.js'}));
});

test('tree exposes context menu by long-press rather than injecting actions',()=>{
  assert.match(html,/bindTreeNodePress\(m\)/);
  assert.doesNotMatch(html,/\$\{sel\?\`\$\{actionBar\(n\)\}/);
  assert.match(html,/data-node-menu=/);
  assert.match(html,/タップで分析 · 長押しで操作/);
  assert.match(gesture,/setTimeout\(\(\)=>\{/);
  assert.match(gesture,/\,420\)/);
  assert.match(gesture,/treeCtxShow\(b\.dataset\.node,b\)/);
});

test('all input methods and dismissal work paths are wired',()=>{
  for(const token of [
    "'touchstart'","'touchmove'","'touchend'","'touchcancel'",
    "'pointerdown'","'pointermove'","'pointerup'","'pointercancel'",
    "'contextmenu'","'keydown'","'Escape'","'ContextMenu'",
    "'Tab'","visualViewport","'resize'"
  ])assert.ok(gesture.includes(token),token);
  assert.match(gesture,/treeCtxEndGesture\(t\.clientX,t\.clientY,moved\)/);
  assert.match(gesture,/treeCtxHover\(t\.clientX,t\.clientY\)/);
  assert.match(gesture,/bindTreeNodePress\(m\)/);
});

test('accessibility, small screens, dark mode and reduced motion',()=>{
  assert.match(html,/aria-haspopup="dialog"/);
  assert.match(gesture,/aria-modal="true"/);
  assert.match(gesture,/aria-labelledby="treeCtxHeading"/);
  assert.match(styles,/prefers-color-scheme:dark/);
  assert.match(styles,/prefers-reduced-motion:reduce/);
  assert.match(styles,/max-height:calc\(100dvh - 32px\)/);
  assert.match(styles,/tree-node-more/);
});

test('PWA caches its newly split interface assets',()=>{
  assert.match(html,/href="assets\/tree-context\.css\?v=65"/);
  assert.match(html,/href="assets\/ui-polish\.css\?v=65"/);
  assert.match(html,/src="assets\/tree-context\.js\?v=65"/);
  assert.match(worker,/tane-v68/);
  assert.match(html,/sw\.js\?v=65/);
  assert.match(worker,/\.\/assets\/tree-context\.css/);
  assert.match(worker,/\.\/assets\/tree-context\.js/);
});
