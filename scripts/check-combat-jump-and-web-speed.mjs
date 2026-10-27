import assert from 'node:assert/strict';
import * as T from 'three';
import {loadMotionRig,point,disposeRig} from './lib/motion-rig.mjs';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {CombatSystem} from '../src/Combat.js';
import {City} from '../src/City.js';
const {actor}=await loadMotionRig();
const silent=new Proxy({},{get:()=>()=>{}});
const city={colliders:[],buildingMeshes:[],raycast:City.prototype.raycast,checkCollision:City.prototype.checkCollision};
const camera=new T.PerspectiveCamera();camera.lookAt(0,0,1);camera.updateMatrixWorld(true);
function setup(){const c=actor(),p=new SwingPhysics(c.scene,city,c,silent);p.position.set(0,.1,0);p.previousFixedPosition.copy(p.position);p.renderPosition.copy(p.position);p.state='IDLE';return {c,p};}
for(const fps of [24,60,144])for(const moving of [false,true]){
 const {c,p}=setup(),combat=new CombatSystem(c.scene,p,c);combat.toggle();
 let old=null,maxStep=0,landStep=0,previous='IDLE';const states=new Set();
 try{
  for(let i=0;i<fps*2;i++){
   const input={jump:i===Math.floor(fps*.5),forward:moving};
   combat.before(1/fps,camera,input);p.update(1/fps,input,camera);combat.after(1/fps);
   states.add(p.state);
   const hands=['left','right'].map(side=>point(c,side+'hand').sub(c.group.position));
   const step=old?Math.max(...hands.map((v,j)=>v.distanceTo(old[j]))):0;
   if(i>fps*.45)maxStep=Math.max(maxStep,step);
   if(previous==='FALLING' && ['IDLE','RUNNING','LANDING'].includes(p.state))landStep=step;
   if(['JUMPING','FALLING'].includes(p.state))for(const hand of hands)assert(hand.y<point(c,'head').sub(c.group.position).y,'Jump raised a hand above the head');
   previous=p.state;old=hands;
  }
  assert(states.has('JUMPING')&&states.has('FALLING'));
  assert(maxStep<9/fps+.065,`Pose discontinuity at ${fps} FPS: ${maxStep}`);
  assert(landStep<6/fps+.075,`Landing hand snap at ${fps} FPS: ${landStep}`);
  console.log(`PASS combat jump ${fps} FPS moving=${moving}, landing hand step=${landStep.toFixed(3)}m`);
 }finally{disposeRig(c);}
}
for(const sprint of [false,true]){
 const {c,p}=setup();p.webEnabled=true;
 try{
  for(let i=0;i<120;i++)p.update(1/60,{forward:true,sprint},camera);
  const speed=Math.hypot(p.velocity.x,p.velocity.z),expected=sprint?12:7;
  assert(Math.abs(speed-expected)<.1,`Web movement speed ${speed}, expected ${expected}`);
  p.webEnabled=false;assert.equal(p.groundMoveSpeed({sprint}),sprint?6.5:4.4);
  p.webEnabled=true;c.combatStance=true;assert.equal(p.groundMoveSpeed({sprint}),sprint?6.5:4.4);
  console.log(`PASS web ${sprint?'sprint':'walk'} ${speed.toFixed(2)}m/s; combat speed preserved`);
 }finally{disposeRig(c);}
}
