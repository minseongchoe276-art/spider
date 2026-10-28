import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GameApp} from '../src/main.js';
import {cleanSettings,canonicalKey,rebind} from '../src/PlayerSettings.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {Character} from '../src/Character.js';
import {ATTACKS,CombatSystem} from '../src/Combat.js';
import {CombatPractice} from '../src/CombatPractice.js';
import {Multiplayer} from '../src/Multiplayer.js';
import {capturePose} from '../src/RemoteMotion.js';

const camera=new THREE.PerspectiveCamera(),audio=new Proxy({},{get:()=>()=>{}});
const results=[];
const check=(name,run)=>{run();results.push(name);console.log(`PASS ${name}`);};
function body(){const p=new SwingPhysics(new THREE.Scene(),{buildingMeshes:[],colliders:[],checkCollision:()=>({collided:false})},
  {group:new THREE.Group(),update(){},fireWeb(){},triggerAirTrick(){this.isTricking=true;}},audio);
  p.position.set(0,.1,0);p.state='IDLE';return p;}
function withDOM(run){const old={window:globalThis.window,document:globalThis.document};
  globalThis.window=new EventTarget();window.devicePixelRatio=2;
  globalThis.document=new EventTarget();Object.assign(document,{getElementById:()=>null,querySelector:()=>null,body:{classList:{toggle(){}}}});
  try{return run();}finally{Object.assign(globalThis,old);}}
function app(){const g=Object.create(GameApp.prototype);Object.assign(g,{canvas:new EventTarget(),physics:body(),camera,audio,
  input:{},heldKeys:new Set(),isPlaying:true,isPaused:false,preferences:{values:{settings:cleanSettings()}},
  combat:{mode:'web',guard(){},clearHeld(){}}});g.initInputListeners();return g;}
function key(type,code,pad=false){const e=new Event(type,{cancelable:true});Object.defineProperties(e,{code:{value:code},gamepadInput:{value:pad}});window.dispatchEvent(e);}
function mouse(g,type,button,pad=false){const e=new Event(type,{cancelable:true});Object.defineProperties(e,{button:{value:button},target:{value:g.canvas},gamepadInput:{value:pad},clientX:{value:400},clientY:{value:300}});window.dispatchEvent(e);}

check('Aliases obey modifier remaps; help and mute cannot be swallowed',()=>{
  const settings=cleanSettings();rebind(settings,'wall','ShiftLeft');
  assert.equal(canonicalKey('ShiftRight',settings),'KeyF');
  assert.equal(canonicalKey('KeyF',settings),'ShiftLeft');
  rebind(settings,'jump','ControlLeft');assert.equal(canonicalKey('ControlRight',settings),'Space');
  rebind(settings,'wall','AltLeft');assert.equal(canonicalKey('AltRight',settings),'KeyF');
  assert(!rebind(settings,'forward','KeyH'));assert(!rebind(settings,'forward','KeyM'));
});
check('Releasing one of W/Up or two Shift keys leaves the other held',()=>withDOM(()=>{
  const g=app();key('keydown','KeyW');key('keydown','ArrowUp');key('keyup','KeyW');assert(g.input.forward);
  key('keyup','ArrowUp');assert(!g.input.forward);
  key('keydown','ShiftLeft');key('keydown','ShiftRight');key('keyup','ShiftLeft');assert(g.input.sprint);
  key('keyup','ShiftRight');assert(!g.input.sprint);
  g.preferences.values.settings.sprintToggle=true;
  key('keydown','ShiftLeft');key('keydown','ShiftRight');assert(g.input.sprint,'Two physical shifts toggled sprint twice');
  g.clearInput();assert.equal(g.keyboardKeySources.size,0);
}));
check('Mouse and gamepad release preserve the other device tether; middle drag survives a left release',()=>withDOM(()=>{
  const g=app();g.physics.state='FALLING';g.canvas.getBoundingClientRect=()=>({left:0,top:0,width:800,height:600});
  let releases=0;g.physics.releaseWebButton=()=>releases++;
  mouse(g,'mousedown',0);mouse(g,'mousedown',0,true);mouse(g,'mouseup',0,true);
  assert(g.input.webHold);assert.equal(releases,0);
  mouse(g,'mouseup',0);assert(!g.input.webHold);assert.equal(releases,1);
  mouse(g,'mousedown',1);mouse(g,'mousedown',0);mouse(g,'mouseup',0);assert(g.cameraDragActive);
  mouse(g,'mouseup',1);assert(!g.cameraDragActive);
}));
check('Insufficient contact time rejects unfinished tricks while a high jump allows them',()=>{
  const p=body();p.state='JUMPING';p.position.y=.8;p.velocity.y=1;p.update(0,{},camera);
  assert(p.character.contactTime<.7);assert(!p.performAirTrick('front'));
  p.position.y=12;p.velocity.y=12;p.update(0,{},camera);assert(p.performAirTrick('front'));
});
check('Grounded launch uses takeoff pose until the rope becomes taut',()=>{
  const p=body();p.findBestAnchor=()=>new THREE.Vector3(0,30,30);assert(p.startSwing(camera));
  const pose=capturePose(p,p.character);assert.equal(pose.state,'JUMPING');assert.equal(pose.webs.length,1);assert.equal(p.webs[0].launchPending,true);assert.equal(p.velocity.y,p.jumpForce);
  p.webs[0].launchPending=false;assert.equal(capturePose(p,p.character).state,'SWINGING');
});
check('Holding guard buffers through a punch and releases immediately',()=>{
  const p=body(),c=new CombatSystem(new THREE.Scene(),p,p.character);c.toggle();assert(c.attack(camera));
  c.guard(true);assert(!c.blocking);
  for(let n=0;n<Math.ceil(ATTACKS.jab.duration*120)+2;n++)c.before(1/120,camera,{guard:true});
  assert(c.blocking);c.before(1/120,camera,{guard:false});assert(!c.blocking);
});
check('Fallback character actually rotates, completes once, and cancels on landing',()=>{
  const c=Object.create(Character.prototype);Object.assign(c,{placeholder:new THREE.Group(),targetFacingAngle:0,webShotTimer:0,updateWeb(){}});
  let completed=0;c.onAirTrickComplete=()=>completed++;c.triggerAirTrick('front');
  c.update(.2,'FALLING',new THREE.Vector3(),null);assert(Math.abs(c.placeholder.rotation.x)>.2);
  for(let n=0;n<120;n++)c.update(1/120,'FALLING',new THREE.Vector3(),null);
  assert.equal(completed,1);assert(!c.isTricking);assert.equal(c.placeholder.rotation.x,0);
  c.triggerAirTrick('front');c.update(.1,'IDLE',new THREE.Vector3(),null);assert(!c.isTricking);assert.equal(completed,1);
});
check('Help suspends solo simulation and race clock, Escape closes it, and online continues',()=>withDOM(()=>{
  const g=app(),hidden=new Set(['hidden']),hint={};const guide={classList:{toggle(k){hidden.has(k)?hidden.delete(k):hidden.add(k);},contains:k=>hidden.has(k)},querySelector:()=>hint};
  document.getElementById=id=>id==='controls-guide'?guide:null;
  g.toggleHelp();assert(g.helpOpen);assert(g.gameplaySuspended);assert.match(hint.textContent,/일시정지/);
  let simulated=0,timed=0;Object.assign(g,{clock:{getDelta:()=>.05,elapsedTime:0},city:{update(){}},assetsReady:true,
    physics:{update(){simulated++;},clearPendingInput(){}},timeTrial:{update(){timed++;}},renderer:{render(){}},contextLost:false});
  const old=globalThis.requestAnimationFrame;globalThis.requestAnimationFrame=()=>{};
  try{g.animate();assert.equal(simulated,0);assert.equal(timed,0);}finally{globalThis.requestAnimationFrame=old;}
  key('keydown','Escape');assert(!g.helpOpen);assert(!g.isPaused);
  g.multiplayer={room:{phase:'playing'}};g.toggleHelp();assert(!g.gameplaySuspended);assert.match(hint.textContent,/계속/);
}));
check('Disabling adaptive quality restores the selected manual resolution immediately',()=>withDOM(()=>{
  const g=Object.create(GameApp.prototype),quality={value:'balanced'};document.getElementById=id=>id==='graphics-quality'?quality:null;
  let ratio;Object.assign(g,{preferences:{values:{quality:'balanced',muted:false,reducedMotion:false,settings:cleanSettings({autoQuality:false})}},
    appliedQuality:'balanced',appliedAutoQuality:true,renderer:{setPixelRatio(v){ratio=v;},shadowMap:{}},tpsCamera:{},physics:{},city:{},timeTrial:{},audio:{isMuted:false},applyWebTheme(){}});
  g.applyPreferences();assert.equal(ratio,1.5);
}));

check('A fatal projectile retires all old shots before the next can damage a respawn',()=>{
  const scene=new THREE.Scene(),p=body(),g={scene,physics:p,camera,city:{raycast:()=>null}};
  const enemy={health:100,type:'dummy',position:new THREE.Vector3(0,.1,0),mesh:new THREE.Group(),body:{material:{emissive:{setHex(){}}}},bar:{scale:{},quaternion:new THREE.Quaternion()},ring:{},flash:0,stagger:0,cooldown:1,windup:0};
  let hits=0;g.combat={enemies:[enemy],receiveDamage(){hits++;this.enemies=[];},clearEnemies(){this.enemies=[];}};
  const practice=Object.create(CombatPractice.prototype);Object.assign(practice,{game:g,active:true,projectiles:[0,1].map(()=>{
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(.1),new THREE.MeshBasicMaterial());mesh.position.set(0,1.1,0);scene.add(mesh);return {mesh,enemy,velocity:new THREE.Vector3(),life:1};})});
  practice.update(1/60);assert.equal(hits,1);assert(!practice.active);assert.equal(practice.projectiles.length,0);assert.equal(scene.children.length,0);
});
console.log(`PASS ${results.length} expert audit regressions`);
