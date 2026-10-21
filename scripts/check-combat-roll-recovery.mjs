import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {loadMotionRig,joint,disposeRig} from './lib/motion-rig.mjs';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {City} from '../src/City.js';
import {capturePose} from '../src/RemoteMotion.js';
const {actor}=await loadMotionRig(),results=[];
for(const fps of [24,60,144]){
 const dt=1/fps,c=actor();c.combatStance=true;let maxTuckAsymmetry=0,maxContactGap=0;
 try{
  // Prime the running upper-body blend, then keep a stale guard packet during impact.
  for(let i=0;i<fps/2;i++){c.combatAction={key:'guard'};c.group.position.z+=1.5*dt;c.update(dt,'RUNNING',new T.Vector3(0,0,1.5));}
  c.networkAnimation={key:'guard',time:.2};
  for(let i=0;i<fps;i++){
   c.recoveryProgress=i/fps;c.update(dt,'ROLLING',new T.Vector3(0,0,3));
   assert.equal(c.activeAction,c.actions.roll,'Guard overrides the forward roll');
   assert.equal(c.movingGuardWeight,0,'Running guard still overlays the roll');
   assert.equal(c.combatWristWeight,0,'Combat wrist solver still overlays the roll');
   const phase=i/fps;
   if(phase>.12 && phase<.85){
    const mesh=c.model.getObjectByProperty('isSkinnedMesh',true),p=new T.Vector3();let lowest=Infinity;
    for(const vertex of c.impactVertices){mesh.localToWorld(mesh.applyBoneTransform(vertex,p.fromBufferAttribute(mesh.geometry.attributes.position,vertex)));lowest=Math.min(lowest,p.y);}
    assert(lowest>=-.005,'Forward roll penetrates its support plane');maxContactGap=Math.max(maxContactGap,lowest);
   }
   if(phase>.16 && phase<.45){
    const spin=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),Math.PI*2*T.MathUtils.smoothstep(phase,.02,.55));
    const left=joint(c,'leftfoot').getWorldPosition(new T.Vector3()).applyQuaternion(spin.clone().invert());
    const right=joint(c,'rightfoot').getWorldPosition(new T.Vector3()).applyQuaternion(spin.clone().invert());
    maxTuckAsymmetry=Math.max(maxTuckAsymmetry,Math.hypot(left.y-right.y,left.z-right.z));
   }
   assert(Math.abs(c.activeAction.time-c.actions.roll.getClip().duration*i/fps)<.001,'Roll desynchronized from recovery');
   for(const {bone,rest,limit} of c.jointConstraints)assert(rest.angleTo(bone.quaternion)<limit+1e-5,'Folded endpoint '+bone.name);
  }
  assert(maxContactGap<.065,'Forward roll floats above its shoulder/back contact '+maxContactGap);
  assert(maxTuckAsymmetry<.06,'Roll kicks one foot away from the other '+maxTuckAsymmetry);
  results.push({fps,case:'guard-to-roll',maxTuckAsymmetry,maxContactGap,pass:true});
 }finally{disposeRig(c);}
 for(const key of ['guard','jab','cross','hook','special']){
  const c=actor();c.combatStance=true;
  try{for(let i=0;i<fps;i++){
   const speed=[.05,.2,.26,1.5,4.4,6.5][Math.floor(i/(fps/6))%6];
   c.combatAction=key==='guard'?{key}:{key,id:1,time:i/fps,duration:1.2};
   c.group.position.z+=speed*dt;c.update(dt,'RUNNING',new T.Vector3(0,0,speed));
   assert(['walk','regularRun','run'].some(k=>c.activeAction===c.actions[k]),'Strike/guard replaced the legs at gait startup');
   for(const {bone,rest,limit} of c.jointConstraints)assert(rest.angleTo(bone.quaternion)<limit+1e-5,'Attack folded endpoint '+bone.name);
  }results.push({fps,key,case:'moving-combat-start-and-speed-changes',pass:true});}finally{disposeRig(c);}
 }
 for(const horizontal of [0,4,8]){
  const c=actor(),city={colliders:[],buildingMeshes:[],raycast:City.prototype.raycast,checkCollision:City.prototype.checkCollision};
  const p=new SwingPhysics(c.scene,city,c,new Proxy({},{get:()=>()=>{}})),camera=new T.PerspectiveCamera();
  p.position.set(0,8,0);p.previousFixedPosition.copy(p.position);p.renderPosition.copy(p.position);p.state='FALLING';p.velocity.set(0,-8,horizontal);
  let rolled=false,exitProgress=null,lastProgress=0;
  try{
   for(let i=0;i<fps*4;i++){
    const old=p.state;p.update(dt,{forward:rolled,guard:true},camera);
    if(p.state==='ROLLING'){rolled=true;lastProgress=p.recoveryElapsed/p.recoveryTime;assert.equal(c.activeAction,c.actions.roll);if(capturePose(p,c).animation)assert(capturePose(p,c).animation.rate>.5,'Remote roll freezes between network snapshots');}
    if(old==='ROLLING' && p.state!=='ROLLING'){exitProgress=lastProgress;break;}
   }
   assert(rolled,'Vertical or moderate fall still selects a non-roll landing');
   assert(exitProgress>=.84,'Movement interrupts the forward rotation halfway');
   results.push({fps,horizontal,case:'fall-to-roll',exitProgress,pass:true});
  }finally{disposeRig(c);}
 }
 for(const obstacle of ['wall','gap']){
  const c=actor(),city={colliders:obstacle==='wall'?[{minX:-5,maxX:5,minZ:2,maxZ:2.2,minY:0,maxY:10}]:[],buildingMeshes:[],raycast:City.prototype.raycast,checkCollision:City.prototype.checkCollision};
  const p=new SwingPhysics(c.scene,city,c,new Proxy({},{get:()=>()=>{}}));
  if(obstacle==='gap')p.supportHeight=pos=>Math.abs(pos.y-.1)<.04 && !(pos.z>.8 && pos.z<1.6)?0:null;
  p.position.set(0,5,0);p.previousFixedPosition.copy(p.position);p.renderPosition.copy(p.position);p.state='FALLING';
  try{for(let i=0;i<fps*3;i++){p.update(dt,{},new T.PerspectiveCamera());if(['LANDING','ROLLING'].includes(p.state))break;}
   assert.equal(p.state,'LANDING','Roll path ignored '+obstacle);assert.equal(c.activeAction,c.actions.land,'Blocked recovery reverted to the twisted superhero landing');
   results.push({fps,obstacle,case:'blocked-or-unsupported-roll-path',pass:true});
  }finally{disposeRig(c);}
 }
}
fs.writeFileSync('docs/qa/combat-roll-2026-10-21/recovery.json',JSON.stringify(results,null,2));
console.log(`PASS ${results.length} guard/impact/timeline and vertical/moving fall recovery cases at 24/60/144fps`);
