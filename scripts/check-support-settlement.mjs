import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {loadMotionRig,joint,point,disposeRig} from './lib/motion-rig.mjs';
import {loadRuntimeSkin,useRuntimeSkin} from './lib/runtime-skin.mjs';
import {clearGroundSoles,fitGroundAnkle,soleSamples} from '../src/CharacterPose.js';
const {actor}=await loadMotionRig(),results=[];
function clearance(c,side,gx,gz){return Math.min(...soleSamples(c,side).map(({mesh,vertex})=>{const p=mesh.localToWorld(mesh.applyBoneTransform(vertex,new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,vertex)));return p.y-gx*p.x-gz*p.z;}));}
for(const mode of ['web','combat']){const skin=await loadRuntimeSkin(mode);for(const fps of [24,60,144])for(const [gx,gz]of [[0,0],[.2,0],[0,-.2]]){
 const c=actor();useRuntimeSkin(c,skin);const normal=new T.Vector3(-gx,1,-gz).normalize();c.surfaceProbe=p=>({height:gx*p.x+gz*p.z,normal});
 try{
  for(let n=0;n<fps;n++)c.update(1/fps,'IDLE',new T.Vector3());
  c.combatStance=true;c.combatAction={key:'combatIdle',duration:0,time:0};
  for(let n=0;n<fps;n++)c.update(1/fps,'IDLE',new T.Vector3());
  for(const side of ['left','right'])assert(clearance(c,side,gx,gz)<.008,`${mode}/${fps}: settled combat ${side} boot floats`);
  c.combatStance=false;c.combatAction=null;for(let n=0;n<fps/2;n++)c.update(1/fps,'IDLE',new T.Vector3());
  const foot=joint(c,'leftfoot'),hip=joint(c,'leftupleg'),knee=joint(c,'leftleg'),rotation=foot.getWorldQuaternion(new T.Quaternion());
  c.solveLimb(hip,knee,foot,point(c,'leftfoot').add(new T.Vector3(0,.028,0)),.995);fitGroundAnkle(c,'left',foot,rotation);
  const before=clearance(c,'left',gx,gz);assert(before>.015,`Fixture failed to create support gap: ${before}`);
  c.limbPoseDelta=1/fps;let min=before;
  for(let n=0;n<Math.ceil(fps*.45);n++){clearGroundSoles(c,{preserveLocal:true});min=Math.min(min,clearance(c,'left',gx,gz));}
  const after=clearance(c,'left',gx,gz);assert(after<.006,`${mode}/${fps}/${gx}/${gz}: supported boot gap ${after}`);assert(min>=-.002,`Settlement penetrated terrain ${min}`);
  // A deliberately lifted boot is not a small support error.
  c.solveLimb(hip,knee,foot,point(c,'leftfoot').add(new T.Vector3(0,.2,0)),.995);fitGroundAnkle(c,'left',foot,rotation);const lifted=point(c,'leftfoot');
  clearGroundSoles(c,{preserveLocal:true});assert(point(c,'leftfoot').distanceTo(lifted)<.002,'Settlement pulled down an airborne boot');
  results.push({mode,fps,gx,gz,before,after,min});
 }finally{disposeRig(c);}
}}
const folder='docs/qa/support-settlement-2026-10-29';fs.mkdirSync(folder,{recursive:true});const path=folder+'/rig.json';fs.writeFileSync(path,JSON.stringify({cases:results.length,results},null,2));console.log(`PASS ${results.length} real-skin support gaps: settle below 6mm without terrain penetration or pulling down lifted boots`);
