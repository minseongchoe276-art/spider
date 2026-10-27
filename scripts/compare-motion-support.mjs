import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import * as T from 'three';
import {loadMotionRig,joint,point,disposeRig} from './lib/motion-rig.mjs';
import {loadRuntimeSkin,useRuntimeSkin} from './lib/runtime-skin.mjs';
import {groundSoleNormal,soleSamples} from '../src/CharacterPose.js';
const folder='docs/qa/system-motion-2026-10-27';
function moduleUrl(source,overrides={}){
 const code=source.replace(/from\s+(['"])([^'"]+)\1/g,(_m,quote,spec)=>`from ${quote}${overrides[spec] || (spec.startsWith('.')?new URL('../src/'+spec.slice(2),import.meta.url).href:import.meta.resolve(spec))}${quote}`);
 return 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
}
const beforePose=moduleUrl(fs.readFileSync(folder+'/before/CharacterPose.js','utf8'));
const {Character:Before}=await import(moduleUrl(fs.readFileSync(folder+'/before/Character.js','utf8'),{'./CharacterPose.js':beforePose}));
const {actor}=await loadMotionRig(),skin=await loadRuntimeSkin(),results=[];
for(const version of ['before','after'])for(const key of ['jab','cross']){
 const c=actor();useRuntimeSkin(c,skin);if(version==='before')Object.setPrototypeOf(c,Before.prototype);
 c.visualYaw=c.targetFacingAngle=Math.PI;
 const start=performance.now();for(let n=0;n<180;n++){c.combatAction={key,id:1,time:.3,duration:1};c.update(1/60,'IDLE',new T.Vector3());}
 const ms=(performance.now()-start)/180,feet={};
 for(const side of ['left','right']){
  const normal=groundSoleNormal(c,side,joint(c,side+'foot').getWorldQuaternion(new T.Quaternion()));
  const heading=point(c,side+'toebase').sub(point(c,side+'foot')).setY(0).normalize(),lateral=new T.Vector3().crossVectors(heading,new T.Vector3(0,1,0));
  let min=Infinity;for(const{mesh,vertex}of soleSamples(c,side))min=Math.min(min,mesh.localToWorld(mesh.applyBoneTransform(vertex,new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,vertex))).y);
  feet[side]={lateralRoll:Math.asin(T.MathUtils.clamp(normal.dot(lateral),-1,1))*180/Math.PI,tilt:normal.angleTo(new T.Vector3(0,1,0))*180/Math.PI,skinClearance:min,ankle:point(c,side+'foot').toArray()};
 }
 results.push({version,key,meanUpdateMs:ms,feet});disposeRig(c);
}
fs.writeFileSync(folder+'/support-before-after.json',JSON.stringify({skin:'published appearance-web',fps:60,heldTime:.3,duration:1,results,performanceCaveat:'Warm-up and concurrent test load affect timings; this small sample is not an 8-player frame-rate benchmark.'},null,2)+'\n');
console.log(results.map(r=>`${r.version} ${r.key}: rear roll ${r.feet.right.lateralRoll.toFixed(2)}°, skin ${r.feet.right.skinClearance.toFixed(4)}m, ${r.meanUpdateMs.toFixed(3)}ms/update`).join('\n'));
