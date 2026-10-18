import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Character } from '../src/Character.js';
import { ATTACKS } from '../src/Combat.js';
import { boneId } from '../src/MotionRetarget.js';
import { MOTIONS } from '../src/MotionCatalog.js';
import { planMantle, mantlePosition } from '../src/LedgeTraversal.js';
import { SwingPhysics } from '../src/SwingPhysics.js';
import { StreamedCollision } from '../src/StreamedCollision.js';

globalThis.ProgressEvent=class {constructor(type,values){Object.assign(this,values);}};
const data=fs.readFileSync('public/models/spiderman.glb'),length=data.readUInt32LE(12);
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
const available=new Set(MOTIONS.map(m=>m.key));
const bone=(c,id)=>Object.values(c.bones).find(b=>boneId(b.name)===id);
const position=(c,id)=>bone(c,id).getWorldPosition(new THREE.Vector3());
function finite(c) {
  for(const b of Object.values(c.bones)) {
    assert(b.position.toArray().every(Number.isFinite));assert(b.quaternion.toArray().every(Number.isFinite));
    assert(Math.abs(b.quaternion.length()-1)<1e-5,'Joint quaternion lost normalization');
  }
}

for(const key of ['jab','cross','hook','heavy','special'].filter(key=>available.has(key))) {
 const c=actor(),clip=c.actions[key].getClip(),hit=ATTACKS[key],impact=hit.duration*clip.userData.impactPhase;
 assert(impact>=hit.from&&impact<=hit.to,`${key}: gameplay hit window misses the authored impact (${impact.toFixed(3)}s)`);
 c.mixer.stopAllAction();
}

let count=0;
for(const dt of [1/30,1/60,1/144])for(const key of ['combatIdle','jab','cross','hook','heavy','special','guard','dodgeLeft','dodgeRight','dodgeBack','dodgeForward','slam','slamLand','hit','hitHead'].filter(key=>available.has(key))) {
  const c=actor();const duration=ATTACKS[key]?.duration ?? 1;
  c.combatAction={id:1,key,duration,time:0};
  for(let t=0;t<duration;t+=dt){c.combatAction.time=t;c.update(dt,key==='slam'?'FALLING':'IDLE',new THREE.Vector3());finite(c);}
  assert.equal(c.activeAction,c.actions[key],key+': wrong action');
  if(['jab','cross','hook','heavy','special','guard','combatIdle'].includes(key)) {
    assert(Math.min(position(c,'leftfoot').y,position(c,'rightfoot').y)>=0.025,key+': sole penetrates ground');
    assert(position(c,'head').y>0.8,key+': collapsed stance');
  }
  if(key==='jab') {
    c.combatAction={id:2,key,duration,time:0};c.update(dt,'IDLE',new THREE.Vector3());
    assert(c.activeAction.time<c.activeAction.getClip().duration*0.15,'Repeated jab was not restarted');
  }
  c.mixer.stopAllAction();count++;
}
console.log(`PASS: ${count} real-rig combat cases at 30/60/144 FPS; finite joints, grounded stance and same-clip restart`);

// Validate the action's meaning, not just finite joint values: a punch must
// travel forward while its other hand protects the face and feet keep stance.
for(const key of ['jab','cross'].filter(key=>available.has(key))) {
  const c=actor(),clip=c.actions[key].getClip();c.fadeToAction(key,0);
  const sample=t=>{c.activeAction.enabled=true;c.activeAction.paused=false;c.activeAction.time=t;c.mixer.update(0);c.group.updateMatrixWorld(true);};
  sample(0);const hand=key==='jab'?'left':'right',other=hand==='left'?'right':'left';
  const start=position(c,hand+'hand'),feet=['left','right'].map(side=>position(c,side+'foot'));
  sample(clip.duration*clip.userData.impactPhase);
  assert(position(c,hand+'hand').z-start.z>(key==='jab'?.25:.45),key+': fist stopped short of the target');
  assert(position(c,other+'hand').y>position(c,'head').y-(key==='jab'?.35:.25),key+': opposite guard was dropped');
  const support=key==='jab'?1:0;
  assert(position(c,['left','right'][support]+'foot').distanceTo(feet[support])<.38,key+': supporting foot slid beyond an authored boxing step');
  sample(clip.duration-1e-6);const finish=position(c,hand+'hand'),recovery=finish.distanceTo(start);assert(recovery<.02,`${key}: hand did not recover to guard (${recovery.toFixed(3)}m; ${start.toArray()} -> ${finish.toArray()}; weight ${c.activeAction.getEffectiveWeight()}; time ${c.activeAction.time}/${clip.duration})`);
  c.mixer.stopAllAction();
}
for(const key of ['hook','heavy'].filter(key=>available.has(key))) {
 const c=actor(),clip=c.actions[key].getClip();c.fadeToAction(key,0);const side='left';
 c.activeAction.time=0;c.mixer.update(0);c.group.updateMatrixWorld(true);const start=position(c,side+'hand');
 c.activeAction.time=clip.duration*clip.userData.impactPhase;c.mixer.update(0);c.group.updateMatrixWorld(true);
 const fist=position(c,side+'hand');assert(fist.distanceTo(start)>.35,key+': hook fist did not sweep across the target');
 assert(Math.min(position(c,'leftfoot').y,position(c,'rightfoot').y)<.35,key+': hook lost its supporting foot');
 c.activeAction.time=clip.duration-1e-6;c.mixer.update(0);c.group.updateMatrixWorld(true);assert(position(c,side+'hand').distanceTo(start)<.03,key+': hook hand did not return to guard');c.mixer.stopAllAction();
}
{
 const c=actor(),clip=c.actions.special.getClip();c.fadeToAction('special',0);
 c.activeAction.time=0;c.mixer.update(0);c.group.updateMatrixWorld(true);
 const fistStart=position(c,'righthand'),feetStart=['left','right'].map(side=>position(c,side+'foot'));
 c.activeAction.time=clip.duration*clip.userData.impactPhase;c.mixer.update(0);c.group.updateMatrixWorld(true);
 const fist=position(c,'righthand');
 const drive=fist.z-fistStart.z;
 assert(drive>.35,`special: rear overhand stopped short of the target (${drive.toFixed(3)}m)`);
 assert.equal(clip.userData.choreography,'loaded rear overhand');
 assert(Math.min(position(c,'leftfoot').y,position(c,'rightfoot').y)<.35,'special: both feet lost the ground');
 assert(Math.min(...['left','right'].map((side,i)=>position(c,side+'foot').distanceTo(feetStart[i])))<.45,'special: no stable support foot');
 c.mixer.stopAllAction();
}
for(const key of ['dodgeLeft','dodgeRight','dodgeBack','dodgeForward'].filter(key=>available.has(key))) {
 const c=actor(),clip=c.actions[key].getClip();c.fadeToAction(key,0);
 c.activeAction.time=0;c.mixer.update(0);c.group.updateMatrixWorld(true);
 const headStart=position(c,'head'),hipsStart=position(c,'hips');
 c.activeAction.time=clip.duration*.5;c.mixer.update(0);c.group.updateMatrixWorld(true);
 const head=position(c,'head'),hips=position(c,'hips');
 if(key==='dodgeLeft'||key==='dodgeRight') {
   assert(Math.abs(head.x-headStart.x)>.04,key+': head did not slip laterally');
   assert(Math.abs(hips.x-hipsStart.x)<.12,key+': sideways dodge moved the whole body');
 } else if(key==='dodgeBack') {
   assert(Math.abs(head.z-headStart.z)<.35,key+': back dodge went too far');
 } else assert(hipsStart.y-hips.y>.15,`forward dodge did not duck (hips ${hipsStart.y-hips.y}, head ${headStart.y-head.y})`);
 assert(position(c,'leftfoot').y<.25&&position(c,'rightfoot').y<.25,key+': feet left the floor');
 c.mixer.stopAllAction();
}
console.log('PASS: grounded power strike, compact guard, retained strike and punch recovery; removed evasions checked by motion-cleanup');
{
 const c=actor(),clip=c.actions.combatIdle.getClip();c.fadeToAction('combatIdle',0);
 const positions=[];
 for(const phase of [0,.25,.5,.75]){
  c.activeAction.time=clip.duration*phase;c.mixer.update(0);c.group.updateMatrixWorld(true);
  positions.push(position(c,'head'));
 }
 assert(Math.max(...positions.map(p=>p.distanceTo(positions[0])))<.2,'Boxing ready stance sways too far');
 c.mixer.stopAllAction();
}
console.log('PASS: boxing ready stance stays planted with restrained breathing');
// A timed skill and the ordinary landing state can share the same action.
// Its sampling speed must not freeze the subsequent landing animation.
{
 const c=actor(),v=new THREE.Vector3();
 c.combatAction={id:1,key:'slamLand',time:.2,duration:.7};c.landingSpeed=34;
 c.update(1/60,'LANDING',v);
 const sampled=c.activeAction.time;
 c.combatAction=null;c.landingSpeed=34;
 c.update(1/60,'LANDING',v);
 assert.equal(c.activeAction,c.actions.slamLand);
 assert(c.activeAction.time>sampled,'Landing inherited the skill playback speed of zero');
 for(let i=0;i<60;i++)c.update(1/60,'IDLE',v);
 assert.equal(c.activeAction,c.actions.idle);assert(c.activeAction.isRunning());
 c.activeAction.paused=true;
 c.update(1/60,'IDLE',v);
 assert(c.activeAction.isRunning(),'An interrupted idle stayed paused');
 c.mixer.stopAllAction();
}
for(const key of ['jab','cross','hook','special','dodgeForward','airTrick'].filter(key=>available.has(key))) {
 const c=actor(),v=new THREE.Vector3();
 if(key==='airTrick')c.triggerAirTrick('front');
 else c.combatAction={id:1,key,time:0,duration:1};
 for(let i=0;i<70;i++) {
   if(c.combatAction)c.combatAction.time=Math.min(i/60,.99);
   c.update(1/60,key==='airTrick'?'FALLING':'IDLE',v);
 }
 c.combatAction=null;
 for(let i=0;i<60;i++)c.update(1/60,'IDLE',v);
 assert.equal(c.activeAction,c.actions.idle,key+': did not return to idle');
 assert(c.activeAction.isRunning(),key+': idle did not resume');
 assert.equal(c.isTricking || false,false);
 for(let i=0;i<30;i++)c.update(1/60,'RUNNING',new THREE.Vector3(0,0,2.8));
 assert.equal(c.activeAction,c.actions.walk);assert(c.activeAction.isRunning());finite(c);
 c.mixer.stopAllAction();
}
console.log('PASS: timed landing resumes, paused idle recovers, and retained skills return to idle and walking');
{
 const c=actor();
 c.fadeToAction('airTrick',0);c.mixer.update(.15);
 c.fadeToAction('idle',.18);c.mixer.update(.03);
 c.stopAnimation();
 assert(Object.values(c.actions).every(action=>!action.isScheduled()),
   'Respawn stopped only the current clip and kept the previous skill blending');
 c.fadeToAction('idle',0);c.mixer.update(1/60);
 assert(c.activeAction.isRunning());finite(c);c.mixer.stopAllAction();
}
console.log('PASS: resetting mid-transition stops every old skill before idle restarts');
{
 const c=actor(),v=new THREE.Vector3();c.landingSpeed=34;
 c.update(1/60,'LANDING',v);assert.equal(c.activeAction,c.actions.slamLand);
 for(let i=0;i<30;i++){
   c.landingSpeed=0;c.update(1/60,'LANDING',v);
   assert.equal(c.activeAction,c.actions.slamLand,'Heavy landing switched clips after its one-frame impact event');
 }
 c.update(1/60,'IDLE',v);assert.equal(c.activeAction,c.actions.idle);
 c.mixer.stopAllAction();
}
console.log('PASS: heavy landing keeps its chosen recovery clip until the landing state ends');
// The rendered sole must retain the flat-foot orientation of the authored
// stance. Regressing to the foot bone's local Y as a sole normal points toes
// downward even though the ankle marker remains at the correct height.
{
 const c=actor();c.combatAction={key:'combatIdle'};
 for(let i=0;i<80;i++)c.update(1/60,'IDLE',new THREE.Vector3());
 const neutral=c.actions.combatIdle.getClip().userData.soleRotations;
 for(const side of ['left','right']) {
   const foot=bone(c,side+'foot');
   const expected=c.model.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().fromArray(neutral[side]));
   const actual=foot.getWorldQuaternion(new THREE.Quaternion());
   assert(actual.angleTo(expected)<.35,`${side}: stance sole folded away from flat authored foot`);
 }
 c.mixer.stopAllAction();
}
