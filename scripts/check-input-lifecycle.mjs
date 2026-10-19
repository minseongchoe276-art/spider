import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GameApp} from '../src/main.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {PlayerExperience} from '../src/PlayerExperience.js';
import {PerformanceBudget} from '../src/PerformanceBudget.js';
import {Progression} from '../src/Progression.js';
import {cleanSettings,rebind} from '../src/PlayerSettings.js';

let passed=0,failed=0;
function check(name,run){try{run();passed++;console.log(`PASS ${name}`);}catch(error){failed++;console.error(`FAIL ${name}: ${error.message}`);}}
function node(){const classes=new Set();return {textContent:'',style:{},classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k),toggle(k,force){const add=force??!classes.has(k);if(add)classes.add(k);else classes.delete(k);return add;}}};}
function dom(run){const old={window:globalThis.window,document:globalThis.document,requestAnimationFrame:globalThis.requestAnimationFrame,setTimeout:globalThis.setTimeout};
  const nodes=new Map();globalThis.window=new EventTarget();window.devicePixelRatio=2;
  globalThis.document=new EventTarget();Object.assign(document,{getElementById:id=>nodes.get(id)||null,querySelector:()=>null,body:node()});
  globalThis.requestAnimationFrame=()=>{};
  globalThis.setTimeout=callback=>{callback();return 0;};
  try{return run(nodes);}finally{Object.assign(globalThis,old);}
}
function app(){const g=Object.create(GameApp.prototype),scene=new THREE.Scene();
  const audio=new Proxy({},{get:()=>()=>{}}),camera=new THREE.PerspectiveCamera();
  const city={buildingMeshes:[],colliders:[],playableHalfExtent:160,checkCollision:()=>({collided:false}),update(){}};
  const character={group:new THREE.Group(),update(){},fireWeb(){}};
  const physics=new SwingPhysics(scene,city,character,audio);physics.position.set(0,.1,0);physics.state='IDLE';
  Object.assign(g,{scene,canvas:new EventTarget(),camera,character,city,physics,audio,input:{},heldKeys:new Set(),
    preferences:{values:{settings:cleanSettings(),quality:'balanced',bestTimes:{}}},isPlaying:true,isPaused:false,
    combat:{mode:'web',guard(){},clearHeld(){},before(){},after(){}},tpsCamera:{mode:'follow',update(){}},timeTrial:{isActive:false,update(){}},
    vfx:{update(){}},renderer:{render(){}},showNotice(){},updateHUD(){},updateTrialHUD(){}});
  g.canvas.getBoundingClientRect=()=>({left:0,top:0,width:800,height:600});g.initInputListeners();return g;
}
function key(type,code,pad=false,touch=false){const event=new Event(type,{cancelable:true});Object.defineProperties(event,{code:{value:code},gamepadInput:{value:pad},touchInput:{value:touch},repeat:{value:false}});window.dispatchEvent(event);}
function mouse(g,type,button,pad=false,touch=false){const event=new Event(type,{cancelable:true});Object.defineProperties(event,{button:{value:button},target:{value:g.canvas},gamepadInput:{value:pad},touchInput:{value:touch},clientX:{value:400},clientY:{value:300}});window.dispatchEvent(event);}
function fakeClock(g){let now=0,last=0;g.clock={elapsedTime:0,getDelta(){const d=now-last;last=now;this.elapsedTime+=d;return d;}};return seconds=>{now+=seconds;};}

check('Keyboard and pad mode presses share one action until every source releases',()=>dom(()=>{
  const g=app();let calls=0;g.combat.toggle=()=>calls++;
  key('keydown','KeyQ');key('keydown','KeyQ',true);assert.equal(calls,1);
  key('keyup','KeyQ');key('keydown','KeyQ');assert.equal(calls,1,'The pad still owns the held action');
  key('keyup','KeyQ',true);key('keyup','KeyQ');key('keydown','KeyQ',true);assert.equal(calls,2);
}));
check('Remapped left/right modifiers do not double-toggle modes',()=>dom(()=>{
  const g=app();rebind(g.preferences.values.settings,'mode','ShiftLeft');let calls=0;g.combat.toggle=()=>calls++;
  key('keydown','ShiftLeft');key('keydown','ShiftRight');assert.equal(calls,1);
  key('keyup','ShiftLeft');assert(g.heldKeys.has('KeyQ'));key('keyup','ShiftRight');assert(!g.heldKeys.has('KeyQ'));
}));
check('Removed race key stays inactive while concurrent trick presses rearm correctly',()=>dom(()=>{
  const g=app();let races=0,tricks=0;g.toggleTimeTrial=()=>races++;g.physics.performAirTrick=()=>tricks++;
  for(const code of ['KeyR','KeyT']){key('keydown',code);key('keydown',code,true);key('keyup',code);key('keyup',code,true);key('keydown',code);key('keyup',code);}
  assert.equal(races,0);assert.equal(tricks,2);
}));
check('Two devices cannot toggle off the same held web button',()=>dom(()=>{
  const g=app();g.preferences.values.settings.webToggle=true;g.physics.state='FALLING';
  for(const button of [0,2]){const hold=button===0?'webHold':'webHoldRight';
    mouse(g,'mousedown',button);mouse(g,'mousedown',button,true);assert(g.input[hold]);
    mouse(g,'mouseup',button);mouse(g,'mouseup',button,true);assert(g.input[hold],'Toggle mode releases on a new press');
    mouse(g,'mousedown',button,true);assert(!g.input[hold]);mouse(g,'mouseup',button,true);
  }
}));
check('Toggle on then off between physics frames cancels both pending launches',()=>dom(()=>{
  const g=app();g.preferences.values.settings.webToggle=true;let shots=0;
  g.physics.findBestAnchor=()=>new THREE.Vector3(0,40,30);g.physics.startSwing=()=>{shots++;return false;};
  for(const button of [0,2]){mouse(g,'mousedown',button);mouse(g,'mouseup',button);mouse(g,'mousedown',button);mouse(g,'mouseup',button);}
  g.physics.update(1/60,g.input,g.camera);assert.equal(shots,0,'A cancelled toggle still fired a pending web');
}));
check('Resume drops time without animation frames while active stalls still count',()=>dom(()=>{
  const g=app(),advance=fakeClock(g);let timed=0;g.experience={update(_dt,elapsed){if(!g.isPaused)timed+=elapsed;}};
  g.setPaused(true);advance(90);g.setPaused(false);advance(1/60);g.animate();assert(Math.abs(timed-1/60)<1e-9);
  advance(.8);g.animate();assert(Math.abs(timed-(.8+1/60))<1e-9,'Active frame stalls must remain in elapsed frame time');
}));
check('A pad resume within the animation callback also excludes suspended time',()=>dom(()=>{
  const g=app(),advance=fakeClock(g);let timed=0;
  g.isPaused=true;g.experience={update(_dt,elapsed){if(!g.isPaused)timed+=elapsed;}};
  g.gamepad={update(){if(g.isPaused)g.setPaused(false);}};
  advance(60);g.animate();assert.equal(timed,0);
  advance(1/60);g.animate();assert(Math.abs(timed-1/60)<1e-9);
}));
check('Closing solo help drops suspended time while online help preserves active time',()=>dom(nodes=>{
  const g=app(),guide=node();guide.classList.add('hidden');nodes.set('controls-guide',guide);const advance=fakeClock(g);
  g.toggleHelp();advance(30);g.toggleHelp();advance(.02);assert(Math.abs(g.clock.getDelta()-.02)<1e-9);
  g.multiplayer={room:{phase:'playing'}};g.toggleHelp();advance(4);g.toggleHelp();assert(Math.abs(g.clock.getDelta()-4)<1e-9);
}));
check('Resuming cancels hidden key capture, but context-loss rejection leaves it available',()=>dom(()=>{
  const g=app();g.settingsPanel={pending:'forward',cancel(){this.pending=null;}};g.isPaused=true;
  g.contextLost=true;g.setPaused(false);assert.equal(g.settingsPanel.pending,'forward');assert(g.isPaused);
  g.contextLost=false;g.setPaused(false);assert.equal(g.settingsPanel.pending,null);assert(!g.isPaused);
}));
check('Touch movement coexists with keyboard and pad, clearing only its own stick',()=>dom(()=>{
  const g=app();key('keydown','KeyW');g.gamepadDirections={right:true};g.touchDirections={left:true,sprint:true};g.syncHeldInput();
  assert(g.input.forward&&g.input.right&&g.input.left&&g.input.sprint);
  g.touchDirections={};g.syncHeldInput();assert(g.input.forward&&g.input.right&&!g.input.left&&!g.input.sprint);
}));
check('Touch releases its web with desktop toggle enabled and preserves the opposite hand',()=>dom(()=>{
  const g=app();g.preferences.values.settings.webToggle=true;g.physics.state='FALLING';
  mouse(g,'mousedown',0,false,true);mouse(g,'mousedown',2,false,true);
  assert(g.input.webHold&&g.input.webHoldRight);
  mouse(g,'mouseup',0,false,true);assert(!g.input.webHold&&g.input.webHoldRight);
  mouse(g,'mouseup',2,false,true);assert(!g.input.webHoldRight);
}));
check('Keyboard-held guard survives a touch release of the same action',()=>dom(()=>{
  const g=app();let guarded=false;g.combat.guard=value=>guarded=value;
  key('keydown','KeyB');key('keydown','KeyB',false,true);key('keyup','KeyB',false,true);
  assert(guarded&&g.input.guard);key('keyup','KeyB');assert(!guarded&&!g.input.guard);
}));
check('Pause clears touch-owned keyboard, webs, and joystick',()=>dom(()=>{
  const g=app();key('keydown','KeyF',false,true);mouse(g,'mousedown',0,false,true);g.touchDirections={forward:true};g.syncHeldInput();
  g.setPaused(true);assert.equal(g.touchHeldKeys.size,0);assert.equal(g.touchMouseButtons.size,0);
  assert(!g.input.forward&&!g.input.wallRun&&!g.input.webHold);
}));
check('Space explicitly jumps from a grounded held strand without an automatic launch',()=>dom(()=>{
  const g=app();g.physics.position.set(0,.1,0);g.physics.state='IDLE';g.physics.findBestAnchor=()=>new THREE.Vector3(0,30,30);
  assert(g.physics.startSwing(g.camera));g.input.webHold=true;g.input.webFireHeld=true;
  g.physics.update(1/60,g.input,g.camera);assert.equal(g.physics.velocity.y,0);assert.equal(g.physics.position.y,.1);
  key('keydown','Space');assert(!g.physics.isSwinging&&g.input.jump);
  g.physics.update(1/60,g.input,g.camera);assert(g.physics.velocity.y>0);
}));
check('Pause preserves adaptive resolution and clears stale frame samples',()=>dom(()=>{
  const g=app(),e=Object.create(PlayerExperience.prototype),budget=new PerformanceBudget();budget.reset(.9);budget.samples=[70,90];budget.bad=1;
  Object.assign(e,{game:g,performance:budget,performanceActive:true,ghost:{mesh:{},update(){}},trajectory:{},stunts:{update(){}},safe:()=>false,visitTime:0,saveTime:0,previewTime:0});
  g.progression=new Progression();g.physics.webs=[];g.physics.gravity=9.8;let ratio;g.renderer.setPixelRatio=v=>{ratio=v;};
  g.isPaused=true;e.update(.1,12);assert.equal(budget.level,.9);assert.equal(budget.samples.length,0);assert.equal(budget.bad,0);assert.equal(ratio,undefined);
  g.isPaused=false;for(let i=0;i<151;i++)e.update(1/25,1/25);
  assert(Math.abs(budget.level-.7)<1e-9);assert(Math.abs(ratio-.7)<1e-9,'Recovery increased resolution while frames were slow');
}));

console.log(`Input lifecycle review: ${passed} passed, ${failed} failed.`);if(failed)process.exitCode=1;
