import assert from 'node:assert/strict';
import * as THREE from 'three';
import {StreamedCollision} from '../src/StreamedCollision.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {planMantle,mantlePosition,resolveTraversal} from '../src/LedgeTraversal.js';
import {loadMotionRig,point,disposeRig} from './lib/motion-rig.mjs';

const normal=new THREE.Vector3(0,0,-1),start=new THREE.Vector3(0,19.3,-.375);
async function terrain(width,ceiling=false,span=8){
 const world=new StreamedCollision();await world.initialized;
 for(const [size,position] of [
  [[span,20,width],[0,10,width/2]],
  [[span,30,3],[0,35,width+1.5]],
  ...(ceiling?[[[8,.3,width],[0,21.15,width/2]]]:[]),
 ]){const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size));mesh.position.set(...position);mesh.updateMatrixWorld(true);world.enqueue(mesh);}
 for(let n=0;n<10;n++)world.update(start);
 return {collisionWorld:world,colliders:[],buildingMeshes:[],raycast:(...args)=>world.raycast(...args)};
}
const city=await terrain(1.5);
const plan=planMantle(city,start,normal,20);
assert(plan,'A full capsule fits on this balcony but no landing was offered');
assert(Math.abs(plan.gap-.375)<.001);
assert(plan.end.z>.45 && plan.end.z<1.1,'Landing overshot the usable balcony into its back wall');
let previous=start;
for(let frame=1;frame<=144;frame++){
 const target=mantlePosition(plan,frame/144),resolved=resolveTraversal(city,previous,target);
 assert(resolved.position.distanceTo(target)<.075,'Balcony entry intersected its facade or back wall');previous=target;
}
assert.equal(planMantle(await terrain(.7),start,normal,20),null,'A balcony narrower than the support footprint was accepted');
assert.equal(planMantle(await terrain(1.5,true),start,normal,20),null,'A low ceiling was ignored');
console.log('PASS actual Rapier capsule enters a 1.5m balcony using its measured facade gap; narrow/low-ceiling balconies remain rejected');

const narrow=await terrain(1.5,false,1.1),rounded=new THREE.Vector3(.6,0,-.8);
narrow.supportHeight=()=>null;narrow.checkCollision=()=>({collided:false});
narrow.resolveMovement=(a,b,v)=>({...narrow.collisionWorld.resolve(a,b,v),contacts:[{normal:rounded,blocked:true}]});
const actor={group:new THREE.Group(),update(){},cancelAirTrick(){}},silent=new Proxy({},{get:()=>()=>{}});
const player=new SwingPhysics(new THREE.Scene(),narrow,actor,silent);
player.position.copy(start);player.previousPosition=start.clone();player.velocity.set(0,0,2);player.state='FALLING';
player.handleCollisions(1/60,{forward:true,wallRun:true});
assert.equal(player.state,'WALL_RUNNING');
assert(player.wallNormal.distanceTo(normal)<1e-5,'Rounded capsule normal replaced the actual flat facade normal');
assert(Math.abs(actor.wallDistance-.375)<.001,'Grip used the angled ray length instead of the perpendicular wall distance');
player.updateWallRunPhysics(1/60,{forward:true,wallRun:true,strafe:0},new THREE.PerspectiveCamera());
assert.equal(player.state,'MANTLING','A rounded edge contact aimed the roof probe off the supported balcony');
console.log('PASS rounded edge contact uses the actual facade normal and enters the supported roof instead of twisting the grip');

const railing=await terrain(4),bar=new THREE.Mesh(new THREE.BoxGeometry(8,.12,.12));
bar.position.set(0,21.15,.06);bar.updateMatrixWorld(true);railing.collisionWorld.enqueue(bar);
for(let n=0;n<5;n++)railing.collisionWorld.update(start);
const railStart=new THREE.Vector3(0,19.95,-.375),vault=planMantle(railing,railStart,normal,20);
assert(vault,'An open railing trapped the climber below its top bar');
assert(vault.height>21.1 && vault.height-railStart.y<=1.25);
assert(Math.abs(vault.end.y-20.1)<.001);
console.log('PASS open railing uses a reachable higher grip and lands on the supported lower roof');

railing.resolveMovement=(a,b,v)=>railing.collisionWorld.resolve(a,b,v);
railing.supportHeight=p=>{const h=railing.collisionWorld.groundAt(p,.5);return h!==null&&Math.abs(p.y-h-.1)<.25?h:null;};
railing.checkCollision=()=>({collided:false});
const rig=await loadMotionRig();
for(const fps of [30,60,144]){
 const suit=rig.actor(),physics=new SwingPhysics(suit.scene,railing,suit,silent);let grip=0,peak=0;
 physics.position.copy(railStart);physics.previousFixedPosition.copy(railStart);physics.renderPosition.copy(railStart);
 suit.wallNormal=normal;suit.wallDistance=.375;suit.group.position.copy(railStart);
 for(let n=0;n<fps*.3;n++)suit.update(1/fps,'WALL_RUNNING',new THREE.Vector3(0,2.8,0));
 physics.mantle=planMantle(railing,railStart,normal,20);physics.state='MANTLING';
 try{
  for(let n=0;n<fps*2;n++){
   physics.update(1/fps,{strafe:0},new THREE.PerspectiveCamera());
   if(physics.mantle){const t=physics.mantle.elapsed/physics.mantle.duration;
    if(t>.2&&t<.42)for(const side of ['left','right'])grip=Math.max(grip,point(suit,side+'hand').distanceTo(suit.mantleHandTargets[side]));}
   for(const joint of suit.jointConstraints || [])if(joint.kind==='foot')peak=Math.max(peak,THREE.MathUtils.radToDeg(joint.rest.angleTo(joint.bone.quaternion)));
  }
  assert.equal(physics.state,'IDLE');assert(grip<.06,`Railing grip unreachable: ${grip}m`);assert(peak<=35.001);
  console.log(`PASS ${fps}fps real rig over open railing: grip ${(grip*1000).toFixed(1)}mm, ankle ${peak.toFixed(2)}deg, supported idle`);
 }finally{disposeRig(suit);}
}
