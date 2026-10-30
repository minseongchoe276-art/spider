import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as T from 'three';
import {loadMotionRig,joint,point,disposeRig} from './lib/motion-rig.mjs';
import {loadRuntimeSkin,useRuntimeSkin} from './lib/runtime-skin.mjs';
import {groundSoleNormal,soleSamples} from '../src/CharacterPose.js';
const {actor}=await loadMotionRig(),rows=[];
for(const mode of (process.env.CONTACT_QUICK?['web']:['web','combat'])){const skin=await loadRuntimeSkin(mode);for(const fps of (process.env.CONTACT_QUICK?[60]:[24,60,144]))for(const speed of [1.6,4.8,6.5]){
 const c=actor();useRuntimeSkin(c,skin);let min=Infinity,maxPlantGap=0,maxPlantRoll=0,maxSwingRoll=0,maxWorldSpeed=0,last={};
 try{for(let i=0;i<fps*2;i++){
 c.group.position.z+=speed/fps;c.update(1/fps,speed>6?'SPRINTING':'RUNNING',new T.Vector3(0,0,speed));
 for(const side of ['left','right']){const q=joint(c,side+'foot').getWorldQuaternion(new T.Quaternion()),normal=groundSoleNormal(c,side,q),heading=point(c,side+'toebase').sub(point(c,side+'foot')).setY(0).normalize(),lateral=new T.Vector3().crossVectors(heading,new T.Vector3(0,1,0)),roll=Math.abs(T.MathUtils.radToDeg(Math.asin(T.MathUtils.clamp(normal.dot(lateral),-1,1))));let low=Infinity;
 for(const {mesh,vertex}of soleSamples(c,side))low=Math.min(low,mesh.localToWorld(mesh.applyBoneTransform(vertex,new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,vertex))).y);min=Math.min(min,low);
 if(c.movingPlants?.[side]?.age>.1){maxPlantGap=Math.max(maxPlantGap,low);maxPlantRoll=Math.max(maxPlantRoll,roll);}else maxSwingRoll=Math.max(maxSwingRoll,roll);
 if(last[side]&&i>fps/2)maxWorldSpeed=Math.max(maxWorldSpeed,T.MathUtils.radToDeg(q.angleTo(last[side]))*fps);last[side]=q;
 }}assert(min>=-.005,`${mode} ${fps} ${speed}: sole penetration ${min}`);assert(maxPlantGap<.04,`${mode} ${fps} ${speed}: planted gap ${maxPlantGap}`);assert(maxPlantRoll<12,`${mode} ${fps} ${speed}: planted roll ${maxPlantRoll}`);rows.push({mode,fps,speed,min,maxPlantGap,maxPlantRoll,maxSwingRoll,maxWorldSpeed});}finally{disposeRig(c);}
}}
const out='docs/qa/ground-contact-2026-10-29';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(`${out}/${process.env.CONTACT_LABEL||'rig-before'}.json`,JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));
