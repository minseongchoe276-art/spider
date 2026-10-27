import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {UPPERCUT,uppercutSpeed} from '../src/DashingUppercut.js';
import {CombatSystem} from '../src/Combat.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {City} from '../src/City.js';
import {RemoteMotion,capturePose} from '../src/RemoteMotion.js';
import {VFXManager} from '../src/VFX.js';
import {loadMotionRig,point,disposeRig} from './lib/motion-rig.mjs';
import {createTrainingOpponent,poseTrainingOpponent} from '../src/TrainingOpponent.js';
const {actor}=await loadMotionRig(),results=[];
for(const fps of [24,60,144]){
 let distance=0;for(let t=0;t<UPPERCUT.duration;t+=1/fps)distance+=uppercutSpeed(t,t+1/fps)/fps;
 assert(Math.abs(distance-UPPERCUT.distance)<1e-6,'Dash integration must be FPS independent');
 for(const wall of [false,true]){
  const c=actor(),city={colliders:wall?[{minX:-5,maxX:5,minY:0,maxY:5,minZ:1.5,maxZ:1.7}]:[],buildingMeshes:[],raycast:City.prototype.raycast,checkCollision:City.prototype.checkCollision};
  const p=new SwingPhysics(c.scene,city,c,new Proxy({},{get:()=>()=>{}}));p.position.set(0,.1,0);p.previousFixedPosition.copy(p.position);p.renderPosition.copy(p.position);p.state='IDLE';
  let effects=0,impacts=0;const combat=new CombatSystem(c.scene,p,c,{vfx:{spawnUppercutImpact(){effects++;}},onImpact(){impacts++;}}),camera=new T.PerspectiveCamera();camera.userData.movementYaw=0;camera.lookAt(0,0,1);camera.updateMatrixWorld(true);combat.toggle();
  const training=createTrainingOpponent('dummy'),e={...training,mesh:training.group,position:new T.Vector3(0,.1,3.25),health:100,stagger:0,flash:0,windup:0};e.mesh.position.copy(e.position);combat.enemies=[e];
  assert(combat.special(camera));assert(!combat.special(camera));assert.equal(combat.specialCooldown,8);
  let maxHandY=-Infinity,maxStep=0,last=null,contactTime=null;
  try{
   for(let i=0;i<Math.ceil(fps*1.7);i++){
    combat.before(1/fps,camera,{});p.update(1/fps,{},camera);combat.after(1/fps);poseTrainingOpponent(e,1/fps);
    const hand=point(c,'righthand').sub(c.group.position);maxHandY=Math.max(maxHandY,hand.y);if(last)maxStep=Math.max(maxStep,hand.distanceTo(last));last=hand;
    if(e.health<100 && contactTime==null)contactTime=(i+1)/fps;
    if(combat.action?.key==='special')assert.equal(c.activeAction.getClip().name,'special','The authored full-body uppercut owns the dash');
    for(const b of Object.values(c.bones))assert(b.quaternion.toArray().every(Number.isFinite));
   }
   assert(maxHandY>1.75,'Fist must visibly rise above the chin');assert(maxStep<.85,'No discontinuous hand jump');
   if(wall){assert(p.position.z<.85,'Dash must stop at the swept wall');assert.equal(e.health,100);assert.equal(effects,0);}
   else {assert(Math.abs(p.position.z-2.1)<.16,`Unexpected dash distance ${p.position.z}`);assert.equal(e.health,52);assert.equal(effects,1);assert.equal(impacts,1);assert(contactTime>=UPPERCUT.from && contactTime<=UPPERCUT.to+1/fps);}
   results.push({fps,wall,distance:p.position.z,maxHandY,maxHandStep:maxStep,contactTime,effects});
  }finally{disposeRig(c);}
 }
}
// Hurt, mode gating, resources and interruption must not retain dash movement.
{
 const c=actor(),p={state:'IDLE',position:new T.Vector3(),velocity:new T.Vector3(),facingAngle:0},combat=new CombatSystem(new T.Scene(),p,c);assert(!combat.special());combat.toggle();combat.stamina=34;assert(!combat.special());combat.stamina=100;combat.special();combat.invulnerable=0;combat.receiveDamage(12,{position:new T.Vector3(0,0,1)});combat.before(.01,null,{});assert.notEqual(p.combatMotion.key,'special');assert.equal(p.combatMotion.direction,null);disposeRig(c);
}
// Dedicated incoming reaction lifts only the visual model and returns to floor.
for(const fps of [24,60,144]){
 const c=actor(),p={state:'IDLE',position:new T.Vector3(),velocity:new T.Vector3(),facingAngle:0},combat=new CombatSystem(new T.Scene(),p,c);combat.toggle();combat.reactToHit(48,{variant:'uppercut'});assert.equal(combat.action.key,'hitUppercut');let peak=0;
 for(let i=0;i<fps*1.3;i++){combat.before(1/fps,null,{});c.update(1/fps,'IDLE',new T.Vector3());peak=Math.max(peak,c.model.position.y);}
 assert(peak>.4);assert(Math.abs(c.model.position.y+.1)<1e-5);assert.equal(p.position.y,0,'Visual launch must not change authoritative position');disposeRig(c);
}
// Incoming uppercut and rising attack also retain their clocks on remote rigs.
for(const key of ['special','hitUppercut'])for(const fps of [24,60,144]){
 const c=actor(),player={id:'qa',x:0,y:.1,z:0,facing:0,team:'red'},city={colliders:[],supportHeight:()=>0};
 const remote=new RemoteMotion(new T.Scene(),c,player,city);
 try{c.combatStance=true;c.combatAction={id:7,key,time:.48,duration:key==='special'?UPPERCUT.duration:.95};c.update(1/fps,'IDLE',new T.Vector3());
 const packet=capturePose({state:'IDLE',velocity:new T.Vector3()},c);assert.equal(packet.combat.key,key);remote.receive(player,packet,1000);remote.update(1/fps,1000);
 assert.equal(remote.character.combatAction.key,key);assert.equal(remote.character.activeAction.getClip().name,key);assert(remote.character.model.position.toArray().every(Number.isFinite));
 }finally{remote.dispose();disposeRig(c);}
}
// Real pooled VFX must ascend, respect reduced motion and retire every particle.
{
 const old=globalThis.document;delete globalThis.document;
 const vfx=new VFXManager(new T.Scene());globalThis.document=old;
 for(const reduced of [false,true]){vfx.reducedMotion=reduced;vfx.spawnUppercutImpact(new T.Vector3(),new T.Vector3(0,0,1));const particles=vfx.particles.filter(p=>p.active);assert.equal(particles.length,reduced?6:22);assert(particles.every(p=>p.vel.y>0));for(let i=0;i<60;i++)vfx.update(1/60);assert(!vfx.particles.some(p=>p.active));}
}
fs.mkdirSync('docs/qa/dashing-uppercut-2026-10-27',{recursive:true});fs.writeFileSync('docs/qa/dashing-uppercut-2026-10-27/results.json',JSON.stringify(results,null,2)+'\n');console.table(results);console.log('PASS dashing uppercut: FPS-independent dash, full-body rising strike, one contact/effect, swept walls, interruption, cooldown, pooled/reduced VFX');
