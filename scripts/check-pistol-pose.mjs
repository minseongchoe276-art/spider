import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadMotionRig,point,disposeRig} from './lib/motion-rig.mjs';
const {actor}=await loadMotionRig();
for(const fps of [24,60,144])for(const yaw of Array.from({length:8},(_,i)=>i*Math.PI/4))for(const moving of [false,true]){
 const c=actor();
 try{
  c.gunModel=new THREE.Group();c.rightHand.add(c.gunModel);c.gunVisible=true;c.combatStance=true;c.visualYaw=c.targetFacingAngle=yaw;
  let maxStep=0,last=null;
  for(let i=0;i<fps;i++){
   const t=i/fps;c.combatAction=t<.35?{key:'gunIdle'}:{key:'gunFire',id:1,time:(t-.35)*.42/.65,duration:.42,travel:moving};
   c.update(1/fps,moving?'RUNNING':'IDLE',new THREE.Vector3(Math.sin(yaw)*3,0,Math.cos(yaw)*3).multiplyScalar(moving?1:0),null);
   c.group.updateMatrixWorld(true);
   const hand=point(c,'righthand');if(last)maxStep=Math.max(maxStep,hand.distanceTo(last));last=hand.clone();
   for(const bone of Object.values(c.bones))assert(bone.quaternion.toArray().every(Number.isFinite),'non-finite joint');
   for(const {bone,rest,limit} of c.jointConstraints || [])assert(rest.angleTo(bone.quaternion)<=limit+1e-3,`joint limit exceeded: ${bone.name}`);
   const barrel=new THREE.Vector3(1,0,0).applyQuaternion(c.gunModel.getWorldQuaternion(new THREE.Quaternion()));
   const forward=new THREE.Vector3(Math.sin(c.visualYaw),0,Math.cos(c.visualYaw));if(t>.3)assert(barrel.dot(forward)>.995,'barrel does not point forward');
  }
  assert(maxStep<.3,`hand jumps ${maxStep} at ${fps}fps`);
 }finally{disposeRig(c);}
}
console.log('PASS pistol idle/fire, moving/standing and eight headings at 24, 60 and 144 fps: finite joints, aim direction and hand continuity');
