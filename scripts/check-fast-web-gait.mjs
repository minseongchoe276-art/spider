import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {loadMotionRig,point,joint,disposeRig} from './lib/motion-rig.mjs';
import {loadRuntimeSkin,useRuntimeSkin} from './lib/runtime-skin.mjs';
import {soleSamples,groundSoleNormal} from '../src/CharacterPose.js';
const {actor}=await loadMotionRig(),skin=await loadRuntimeSkin(),results=[];
for(const fps of [24,60,144])for(const speed of [7,9,12])for(const grade of [0,.3,-.3]){
 const c=actor();useRuntimeSkin(c,skin);const dt=1/fps,state=speed===12?'SPRINTING':'RUNNING';
 const normal=new T.Vector3(0,1,-grade).normalize();c.surfaceProbe=p=>({height:p.z*grade,normal:normal.clone()});
 let minClearance=Infinity,maxSlip=0,maxNormalStep=0,contacts=0,worstSlip=null;const last=new Map();
 try{
  const target=new T.Vector3(-5,15,30);
  for(let n=0;n<Math.ceil(1.2*fps);n++){
   const t=n/fps;if(n===Math.floor(fps*.2))c.fireWebMiss(target,'left');
   c.group.position.z+=speed*dt;c.group.position.y=.1+c.group.position.z*grade;
   c.update(dt,state,new T.Vector3(0,speed*grade,speed));
   for(const side of ['left','right']){
    const foot=point(c,side+'foot'),plant=c.movingPlants?.[side];
    if(plant?.age>.065){const old=last.get(side);if(old?.plant===plant){
     const drift=foot.clone().sub(old.foot);
     // Sole acquisition may move vertically to clear the curved boot. Skate
     // is displacement tangent to the actual support, not normal correction.
     maxNormalStep=Math.max(maxNormalStep,Math.abs(drift.dot(normal)));
     const slip=drift.projectOnPlane(normal).length();
     if(slip>maxSlip){maxSlip=slip;worstSlip={frame:n,age:plant.age,foot:foot.toArray(),previous:old.foot.toArray(),anchor:plant.position.toArray()};}
    }last.set(side,{plant,foot});contacts++;}else last.delete(side);
    for(const {mesh,vertex}of soleSamples(c,side)){
     const p=mesh.localToWorld(mesh.applyBoneTransform(vertex,new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,vertex)));
     minClearance=Math.min(minClearance,p.y-p.z*grade);
    }
    for(const {bone,rest,limit}of c.jointConstraints)assert(rest.angleTo(bone.quaternion)<limit+1e-5,'Final joint exceeded limit');
   }
  }
  const errors=[];if(minClearance<-.006)errors.push('skin penetration');if(maxSlip>=.035)errors.push('planted slip');
  results.push({fps,speed,grade,contacts,minClearance,maxSlip,maxNormalStep,clip:c.activeAction.getClip().name,playback:c.activeAction.getEffectiveTimeScale(),worstSlip,errors,status:errors.length?'FAIL':'PASS'});
 }finally{disposeRig(c);}
}
fs.writeFileSync('docs/qa/system-motion-2026-10-27/fast-web-gait.json',JSON.stringify({cases:results.length,skin:'published appearance-web',results},null,2)+'\n');
console.log(JSON.stringify(results.filter(r=>r.status==='FAIL'),null,2));
if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
console.log(`${results.filter(r=>r.status==='PASS').length}/${results.length} published-skin web gait cases at 7/9/12m/s: flat/up/down slopes, miss-shot overlay, mesh clearance, planted slip, final joint limits`);
