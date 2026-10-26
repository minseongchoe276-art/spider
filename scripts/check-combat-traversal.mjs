import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {loadMotionRig,joint,point,disposeRig} from './lib/motion-rig.mjs';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {ATTACKS,CombatSystem} from '../src/Combat.js';
import {CombatFeedback} from '../src/CombatFeedback.js';
import {City} from '../src/City.js';
const {actor}=await loadMotionRig(),results=[];
for(const fps of [24,60,144])for(const key of ['jab','cross']){
 const c=actor(),p=new SwingPhysics(c.scene,{colliders:[],buildingMeshes:[],raycast:City.prototype.raycast,checkCollision:City.prototype.checkCollision},c,new Proxy({},{get:()=>()=>{}}));
 p.position.set(0,.1,0);p.previousFixedPosition.copy(p.position);p.renderPosition.copy(p.position);p.state='IDLE';
 const combat=new CombatSystem(c.scene,p,c),camera=new THREE.PerspectiveCamera();camera.lookAt(0,0,1);camera.updateMatrixWorld(true);combat.toggle();
 try{
  const duration=ATTACKS[key].duration;let ankle=0,activeFrames=0;
  (key==='jab'?combat.attack(camera):combat.straight(camera));
  for(let n=0;n<fps*1.8;n++){
   combat.before(1/fps,camera);p.update(1/fps,{forward:true,strafe:0},camera);combat.after(1/fps);
   if(combat.action)activeFrames++;
   for(const {bone,rest,kind,limit} of c.jointConstraints){
    assert(rest.angleTo(bone.quaternion)<=limit+1e-5,'Final rendered ankle/toe exceeded its limit');
    if(kind==='foot')ankle=Math.max(ankle,rest.angleTo(bone.quaternion)*180/Math.PI);
   }
  }
  assert(activeFrames>fps*.3);assert(p.position.z>p.walkSpeed*(1.8-duration-.3),'Held movement failed to resume after the planted strike');assert(p.walkSpeed>4);
  assert(c.actions.rightHook && c.actions.rightHook!==c.actions.jab);
  const take=c.actions.rightHook.getClip();assert.equal(take.userData.choreography,'compact right hook');
  c.stopAnimation();c.fadeToAction('rightHook',0);c.mixer.setTime(0);const left=point(c,'lefthand'),right=point(c,'righthand');
  c.mixer.setTime(take.duration*.58);
  const elbow=point(c,'rightforearm'),upper=point(c,'rightarm').sub(elbow).normalize(),lower=point(c,'righthand').sub(elbow).normalize();
  const bend=upper.angleTo(lower)*180/Math.PI;assert(bend>50&&bend<140,`Right hook elbow straightened into a cross: ${bend}`);
  assert(point(c,'righthand').distanceTo(right)>point(c,'lefthand').distanceTo(left)+.15,'Hook failed to use the right arm');
  results.push({fps,key,travel:p.position.z,maxAnkle:ankle,rightElbow:bend,pass:true});
 }finally{disposeRig(c);}
}
const c=actor();try{
 c.triggerAirTrick('front');assert(c.isTricking);c.fireWeb(new THREE.Vector3(0,20,10));assert(!c.isTricking&&!c.airTrick,'Web aim retained a flip');
 const p=new SwingPhysics(c.scene,{colliders:[],buildingMeshes:[]},c,new Proxy({},{get:()=>()=>{}}));p.state='FALLING';p.position.y=30;c.contactTime=5;
 assert(!p.performAirTrick('front'),'A held rope allowed a new flip');
 c.webShotTimer=0;p.webs=[];c.webAttachments=[];
 assert(p.performAirTrick('front'),'Released airborne player could not use T');
}finally{disposeRig(c);}
let hits=0;const notices=[];const feedback=new CombatFeedback({showNotice:m=>notices.push(m),audio:{playCombatHit(){hits++;}}});
const online={vulnerableAt:Date.now()+1000,serverNow:()=>Date.now()};
assert(!feedback.canFire('web',online));online.vulnerableAt=0;assert(feedback.canFire('web',online));assert(!feedback.canFire('web',online));
feedback.sent('web',{name:'runner'});assert.equal(hits,0,'Prediction played confirmed-hit audio');
feedback.hit({kind:'web',health:85});assert.equal(hits,1);assert(feedback.message.includes('−15')&&feedback.message.includes('85'));
fs.writeFileSync('docs/qa/combat-traversal-2026-10-18/regression-results.json',JSON.stringify(results,null,2)+'\n');
console.log('PASS movement strikes at 24/60/144 FPS, imported rear straights, retained hook, final ankle limits, web/flip exclusion, grace/cooldown, confirmed-hit-only feedback');
