import fs from 'node:fs';import assert from 'node:assert/strict';import * as T from 'three';
import {loadMotionRig,point,disposeRig} from './lib/motion-rig.mjs';
import {GameApp} from '../src/main.js';import {CombatSystem,ATTACKS} from '../src/Combat.js';import {SwingPhysics} from '../src/SwingPhysics.js';import {City} from '../src/City.js';import {cleanSettings} from '../src/PlayerSettings.js';
const {actor}=await loadMotionRig(),saved={window:globalThis.window,document:globalThis.document},results=[];
const directions=[['KeyW'],['KeyS'],['KeyA'],['KeyD'],['ArrowUp','ArrowLeft'],['ArrowUp','ArrowRight'],['ArrowDown','ArrowLeft'],['ArrowDown','ArrowRight']];
try{for(const codes of directions)for(const skill of ['left','right','KeyE','KeyF']){
 globalThis.window=new EventTarget();window.devicePixelRatio=1;globalThis.document=new EventTarget();Object.assign(document,{getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],body:{classList:{toggle(){}}}});
 const c=actor(),audio=new Proxy({},{get:()=>()=>{}}),camera=new T.PerspectiveCamera();camera.userData.movementYaw=0;
 const p=new SwingPhysics(c.scene,{colliders:[],buildingMeshes:[],raycast:City.prototype.raycast,checkCollision:City.prototype.checkCollision},c,audio);p.position.set(0,.1,0);p.previousFixedPosition.copy(p.position);p.renderPosition.copy(p.position);p.state='IDLE';
 const g=Object.create(GameApp.prototype),canvas=new EventTarget();canvas.getBoundingClientRect=()=>({left:0,top:0,width:800,height:600});
 Object.assign(g,{scene:c.scene,character:c,physics:p,camera,audio,canvas,input:{},heldKeys:new Set(),preferences:{values:{settings:cleanSettings()}},isPlaying:true,isPaused:false,tpsCamera:{handleMouseMove(){}},showNotice(){}});g.combat=new CombatSystem(c.scene,p,c);g.initInputListeners();
 const key=(type,code)=>{const e=new Event(type,{cancelable:true});Object.defineProperties(e,{code:{value:code},repeat:{value:false}});window.dispatchEvent(e);};
 const mouse=(type,button)=>{const e=new Event(type,{cancelable:true});Object.defineProperties(e,{button:{value:button},target:{value:canvas},clientX:{value:400},clientY:{value:300}});window.dispatchEvent(e);};
 const tick=()=>{g.combat.before(1/60,camera,g.input);p.update(1/60,g.input,camera);g.combat.after(1/60);};
 try{
  key('keydown','KeyQ');key('keyup','KeyQ');for(const code of codes)key('keydown',code);key('keydown','ShiftLeft');for(let i=0;i<30;i++)tick();
  if(skill==='left'||skill==='right')mouse('mousedown',skill==='left'?0:2);else key('keydown',skill);
  const expected={left:'jab',right:'cross',KeyE:'heavy',KeyF:'guard'}[skill];
  if(expected==='guard'){for(let i=0;i<25;i++)tick();assert(g.combat.blocking);assert.equal(c.combatAction?.key,'guard');key('keyup','KeyF');for(let i=0;i<12;i++)tick();assert(!g.combat.blocking&&c.combatAction?.key!=='guard','Released F remained in guard');key('keydown','KeyF');tick();assert(g.combat.blocking);}
  else{assert.equal(g.combat.action?.key,expected);for(let i=0;i<Math.round(ATTACKS[expected].duration*.28*60);i++)tick();assert.equal(c.combatAction?.key,expected);}
  assert(Math.hypot(p.velocity.x,p.velocity.z)>.5,'Movement disappeared while the real input action played');
  key('keydown','Space');key('keyup','Space');for(let i=0;i<3;i++)tick();assert(['JUMPING','FALLING'].includes(p.state));assert(!g.combat.action&&!g.combat.blocking,'Ground action survived takeoff');assert.equal(c.movingGuardWeight,0,'Ground upper layer survived takeoff');
  if(skill==='left'||skill==='right')mouse('mouseup',skill==='left'?0:2);else key('keyup',skill);
  for(const code of codes)key('keyup',code);key('keyup','ShiftLeft');assert(!g.input.forward&&!g.input.backward&&!g.input.left&&!g.input.right);
  results.push({codes,skill,pass:true});
 }finally{disposeRig(c);}
}}
finally{Object.assign(globalThis,saved);}
fs.writeFileSync('docs/qa/moving-actions-2026-10-27/real-input.json',JSON.stringify(results,null,2));console.log(`PASS ${results.length} real keyboard / arrow / mouse combinations, jump interruption and key release`);
