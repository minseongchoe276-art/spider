import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadMotionRig,point,disposeRig} from './lib/motion-rig.mjs';
const {actor}=await loadMotionRig();
for(const fps of [24,60,144]){
 const c=actor();
 try{
  c.knifeVisible=true;c.combatStance=true;c.combatAction={key:'knifeIdle'};
  for(let i=0;i<fps;i++)c.update(1/fps,'RUNNING',new THREE.Vector3(0,0,3),null);
  assert(c.strikeLayers?.has(c.actions.knifeIdle.getClip()),'Running must use the knife stance');
  c.combatAction=null;
  c.update(1/fps,'JUMPING',new THREE.Vector3(0,3,0),null);
  assert.equal(c.airGuardClip,c.actions.knifeIdle.getClip(),'Jump must retain the knife stance');
  const positions=[];c.combatAction={id:1,key:'knifeStab',time:0,duration:1.05,travel:true};
  for(let i=0;i<=fps;i++){
   c.combatAction.time=Math.min(1.04,i/fps*1.05);
   c.update(1/fps,'RUNNING',new THREE.Vector3(0,0,3),null);
   c.group.updateMatrixWorld(true);positions.push(point(c,'righthand').clone());
   for(const bone of Object.values(c.bones))assert(bone.quaternion.toArray().every(Number.isFinite),'Non-finite bone rotation');
  }
  assert(c.strikeLayers?.has(c.actions.knifeStab.getClip()),'Moving attack must use the stab');
  assert(Math.max(...positions.map(p=>p.distanceTo(positions[0])))>.15,'Stabbing hand did not move');
  console.log(`PASS ${fps} fps: knife stance while running/jumping, moving stab and finite joint rotations`);
 }finally{disposeRig(c);}
}
