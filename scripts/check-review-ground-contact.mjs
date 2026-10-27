import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {loadMotionRig,point,joint,disposeRig} from './lib/motion-rig.mjs';
import {loadRuntimeSkin,useRuntimeSkin} from './lib/runtime-skin.mjs';
import {attachReviewFloor} from '../src/ReviewFloor.js';
import {groundSoleNormal,soleSamples} from '../src/CharacterPose.js';
const {actor}=await loadMotionRig(),results=[],skin=await loadRuntimeSkin();
const folder='docs/qa/system-motion-2026-10-27';
for(const fps of [24,60,144])for(const hand of ['left','right','both'])for(const key of ['jab','cross','hook','heavy','special','guard']){
 const c=actor();useRuntimeSkin(c,skin);delete c.groundProbe;delete c.surfaceProbe;attachReviewFloor(c);
 c.visualYaw=c.targetFacingAngle=Math.PI;c.model.rotation.set(0,Math.PI,0);
 try{
  for(const side of hand==='both'?['left','right']:[hand])c.fireWeb(new T.Vector3(side==='left'?-2:2,4,-10),side);
  let minimum=Infinity,maxTilt=0,maxGap=0,minSupport=Infinity,maxLateralRoll=0;
  // Match the actual standalone review, including its frozen action time.
  for(let n=0;n<Math.ceil(fps*1.1);n++){
   if(n/fps>=.35){c.webAttachments=[];c.webLaunchTimers={};c.webShotTimer=0;c.webShotAnchor=null;c.persistentWebAnchor=null;c.combatAction={key,id:1,time:.3,duration:1};}
   c.update(1/fps,'IDLE',new T.Vector3());
   for(const side of ['left','right']){
    const boot=soleSamples(c,side);let low=Infinity;
    for(const {mesh,vertex}of boot)low=Math.min(low,mesh.localToWorld(mesh.applyBoneTransform(vertex,new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,vertex))).y);
    minimum=Math.min(minimum,low);
    if(n/fps>.8){
     minSupport=Math.min(minSupport,low);
     if(c.movingPlants?.[side]?.age>.08)maxGap=Math.max(maxGap,low);
     const normal=groundSoleNormal(c,side,joint(c,side+'foot').getWorldQuaternion(new T.Quaternion()));
     maxTilt=Math.max(maxTilt,normal.angleTo(new T.Vector3(0,1,0))*180/Math.PI);
     const heading=point(c,side+'toebase').sub(point(c,side+'foot')).setY(0).normalize();
     maxLateralRoll=Math.max(maxLateralRoll,Math.abs(Math.asin(T.MathUtils.clamp(normal.dot(new T.Vector3().crossVectors(heading,new T.Vector3(0,1,0))),-1,1)))*180/Math.PI);
    }
   }
  }
  assert(minimum>=-.005,`${fps} ${hand}->${key}: skin below floor by ${minimum}`);
  assert(maxTilt<35,`${fps} ${hand}->${key}: boot rolled ${maxTilt} degrees`);
  if(['jab','cross'].includes(key))assert(maxLateralRoll<12,`${fps} ${hand}->${key}: lateral boot roll ${maxLateralRoll}`);
  assert(maxGap<.055,`${fps} ${hand}->${key}: grounded boot floated ${maxGap}m`);
  const before=['leftfoot','rightfoot'].map(id=>point(c,id));
  for(let n=0;n<fps;n++)c.update(1/fps,'IDLE',new T.Vector3());
  const drift=Math.max(...before.map((p,i)=>p.distanceTo(point(c,i?'rightfoot':'leftfoot'))));
  assert(drift<.015,`${key} held pose drift ${drift}`);
  results.push({fps,hand,key,minimum,maxGap,maxTilt,maxLateralRoll,drift,status:'PASS'});
 }finally{disposeRig(c);}
}
fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(folder+'/review-contact.json',JSON.stringify({cases:results.length,results},null,2)+'\n');
console.log(`PASS ${results.length} standalone review web/combat combinations: actual skinned soles, world support tilt, held-pose drift, 24/60/144 FPS`);
