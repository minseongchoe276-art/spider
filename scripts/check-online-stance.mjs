import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {CombatSystem} from '../src/Combat.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {loadMotionRig,disposeRig} from './lib/motion-rig.mjs';
const {actor}=await loadMotionRig(),results=[];
for(const state of ['ROLLING','TURNING','JUMPING','FALLING','WALL_RUNNING']){
 const c=actor(),p={state,position:new T.Vector3(),velocity:new T.Vector3()},combat=new CombatSystem(c.scene,p,c);combat.mode='combat';
 try{for(const key of ['attack','straight','heavy','special'])assert.equal(combat[key](null),false,`${state}: hidden ${key} accepted`);combat.guard(true);assert(!combat.blocking);results.push({state,pass:true});}finally{disposeRig(c);}
}
for(const fps of [24,60,144]){
 const c=actor(),city={colliders:[],buildingMeshes:[],checkCollision:()=>({collided:false})},audio=new Proxy({},{get:()=>()=>{}}),p=new SwingPhysics(c.scene,city,c,audio),combat=new CombatSystem(c.scene,p,c),camera=new T.PerspectiveCamera();camera.rotation.y=Math.PI;
 combat.allowGuardInWeb=true;p.position.set(0,.1,0);p.state='IDLE';
 try{
  for(let f=0;f<fps;f++){const input={guard:true,forward:true};combat.before(1/fps,camera,input);p.update(1/fps,input,camera);combat.after(1/fps);}
  assert(!combat.blocking,'Wire mode must not accept a legacy guard capability');assert.equal(combat.mode,'web');assert(p.position.z>5,'Wall/wire movement must not be slowed by invisible guard');
  combat.toggle({});p.position.set(0,.1,0);p.velocity.set(0,0,0);p.state='IDLE';c.stopAnimation();
  for(let f=0;f<fps;f++){const input={guard:true,forward:true};combat.before(1/fps,camera,input);p.update(1/fps,input,camera);combat.after(1/fps);}
  assert(combat.blocking);assert.equal(c.activeAction,c.actions.walk);assert(c.movingGuardWeight>.9,'A combatant must visibly guard while stepping');
  assert(p.position.z>p.walkSpeed*.35*.75&&p.position.z<p.walkSpeed*.35*1.05,`Combat guard travel ${p.position.z} must follow combat walk speed, not web speed`);
  p.state='JUMPING';combat.before(1/fps,camera,{guard:true});assert(!combat.blocking,'Combatant retained airborne guard');
  results.push({fps,runnerWireGuard:false,combatGuard:true,travel:p.position.z,clip:'walk',guardWeight:c.movingGuardWeight,pass:true});
 }finally{disposeRig(c);}
}
fs.writeFileSync('docs/qa/eight-player-2026-10-21/online-stance.json',JSON.stringify({passed:results.length,results},null,2)+'\n');console.log('PASS',results.length,'real input/recovery cases: no invisible attacks/guard and wire-mode guard rejected and combat guard visibly steps');
