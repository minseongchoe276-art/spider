import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadMotionRig,disposeRig,point,joint} from './lib/motion-rig.mjs';
import {boneId} from '../src/MotionRetarget.js';
globalThis.ProgressEvent ||= class {constructor(type,values){Object.assign(this,values);}};
const raw=fs.readFileSync('public/models/appearance-web.glb'),size=raw.readUInt32LE(12),data=JSON.parse(raw.subarray(20,20+size));
data.buffers[0].uri='data:application/octet-stream;base64,'+raw.subarray(28+size).toString('base64');
delete data.images;delete data.textures;data.materials=[];for(const m of data.meshes)for(const p of m.primitives)delete p.material;
const geometry=(await new GLTFLoader().parseAsync(JSON.stringify(data),'')).scene.getObjectByProperty('isSkinnedMesh',true).geometry;
const {actor}=await loadMotionRig(),results=[];
const fpsFilter=Number(process.argv.find(a=>a.startsWith('--fps='))?.split('=')[1]) || null;
const yawArg=process.argv.find(a=>a.startsWith('--yaw='));const yawFilter=yawArg?Number(yawArg.split('=')[1]):null;
for(const fps of [24,60,144])for(const yaw of [0,Math.PI/2,Math.PI,3*Math.PI/2]){
 if((fpsFilter && fps!==fpsFilter)||(yawFilter!==null && Math.round(yaw*180/Math.PI)!==yawFilter))continue;
 const c=actor(),mesh=c.model.getObjectByProperty('isSkinnedMesh',true);mesh.geometry=geometry;
 const normal=new T.Vector3(0,0,1).applyAxisAngle(new T.Vector3(0,1,0),yaw),side=new T.Vector3().crossVectors(new T.Vector3(0,1,0),normal);
 c.wallNormal=normal;c.wallDistance=.7;c.groundProbe=()=>null;c.group.position.copy(normal).multiplyScalar(.7).setY(4);
 const joints=mesh.skeleton.bones.map(b=>/^(head|neck|spine\d*)$/.test(boneId(b.name))),indices=geometry.attributes.skinIndex,weights=geometry.attributes.skinWeight;
 const vertices=[];
 for(let v=0;v<weights.count;v++){let weight=0;for(let k=0;k<4;k++)if(joints[indices.getComponent(v,k)])weight+=weights.getComponent(v,k);if(weight>.5)vertices.push(v);}
 const head=joint(c,'head'),headIndex=mesh.skeleton.bones.indexOf(head),bindHead=new T.Quaternion();
 mesh.skeleton.boneInverses[headIndex].clone().invert().decompose(new T.Vector3(),bindHead,new T.Vector3());
 const headForward=new T.Vector3(0,0,1).applyQuaternion(bindHead.invert());
 let minimum=Infinity,maxHoldError=0,maxCorrection=0,minimumHeadForwardY=1;
 try{for(let i=0;i<fps*3;i++){
  const t=i/fps,v=t<.8?new T.Vector3(0,2.8,0):t<1.6?new T.Vector3(0,2.8,0).addScaledVector(side,2.4):t<2?new T.Vector3():new T.Vector3(0,-2.8,0);
  c.group.position.addScaledVector(v,1/fps);c.update(1/fps,'WALL_RUNNING',v);c.group.updateMatrixWorld(true);
  if(t>.4)minimumHeadForwardY=Math.min(minimumHeadForwardY,headForward.clone().applyQuaternion(head.getWorldQuaternion(new T.Quaternion())).y);
  maxCorrection=Math.max(maxCorrection,c.wallBodyCorrection || 0);
  if(i%Math.max(1,Math.floor(fps/24))===0){
   const plane=c.group.position.dot(normal)-.7,p=new T.Vector3();
   for(const vertex of vertices){mesh.localToWorld(mesh.applyBoneTransform(vertex,p.fromBufferAttribute(geometry.attributes.position,vertex)));minimum=Math.min(minimum,p.dot(normal)-plane);}
  }
  for(const contact of Object.values(c.wallContacts))if(contact.stance && contact.age>.08)maxHoldError=Math.max(maxHoldError,point(c,contact.effectorId).distanceTo(contact.position));
 }
 console.log('MEASURE',fps,Math.round(yaw*180/Math.PI),{minimum,minimumHeadForwardY,maxHoldError});
 assert(minimumHeadForwardY>=-.12,'Head looks down into the wall: '+minimumHeadForwardY);
 assert(minimum>=.015,`Helmet/torso penetrates or crowds the facade: ${minimum}m`);
 assert(maxHoldError<.025,`Body clearance broke a planted hold: ${maxHoldError}m`);
 results.push({fps,yaw,minimum,maxHoldError,maxCorrection,minimumHeadForwardY,headAndTorsoVertices:vertices.length,envelopeVertices:c.wallBodyVertices?.length || 0,pass:true});
 }finally{disposeRig(c);}
}
fs.mkdirSync('docs/qa/wall-head-2026-10-21',{recursive:true});fs.writeFileSync('docs/qa/wall-head-2026-10-21/results.json',JSON.stringify(results,null,2));
console.log(`PASS ${results.length} real helmet/neck/torso clearance and planted-hold cases, 24/60/144fps, four facades, diagonal, hold and reverse`);
