import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {loadMotionRig,joint,point,disposeRig} from './lib/motion-rig.mjs';
import {ATTACKS} from '../src/Combat.js';
import {groundSoleNormal,soleSamples} from '../src/CharacterPose.js';
import {JOINT_SPEEDS} from '../src/JointConstraints.js';
const {actor}=await loadMotionRig(),results=[];
const caseFilter=process.argv.find(arg=>arg.startsWith('--case='))?.slice(7);
for(const fps of [24,60,144])for(const speed of [0,4.4,6.5])for(const key of ['combatIdle','jab','cross','hook','special']){
 if(caseFilter && !caseFilter.split(',').includes(`${fps}:${speed}:${key}`))continue;
 const c=actor(),dt=1/fps,velocity=new T.Vector3(0,0,speed),state=speed?'RUNNING':'IDLE';
 let maxContactTilt=0,maxFlatTilt=0,maxLateralRoll=0,maxHeelPitch=0,maxBootStep=0,contacts=0,forefootContacts=0,minimumSole=Infinity,minSkinClearance=Infinity,maxSupportGap=0;
 const previous=new Map();
 try{
  c.combatStance=true;
  const update=()=>{
   // Match the controller's planted-strike braking. Forcing the capsule to
   // travel at full sprint while the strike plants a foot is not live input.
   const planting=!!ATTACKS[c.combatAction?.key];
   velocity.z=T.MathUtils.damp(velocity.z,planting?0:speed,planting?32:9,dt);
   c.group.position.addScaledVector(velocity,dt);
   c.update(dt,planting?'IDLE':state,velocity);c.group.updateMatrixWorld(true);
  };
  for(let i=0;i<fps/2;i++){c.combatAction={key:'combatIdle'};update();}
  const duration=ATTACKS[key]?.duration || 1.2;
  for(let i=0;i<=Math.ceil(duration*fps)+Math.ceil(fps*.3);i++){
   c.combatAction=i/fps<duration?{id:1,key,time:i/fps,duration}:{key:'combatIdle'};update();
   for(const side of ['left','right']){
    const foot=joint(c,side+'foot'),plant=c.movingPlants?.[side];
    const rotation=foot.quaternion.clone(),last=previous.get(side);
    if(last)maxBootStep=Math.max(maxBootStep,last.angleTo(rotation));previous.set(side,rotation);
    if(plant?.age>.1){
     const normal=groundSoleNormal(c,side,foot.getWorldQuaternion(new T.Quaternion()));
     const tilt=normal.angleTo(plant.normal)*180/Math.PI;maxContactTilt=Math.max(maxContactTilt,tilt);contacts++;
     const ankle=point(c,side+'foot'),toe=point(c,side+'toebase');
     const forward=toe.clone().sub(ankle).projectOnPlane(plant.normal).normalize();
     const lateral=new T.Vector3().crossVectors(forward,plant.normal).normalize();
     // Toe-off raises the whole boot; it does not bend the ankle by that
     // world-space angle. Keep the flat-support bound, and independently
     // bound pitch/roll and actual mesh contact for forefoot support.
     if(ankle.clone().sub(toe).dot(plant.normal)>.10){
      forefootContacts++;
      maxLateralRoll=Math.max(maxLateralRoll,Math.abs(Math.asin(T.MathUtils.clamp(normal.dot(lateral),-1,1))*180/Math.PI));
      maxHeelPitch=Math.max(maxHeelPitch,Math.abs(Math.atan2(normal.dot(forward),normal.dot(plant.normal))*180/Math.PI));
     }else maxFlatTilt=Math.max(maxFlatTilt,tilt);
     let clearance=Infinity;
     for(const {mesh,vertex} of soleSamples(c,side)){
      const p=mesh.localToWorld(mesh.applyBoneTransform(vertex,new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,vertex)));
      clearance=Math.min(clearance,p.y); // This test's support plane is y=0.
     }
     minSkinClearance=Math.min(minSkinClearance,clearance);maxSupportGap=Math.max(maxSupportGap,clearance);
    }
    const toe=joint(c,side+'toebase');
    minimumSole=Math.min(minimumSole,point(c,side+'foot').y,toe.getWorldPosition(new T.Vector3()).y);
   }
  }
  results.push({fps,speed,key,maxContactTilt,maxFlatTilt,maxLateralRoll,maxHeelPitch,forefootContacts,minSkinClearance,maxSupportGap,maxBootDegreesPerSecond:maxBootStep*fps*180/Math.PI,contacts,minimumSole});
 }finally{disposeRig(c);}
}
// Frozen review samples and repeated contact frames must be idempotent.
// This reproduces switching from a held jab to G, which previously raised
// the rear ankle above 0.6m as cached mixer values stopped resetting the IK.
const heldResults=[];
if(!process.argv.includes('--continuous-only'))for(const fps of [24,60,144])for(const key of ['combatIdle','jab','cross','hook','special'])for(const phase of [.15,.3,.56,.75,.98]){
 if(caseFilter && !caseFilter.split(',').includes(`${fps}:${speed}:${key}`))continue;
 const c=actor(),dt=1/fps,velocity=new T.Vector3();
 try{
  c.combatAction={id:1,key:'jab',time:.58*.72,duration:.72};
  for(let i=0;i<fps/3;i++){c.update(dt,'IDLE',velocity);c.group.updateMatrixWorld(true);}
  c.stopAnimation();
  c.combatAction={id:2,key,time:phase*(ATTACKS[key]?.duration || 1.2),duration:ATTACKS[key]?.duration || 1.2};
  let settled;
  for(let i=0;i<fps*1.5;i++){
   c.update(dt,'IDLE',velocity);c.group.updateMatrixWorld(true);
   if(i===Math.ceil(fps*.8))settled=['leftfoot','rightfoot'].map(id=>point(c,id));
  }
  const drift=Math.max(...['leftfoot','rightfoot'].map((id,i)=>point(c,id).distanceTo(settled[i])));
  const height=Math.max(point(c,'leftfoot').y,point(c,'rightfoot').y);

  assert(drift<.003,`${key} held at ${phase}: IK drifted ${drift.toFixed(4)}m at ${fps}FPS`);
  if(['jab','cross','special'].includes(key))assert(height<.4,`${key} held at ${phase}: rear boot floated ${height.toFixed(2)}m`);
  heldResults.push({fps,key,phase,drift,maxAnkleHeight:height});
 }finally{disposeRig(c);}
}
const folder='docs/qa/combat-feet-2026-10-19';fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(folder+'/results.json',JSON.stringify({continuous:results,held:heldResults},null,2)+'\n');
for(const r of results){
 assert(r.contacts>0,`${r.key} ${r.fps}FPS ${r.speed}m/s: no support contacts`);
 assert(r.maxFlatTilt<35,`${r.key}: flat support tilted ${r.maxFlatTilt.toFixed(2)} degrees`);
 assert(r.maxContactTilt<45 && r.maxLateralRoll<25 && r.maxHeelPitch<35,`${r.key} ${r.fps}FPS ${r.speed}m/s: excessive heel lift/roll ${JSON.stringify(r)}`);
 assert(r.minSkinClearance>=-.005 && r.maxSupportGap<.035,`${r.key}: actual planted boot lost surface contact ${JSON.stringify(r)}`);
 assert(r.minimumSole>=-.01,`${r.key}: boot penetrated the ground`);
 assert(r.maxBootDegreesPerSecond<JOINT_SPEEDS.foot+.05,`${r.key}: rendered boot snapped at ${r.maxBootDegreesPerSecond.toFixed(0)}deg/s`);
}
console.log(`PASS: ${results.length} continuous and ${heldResults.length} held combat/return-to-guard foot cases at 24/60/144 FPS, standing/running/sprinting`);
