import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {CombatSystem,ATTACKS} from '../src/Combat.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {City} from '../src/City.js';
import {loadMotionRig,point,disposeRig} from './lib/motion-rig.mjs';
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
  let maxPhysicsError=0,maxVisualError=0,maxContactSpeed=0,centeredFist=null;
  for(let frame=0;frame<Math.floor(ATTACKS[key].duration*fps)-1;frame++){
   // Cross the ±pi seam while rotating at 150 degrees/sec.
   camera.userData.movementYaw=2.9+frame*dt*2.6;
   tick();
   maxPhysicsError=Math.max(maxPhysicsError,angle(p.facingAngle,camera.userData.movementYaw));
   if(frame>fps*.14)maxVisualError=Math.max(maxVisualError,angle(c.visualYaw,p.facingAngle));
   assert(c.activeAction===c.actions[key],`${key}: locomotion replaced strike legs`);
   if(combat.action.time>=ATTACKS[key].from && combat.action.time<=ATTACKS[key].to)
    maxContactSpeed=Math.max(maxContactSpeed,Math.hypot(p.velocity.x,p.velocity.z));
   const impact=c.actions[key].getClip().userData.impactPhase*ATTACKS[key].duration;
   if(['jab','cross','special'].includes(key) && Math.abs(combat.action.time-impact)<=dt*.51){
    const fist=point(c,key==='jab'?'lefthand':'righthand').sub(c.group.position);
    const aim=new T.Vector3(Math.sin(p.facingAngle),0,Math.cos(p.facingAngle));
    const lateral=Math.abs(fist.dot(new T.Vector3(aim.z,0,-aim.x))),reach=fist.dot(aim);
    assert(lateral<.22,`${key}: impact fist missed camera centre by ${lateral}m`);
    assert(reach>.5,`${key}: impact fist did not extend toward aim`);
    centeredFist={lateral,reach};
   }
   for(const {bone,rest,limit} of c.jointConstraints)assert(rest.angleTo(bone.quaternion)<=limit+1e-5,'Rendered joint exceeded anatomical limit');
  }
  assert(maxPhysicsError<1e-6,`${key}: aim and hit direction diverged`);
  assert(maxVisualError<.15,`${key}: visible body lag ${maxVisualError}`);
  assert(maxContactSpeed<.25,`${key}: contact foot slid at ${maxContactSpeed}m/s`);
  if(['jab','cross','special'].includes(key))assert(centeredFist,'Impact centre sample missing');
  results.push({fps,key,moving,maxPhysicsError,maxVisualError,maxContactSpeed,centeredFist});
 }finally{disposeRig(c);}
}
fs.writeFileSync('docs/qa/hud-strike-2026-10-26/steering.json',JSON.stringify(results,null,2)+'\n');
console.log(`PASS ${results.length} standing/strafe+sprint strikes at 24/60/144FPS: camera rotation, pi seam, off-screen target exclusion, full-body clips, contact braking, anatomical bounds`);
