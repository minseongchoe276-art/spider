import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Character } from '../src/Character.js';
import { boneId } from '../src/MotionRetarget.js';
import { MOTIONS } from '../src/MotionCatalog.js';
import { planMantle, mantlePosition } from '../src/LedgeTraversal.js';
import { SwingPhysics } from '../src/SwingPhysics.js';
import { StreamedCollision } from '../src/StreamedCollision.js';

globalThis.ProgressEvent=class {constructor(type,values){Object.assign(this,values);}};
const data=fs.readFileSync('public/models/shadow-pulse-rig.glb'),length=data.readUInt32LE(12);
const json=JSON.parse(data.subarray(20,20+length));
json.buffers[0].uri=`data:application/octet-stream;base64,${data.subarray(28+length).toString('base64')}`;
delete json.images;delete json.textures;json.materials=[];
json.meshes.forEach(m=>m.primitives.forEach(p=>delete p.material));
const scene=(await new GLTFLoader().parseAsync(JSON.stringify(json),'')).scene;
const original=[];scene.traverse(n=>original.push({n,p:n.position.clone(),q:n.quaternion.clone()}));
function actor() {
  original.forEach(({n,p,q})=>{n.position.copy(p);n.quaternion.copy(q);});
  const c=Object.create(Character.prototype);
  Object.assign(c,{model:scene,group:new THREE.Group(),actions:{},bones:{},activeAction:null,
    lastState:null,bodyPitch:0,targetFacingAngle:0,trickRotation:0,idleTime:0,webShotTimer:0,
    currentHand:'right',groundProbe:()=>0,updateWeb(){}});
  c.group.add(scene);c.group.position.y=0.1;c.mixer=new THREE.AnimationMixer(scene);
  scene.traverse(b=>{if(b.isBone)c.bones[b.name]=b;});
  for(const m of MOTIONS) {
    const data=JSON.parse(fs.readFileSync(`public/motions/${m.key}.json`));
    const clip=THREE.AnimationClip.parse(data);clip.userData=data.userData;
    const a=c.mixer.clipAction(clip);a.setLoop(m.loop?THREE.LoopRepeat:THREE.LoopOnce);a.clampWhenFinished=!m.loop;c.actions[m.key]=a;
  }
  return c;
}
const bone=(c,id)=>Object.values(c.bones).find(b=>boneId(b.name)===id);
const position=(c,id)=>bone(c,id).getWorldPosition(new THREE.Vector3());
function finite(c) {
  for(const b of Object.values(c.bones)) {
    assert(b.position.toArray().every(Number.isFinite));assert(b.quaternion.toArray().every(Number.isFinite));
    assert(Math.abs(b.quaternion.length()-1)<1e-5,'Joint quaternion lost normalization');
  }
}

// Inspect every compiled take through its complete timeline, rather than
// checking only a representative pose or the final frame.
let samples=0;const report=[];
for(const item of MOTIONS)for(const fps of [30,60,144]) {
 const c=actor();c.fadeToAction(item.key,0);const clip=c.actions[item.key].getClip();
 const joints=Object.values(c.bones);const lengths=joints.map(b=>b.position.length());
 let maxStep=0,maxFrame=0,last=null,minPelvis=Infinity,maxPelvis=-Infinity;
 const frames=Math.ceil(clip.duration*fps);
 for(let i=0;i<=frames;i++){
  c.actions[item.key].enabled=true;c.actions[item.key].paused=false;
  c.actions[item.key].time=Math.min(clip.duration-1e-6,clip.duration*i/frames);c.mixer.update(0);c.group.updateMatrixWorld(true);finite(c);
  for(let j=0;j<joints.length;j++)if(boneId(joints[j].name)!=='hips')assert(Math.abs(joints[j].position.length()-lengths[j])<1e-5,item.key+': bone length changed');
  minPelvis=Math.min(minPelvis,position(c,'hips').y);maxPelvis=Math.max(maxPelvis,position(c,'hips').y);
  const current=['lefthand','righthand','leftfoot','rightfoot','head'].map(id=>position(c,id));
  assert(current.every(p=>p.toArray().every(Number.isFinite)&&p.length()<10),item.key+': exploded pose');
  if(last){const step=Math.max(...current.map((p,j)=>p.distanceTo(last[j])));if(step>maxStep){maxStep=step;maxFrame=i;}}last=current;samples++;
 }
 if(item.key==='dodgeForward')assert(maxPelvis-minPelvis>.15,item.key+': authored short duck was lost');
 if(item.key==='slamLand')assert(maxPelvis-minPelvis>.25,item.key+': authored landing crouch was lost');
 assert(maxStep<30/fps,item.key+': extremity exceeds 30 m/s review bound '+maxStep);
 report.push({key:item.key,fps,frames:frames+1,maxFrame,maxStep:+maxStep.toFixed(4)});c.mixer.stopAllAction();
}
// A slam must visibly hold the exact action fraction while waiting for contact.
const slam=actor();slam.combatAction={id:1,key:'slam',duration:.9,time:.9*.62};
for(let i=0;i<120;i++)slam.update(1/60,'FALLING',new THREE.Vector3(0,-20,0));
assert(Math.abs(slam.actions.slam.time/slam.actions.slam.getClip().duration-.62)<1e-5,'Slam animation landed before gameplay contact');
slam.mixer.stopAllAction();
fs.mkdirSync('docs/qa/motion-audit',{recursive:true});
fs.writeFileSync('docs/qa/motion-audit/samples.json',JSON.stringify({motions:MOTIONS.length,cases:report.length,samples,report},null,2)+'\n');
console.log(`PASS: ${MOTIONS.length} complete takes / ${report.length} FPS cases / ${samples} frames; finite rig, fixed limb lengths, pose continuity, airborne slam synchronization`);
