import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadMotionRig,point,disposeRig} from './lib/motion-rig.mjs';
const {actor}=await loadMotionRig();
const scenarios=[
 {name:'stand-to-run',state:'RUNNING',velocity:new THREE.Vector3(0,0,4)},
 {name:'jump',state:'JUMPING',velocity:new THREE.Vector3(0,4,2)},
 {name:'fall',state:'FALLING',velocity:new THREE.Vector3(0,-5,2)},
 {name:'dodge',state:'IDLE',velocity:new THREE.Vector3(),action:{id:2,key:'dodgeLeft',time:.1,duration:.38}},
 {name:'hit',state:'IDLE',velocity:new THREE.Vector3(),action:{id:3,key:'hitHead',time:.1,duration:.65}},
 {name:'roll',state:'ROLLING',velocity:new THREE.Vector3(0,0,3)},
];
for(const fps of [24,60,144])for(const weapon of ['knife','gun'])for(const scenario of scenarios){
 const c=actor();
 try{
  c.gunModel=new THREE.Group();c.rightHand.add(c.gunModel);
  c.gunVisible=weapon==='gun';c.knifeVisible=weapon==='knife';c.combatStance=true;
  const key=weapon==='gun'?'gunFire':'knifeStab',duration=weapon==='gun'?.42:1.05;
  for(let i=0;i<Math.ceil(fps*.35);i++){
   c.combatAction={id:1,key,time:Math.min(.4,i/fps),duration};c.update(1/fps,'IDLE',new THREE.Vector3(),null);
  }
  let last=point(c,'righthand').sub(point(c,'hips')),maxStep=0;
  for(let i=0;i<Math.ceil(fps*.45);i++){
   c.combatAction=scenario.action?{...scenario.action,time:scenario.action.time+i/fps}:null;
   c.update(1/fps,scenario.state,scenario.velocity,null);c.group.updateMatrixWorld(true);
   const hand=point(c,'righthand').sub(point(c,'hips'));maxStep=Math.max(maxStep,hand.distanceTo(last));last.copy(hand);
   for(const bone of Object.values(c.bones))assert(bone.quaternion.toArray().every(Number.isFinite),`${scenario.name}: non-finite bone`);
   for(const {bone,rest,limit} of c.jointConstraints || [])assert(rest.angleTo(bone.quaternion)<=limit+1e-3,`${scenario.name}: joint limit ${bone.name}`);
  }
  if(weapon==='knife' && scenario.name==='jump' && fps===24)assert(maxStep<.30,`knife takeoff hand displacement ${(maxStep*100).toFixed(1)}cm`);
  assert(maxStep<.5,`${weapon} ${scenario.name} ${fps}fps: hand jump ${(maxStep*100).toFixed(1)}cm`);
 }finally{disposeRig(c);}
}
console.log('PASS weapon attack interruptions: run, jump, fall, dodge, hit and roll at 24/60/144 FPS');
