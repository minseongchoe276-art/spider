import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadMotionRig,point,disposeRig} from './lib/motion-rig.mjs';
import {CombatSystem,ATTACKS} from '../src/Combat.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {City} from '../src/City.js';
const {actor}=await loadMotionRig();
for(const input of [{},{forward:true},{backward:true},{left:true},{right:true},{forward:true,left:true},{forward:true,right:true},{backward:true,left:true},{backward:true,right:true}]){
 const c=actor(),city={colliders:[],buildingMeshes:[],raycast:City.prototype.raycast,checkCollision:City.prototype.checkCollision};
 const p=new SwingPhysics(c.scene,city,c,new Proxy({},{get:()=>()=>{}})),combat=new CombatSystem(c.scene,p,c),camera=new THREE.PerspectiveCamera();camera.userData.movementYaw=0;camera.lookAt(0,0,1);camera.updateMatrixWorld(true);
 p.position.set(0,.1,0);p.previousFixedPosition.copy(p.position);p.renderPosition.copy(p.position);p.state='IDLE';combat.toggle();
 const dt=1/60,tick=()=>{combat.before(dt,camera,input);p.update(dt,input,camera);combat.after(dt);};
 try{
  const clip=c.actions.cross.getClip();assert.equal(clip.userData.source,'/models/Lead Jab (3).fbx');assert.equal(clip.userData.mirrored,true);
  for(let i=0;i<30;i++)tick();
  assert(combat.straight(camera));let impact=null;
  for(let i=0;i<65;i++){
   tick();if(!combat.action)continue;
   if(input.forward||input.backward||input.left||input.right)assert(['walk','regularRun','run'].some(key=>c.activeAction===c.actions[key]),`Directional punch must preserve gait: ${JSON.stringify(input)}, ${c.activeAction?.getClip().name}, ${combat.action.time}`);
   if(Math.abs(combat.action.time-ATTACKS.cross.duration*clip.userData.impactPhase)<dt*.51){
    const right=point(c,'righthand').sub(c.group.position),left=point(c,'lefthand').sub(c.group.position);
    assert(right.z>.5,'Right fist must reach forward');assert(right.z>left.z+.15,'Right hand must deliver the punch');assert(Math.abs(right.x)<.22,'Right fist must follow aim');impact=right.toArray();
   }
   for(const {bone,rest,limit} of c.jointConstraints)assert(rest.angleTo(bone.quaternion)<=limit+1e-5);
  }
  assert(impact);assert.equal(combat.action,null,'Punch must recover');
 }finally{disposeRig(c);}
}
console.log('PASS: supplied jab mirrored to right hand; stationary and all eight arrow movement directions retain gait, aim, joint limits and recovery');
