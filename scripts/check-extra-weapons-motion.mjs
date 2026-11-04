import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadMotionRig, point, disposeRig} from './lib/motion-rig.mjs';
const {actor}=await loadMotionRig();
const cases=[
  {name:'run',state:'RUNNING',velocity:new THREE.Vector3(0,0,4)},
  {name:'jump',state:'JUMPING',velocity:new THREE.Vector3(0,4,2)},
  {name:'fall',state:'FALLING',velocity:new THREE.Vector3(0,-5,2)},
  {name:'dodge',state:'IDLE',velocity:new THREE.Vector3(),action:{id:2,key:'dodgeLeft',time:.1,duration:.38}},
  {name:'hit',state:'IDLE',velocity:new THREE.Vector3(),action:{id:3,key:'hitHead',time:.1,duration:.65}},
  {name:'roll',state:'ROLLING',velocity:new THREE.Vector3(0,0,3)},
];
for(const fps of [24,60,144]) for(const type of ['baseball-bat','metal-pipe','sniper-rifle']) for(const scenario of cases){
 const c=actor(), rifle=type==='sniper-rifle';
 try{
  const mount=new THREE.Group(); c.rightHand.add(mount);c.extraWeapons={[type]:mount};c.extraWeapon=type;c.extraWeaponVisible=true;
  c.gunVisible=rifle;c.combatStance=true;
  const key=rifle?'gunFire':'heavy',duration=rifle?.42:1.05;
  for(let i=0;i<Math.ceil(fps*.35);i++){
   c.combatAction={id:1,key,time:Math.min(.4,i/fps),duration};c.update(1/fps,'IDLE',new THREE.Vector3(),null);
  }
  let last=point(c,'righthand').sub(point(c,'hips')),maxStep=0;
  for(let i=0;i<Math.ceil(fps*.45);i++){
   c.combatAction=scenario.action?{...scenario.action,time:scenario.action.time+i/fps}:null;
   c.update(1/fps,scenario.state,scenario.velocity,null);c.group.updateMatrixWorld(true);
   const hand=point(c,'righthand').sub(point(c,'hips'));maxStep=Math.max(maxStep,hand.distanceTo(last));last.copy(hand);
   for(const bone of Object.values(c.bones))assert(bone.quaternion.toArray().every(Number.isFinite),`${type} ${scenario.name}: invalid joint`);
   for(const {bone,rest,limit} of c.jointConstraints || [])assert(rest.angleTo(bone.quaternion)<=limit+1e-3,`${type} ${scenario.name}: joint limit ${bone.name}`);
  }
  assert(maxStep<.5,`${type} ${scenario.name} ${fps}fps: hand jump ${maxStep}`);
 }finally{disposeRig(c);}
}
for(const yaw of [0,Math.PI/2,Math.PI,3*Math.PI/2]){
 const c=actor();try{
  const mount=new THREE.Group();c.rightHand.add(mount);c.extraWeapons={'sniper-rifle':mount};c.extraWeapon='sniper-rifle';c.extraWeaponVisible=true;c.gunVisible=true;c.combatStance=true;c.visualYaw=c.targetFacingAngle=yaw;
  for(let i=0;i<60;i++){c.combatAction={key:'gunIdle'};c.update(1/60,'IDLE',new THREE.Vector3(),null);}
  c.group.updateMatrixWorld(true);
  const axis=new THREE.Vector3(0,0,-1).applyQuaternion(mount.getWorldQuaternion(new THREE.Quaternion()));
  assert(axis.dot(new THREE.Vector3(Math.sin(c.visualYaw),0,Math.cos(c.visualYaw)))>.99,`rifle direction at ${yaw}`);
 }finally{disposeRig(c);}
}
console.log('PASS extra weapons: attack transitions at 24/60/144 FPS and rifle aim in four directions');
