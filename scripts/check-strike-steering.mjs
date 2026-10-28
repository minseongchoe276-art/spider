import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {CombatSystem,ATTACKS} from '../src/Combat.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {City} from '../src/City.js';
import {loadMotionRig,point,joint,disposeRig} from './lib/motion-rig.mjs';
const {actor}=await loadMotionRig(),results=[];
const angle=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
for(const fps of [24,60,144])for(const key of ['jab','cross','hook','heavy','special'])for(const moving of [false,true]){
 const c=actor(),p=new SwingPhysics(c.scene,{colliders:[],buildingMeshes:[],raycast:City.prototype.raycast,checkCollision:City.prototype.checkCollision},c,new Proxy({},{get:()=>()=>{}}));
 p.position.set(0,.1,0);p.previousFixedPosition.copy(p.position);p.renderPosition.copy(p.position);p.state='IDLE';
 const camera=new T.PerspectiveCamera();camera.userData.movementYaw=0;
 const combat=new CombatSystem(c.scene,p,c);combat.toggle();
 const dt=1/fps,input=moving?{right:true,sprint:true}:{};
 const tick=()=>{combat.before(dt,camera,input);p.update(dt,input,camera);combat.after(dt);};
 try{
  for(let i=0;i<fps*.4;i++)tick();
  // Off-screen proximity alone must not steal the camera's attack direction.
  combat.enemies=[{health:100,position:p.position.clone().add(new T.Vector3(3,0,0))}];
  combat.start(key,ATTACKS[key].duration,camera);
  assert(angle(p.facingAngle,0)<1e-6,'Off-screen enemy pulled the attack sideways');
  const latched=p.facingAngle;
  let maxDrift=0,maxVisualError=0,maxContactSpeed=0,centeredFist=null,hookFist=null;
  for(let frame=0;frame<Math.floor(ATTACKS[key].duration*fps)-1;frame++){
   // Cross the ±pi seam while rotating at 150 degrees/sec.
   camera.userData.movementYaw=2.9+frame*dt*2.6;
   tick();
   maxDrift=Math.max(maxDrift,angle(p.facingAngle,latched));
   if(frame>fps*.14)maxVisualError=Math.max(maxVisualError,angle(c.visualYaw,p.facingAngle));
   const stride=['walk','regularRun','run'].some(name=>c.activeAction===c.actions[name]);
   // special is a full-body dash. Character.js keeps the gait for every other strike.
   if(key==='special')assert(c.activeAction===c.actions.special,`${key}: dash left its clip for ${c.activeAction?.getClip?.().name}`);
   else if(moving)assert(stride,`${key}: moving strike replaced the stride`);
   else assert(c.activeAction===c.actions[key],`${key}: standing strike lost its lower body`);
   if(!moving && combat.action.time>=ATTACKS[key].from && combat.action.time<=ATTACKS[key].to)
    maxContactSpeed=Math.max(maxContactSpeed,Math.hypot(p.velocity.x,p.velocity.z));
   const impact=c.actions[key].getClip().userData.impactPhase*ATTACKS[key].duration;
   if(['jab','cross'].includes(key) && Math.abs(combat.action.time-impact)<=dt*.51){
    const fist=point(c,key==='jab'?'lefthand':'righthand').sub(c.group.position);
    const aim=new T.Vector3(Math.sin(p.facingAngle),0,Math.cos(p.facingAngle));
    const lateral=Math.abs(fist.dot(new T.Vector3(aim.z,0,-aim.x))),reach=fist.dot(aim);
    assert(lateral<.22,`${key}: impact fist missed camera centre by ${lateral}m`);
    assert(reach>.5,`${key}: impact fist did not extend toward aim (${reach.toFixed(3)} m at ${combat.action.time.toFixed(3)} s)`);
    centeredFist={lateral,reach};
   }
   const mid=(ATTACKS[key].from+ATTACKS[key].to)/2;
   if(['hook','heavy'].includes(key) && Math.abs(combat.action.time-mid)<=dt*.51){
    const aim=new T.Vector3(Math.sin(p.facingAngle),0,Math.cos(p.facingAngle));
    const right=new T.Vector3().crossVectors(aim,new T.Vector3(0,1,0));
    const origin=c.group.position;
    const shoulder=point(c,'leftarm').sub(origin);
    const elbow=point(c,'leftforearm');
    const wrist=point(c,'lefthand');
    const fist=wrist.clone().sub(origin);
    const bend=elbow.clone().sub(point(c,'leftarm')).angleTo(wrist.clone().sub(elbow));
    const rear=point(c,'righthand').sub(origin);
    hookFist={bend,fistLat:fist.dot(right),shoulderLat:shoulder.dot(right),reach:fist.dot(aim),rearReach:rear.dot(aim)};
    assert(hookFist.rearReach<0.48,`${key}: rear fist still reads as a straight (${hookFist.rearReach.toFixed(2)} m)`);
    assert(bend>0.7,`${key}: elbow opened into a straight (${bend.toFixed(2)} rad)`);
    assert(hookFist.shoulderLat<hookFist.fistLat-0.12,`${key}: fist did not travel across the lead shoulder`);
    assert(hookFist.fistLat>-0.02,`${key}: fist stayed on the lead side of the center line (${hookFist.fistLat.toFixed(2)} m)`);
    assert(hookFist.reach>0.15 && hookFist.reach<0.7,`${key}: hook reach ${hookFist.reach.toFixed(2)} m`);
    const chest=new T.Vector3(0,0,1).applyQuaternion(joint(c,'spine').getWorldQuaternion(new T.Quaternion()));
    chest.y=0;
    if(chest.lengthSq()>1e-6){
     chest.normalize();
     const chestYaw=Math.atan2(Math.sin(Math.atan2(chest.x,chest.z)-p.facingAngle),Math.cos(Math.atan2(chest.x,chest.z)-p.facingAngle));
     hookFist.chestYaw=chestYaw;
    }
   }
   for(const {bone,rest,limit} of c.jointConstraints)assert(rest.angleTo(bone.quaternion)<=limit+1e-5,'Rendered joint exceeded anatomical limit');
  }
  assert(maxDrift<1e-6,`${key}: body followed the camera during the strike`);
  assert(maxVisualError<.15,`${key}: visible body lag ${maxVisualError}`);
  if(!moving)assert(maxContactSpeed<.25,`${key}: contact foot slid at ${maxContactSpeed}m/s`);
  if(['jab','cross'].includes(key))assert(centeredFist,'Impact centre sample missing');
  if(['hook','heavy'].includes(key))assert(hookFist,`${key}: hook sample missing`);
  results.push({fps,key,moving,maxDrift,maxVisualError,maxContactSpeed,centeredFist,hookFist});
 }finally{disposeRig(c);}
}
fs.writeFileSync('docs/qa/hud-strike-2026-10-26/steering.json',JSON.stringify(results,null,2)+'\n');
console.log(`PASS ${results.length} standing/strafe+sprint strikes at 24/60/144FPS: aim stays latched, hook crosses center, stride kept, contact braking, anatomical bounds`);
