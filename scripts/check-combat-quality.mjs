import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {loadMotionRig,point,joint,disposeRig} from './lib/motion-rig.mjs';
import {ATTACKS,CombatSystem} from '../src/Combat.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {City} from '../src/City.js';
const {actor}=await loadMotionRig(),results=[];
const sample=(c,key,phase)=>{c.stopAnimation();c.fadeToAction(key,0);c.activeAction.time=c.activeAction.getClip().duration*phase;c.mixer.update(0);c.group.updateMatrixWorld(true);return {left:point(c,'lefthand'),right:point(c,'righthand'),elbow:point(c,'rightforearm')};};
const c=actor();try{
 for(const [key,file] of [['jab','Lead Jab'],['cross','Mixamo Cross Punch'],['rightHook','Mixamo Rear Hook'],['special','Surprise Uppercut']]){
  const clip=c.actions[key].getClip();
  assert.equal(clip.userData.source,`/models/${file}.fbx`);
  assert.equal(clip.userData.authoredMixamo,true);
  assert.equal(clip.userData.choreography,undefined,'Basic punches must retain imported body motion');
  const impact=clip.userData.impactPhase*ATTACKS[key].duration;
  assert(impact>=ATTACKS[key].from && impact<=ATTACKS[key].to,'Imported punch must match damage timing');
 }
 // The authored rear hook has its own arc and supporting-hand motion.
 // Validate its usable motion and continuity instead of matching the retired
 // procedural hook's exact 90-degree elbow and fixed opposite-hand position.
 const guard=sample(c,'rightHook',0);let previous=guard.right,maxHookStep=0,maxHookReach=0;
 for(let frame=1;frame<=100;frame++){
  const pose=sample(c,'rightHook',frame/100);
  assert([...pose.left.toArray(),...pose.right.toArray(),...pose.elbow.toArray()].every(Number.isFinite));
  maxHookStep=Math.max(maxHookStep,pose.right.distanceTo(previous));
  maxHookReach=Math.max(maxHookReach,pose.right.distanceTo(guard.right));previous=pose.right;
 }
 assert(maxHookReach>.2,'Imported hook must visibly articulate');
 assert(maxHookStep<.2,'Imported hook contains a discontinuous hand jump between adjacent samples');
 const impact=c.actions.special.getClip().userData.impactPhase;
 const ready=sample(c,'special',0),wind=sample(c,'special',.12),hit=sample(c,'special',impact),recoverPower=sample(c,'special',.999999);
 assert(wind.right.y<ready.right.y+.2,'G must load low before rising');
 assert(hit.right.y>wind.right.y+.55,'G must drive the fist upward through contact');
 assert(hit.right.y>1.6,'G must rise to head height');
 assert(recoverPower.right.distanceTo(ready.right)<.02,'G must recover to its starting guard');
 assert(ATTACKS.special.from<=impact*ATTACKS.special.duration && ATTACKS.special.to>=impact*ATTACKS.special.duration);
 assert(ATTACKS.special.from>.4,'G wind-up must not deal damage');
 assert(ATTACKS.special.damage>ATTACKS.cross.damage && ATTACKS.special.damage>ATTACKS.jab.damage);
 results.push({case:'imported dashing uppercut and retained hook',maxHookStep,maxHookReach,pass:true});
}finally{disposeRig(c);}
for(const fps of [24,60,144])for(const key of ['jab','cross','rightHook'])for(const sprint of [false,true]){
 const requested=process.argv.find(arg=>arg.startsWith('--case='))?.slice(7);if(requested&&requested!==`${fps}:${key}:${sprint}`)continue;
 const c=actor(),city={colliders:[],buildingMeshes:[],raycast:City.prototype.raycast,checkCollision:City.prototype.checkCollision};
 const p=new SwingPhysics(c.scene,city,c,new Proxy({},{get:()=>()=>{}})),combat=new CombatSystem(c.scene,p,c),camera=new THREE.PerspectiveCamera();camera.lookAt(0,0,1);camera.updateMatrixWorld(true);combat.toggle();
 p.position.set(0,.1,0);p.previousFixedPosition.copy(p.position);p.renderPosition.copy(p.position);p.state='IDLE';
 try{
  // Establish a moving guard before entering the strike, as during real play.
  for(let i=0;i<fps;i++){combat.before(1/fps,camera);p.update(1/fps,{forward:true,sprint},camera);combat.after(1/fps);}
  const start=p.position.clone();
  if(key==='jab')assert(combat.attack(camera));
  else {const random=Math.random;try{Math.random=()=>key==='rightHook'?0:.99;assert(combat.straight(camera));assert.equal(combat.action.key,key);}finally{Math.random=random;}}
  let active=0,maxStep=0,last=null,maxStepPhase=null;
  for(let i=0;i<Math.ceil(fps*ATTACKS[key].duration);i++){
   combat.before(1/fps,camera);p.update(1/fps,{forward:true,sprint},camera);combat.after(1/fps);
   if(combat.action){
    active++;
    const clip=Object.entries(c.actions).find(([,action])=>action===c.activeAction)?.[0];
    assert(['walk','regularRun','run'].includes(clip),`${key}: moving strike left the stride (${clip})`);
    if(combat.action.time>=ATTACKS[key].from && combat.action.time<=ATTACKS[key].to)
      assert(Math.hypot(p.velocity.x,p.velocity.z)>1,'Moving strike braked the stride');
   }
   const hand=point(c,key==='jab'?'lefthand':'righthand').sub(c.group.position);
   if(last&&hand.distanceTo(last)>maxStep){maxStep=hand.distanceTo(last);maxStepPhase=combat.action?.time??null;}last=hand;
   for(const {bone,rest,limit} of c.jointConstraints)assert(rest.angleTo(bone.quaternion)<=limit+1e-5,'Rendered joint exceeded anatomical bounds');
  }
  const travel=p.position.distanceTo(start);
  assert(travel>0.8,'Moving strike stopped the body');
  combat.cancel();
  for(let i=0;i<Math.ceil(fps*.3);i++){combat.before(1/fps,camera);p.update(1/fps,{forward:true,sprint},camera);}
  assert(Math.hypot(p.velocity.x,p.velocity.z)>2,'Held movement did not resume after recovery');
  assert(active>fps*ATTACKS[key].duration*.7);assert(maxStep<25/fps,`${key} (sprint=${sprint}): visible hand snapped ${maxStep}m at ${fps}fps phase ${maxStepPhase}`);
  results.push({fps,key,sprint,travel,maxHandStep:maxStep,pass:true});
 }finally{disposeRig(c);}
}
for(const key of ['jab','cross','special']){
 const c=actor();try{
  const clip=c.actions[key].getClip();
  c.combatAction={id:1,key,time:ATTACKS[key].duration*clip.userData.impactPhase,duration:ATTACKS[key].duration};
  for(let i=0;i<30;i++)c.update(1/60,'IDLE',new THREE.Vector3());
  const tilt={};for(const side of ['left','right']){
   const level=c.model.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().fromArray(c.actions.wall.getClip().userData.soleRotations[side]));
   const normal=new THREE.Vector3(0,1,0).applyQuaternion(level.clone().invert()).applyQuaternion(joint(c,side+'foot').getWorldQuaternion(new THREE.Quaternion()));
   tilt[side]=normal.angleTo(new THREE.Vector3(0,1,0))*180/Math.PI;
   assert(tilt[side]<(clip.userData.authoredMixamo?35:5),`${key}: ${side} supporting boot points down (${tilt[side]} degrees)`);
  }
  results.push({case:key+' contact boots retain bounded authored pivot',tiltDegrees:tilt,pass:true});
 }finally{disposeRig(c);}
}
// Moving between attacks must retain the same closed guard as combat idle.
{
 const c=actor();try{
  c.combatStance=true;
  c.update(1/60,'RUNNING',new THREE.Vector3(0,0,4.4));
  const fingers=['left','right'].flatMap(side=>c.webFingerRig[side].map(item=>item.bone));
  const moving=fingers.map(bone=>bone.quaternion.clone());
  c.combatAction={key:'combatIdle'};c.update(1/60,'RUNNING',new THREE.Vector3(0,0,4.4));
  assert(fingers.every((bone,i)=>moving[i].angleTo(bone.quaternion)<1e-5),'Moving guard opened between punches');
  c.combatAction=null;c.combatStance=false;c.update(1/60,'RUNNING',new THREE.Vector3(0,0,4.4));
  assert(fingers.some((bone,i)=>moving[i].angleTo(bone.quaternion)>.1),'Leaving combat did not release the finger guard');
  results.push({case:'third-person moving guard stays closed between attacks',pass:true});
 }finally{disposeRig(c);}
}
// Exercise the live callback wiring: swing/flip/landing must never bank points.
const {PlayerExperience}=await import('../src/PlayerExperience.js');
const oldDocument=globalThis.document,oldWindow=globalThis.window;
try{
 globalThis.document={getElementById:()=>null,createElement:()=>({setAttribute(){},append(){}})};globalThis.window={addEventListener(){}};
 const notices=[],game={scene:new THREE.Scene(),physics:{},character:{},combat:{},city:{},audio:{playSurfaceStep(){}},showNotice:m=>notices.push(m),showStuntNotice:m=>notices.push(m)};
 const experience=new PlayerExperience(game,{getItem:()=>null,setItem(){}});
 game.physics.onStuntCallback('스윙 연결',80);game.character.onAirTrickComplete('front');game.physics.onLanding(new THREE.Vector3(),10);
 assert(!Object.hasOwn(game.progression.data,'score'));assert.equal(experience.stunts,undefined);assert.equal(notices.length,0);
 game.physics.onStuntCallback('이동 안내',0);assert.deepEqual(notices,['이동 안내']);
 results.push({case:'swing, trick and landing callbacks cannot score or show combo notices',pass:true});
}finally{globalThis.document=oldDocument;globalThis.window=oldWindow;}
const folder='docs/qa/combat-quality-2026-10-18';fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(folder+'/results.json',JSON.stringify(results,null,2)+'\n');
console.log(`PASS ${results.length} combat quality cases: curved right hook, imported rising uppercut, contact timing, running/sprinting at 24/60/144 FPS, bounded rendered joints`);
