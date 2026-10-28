import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {StreamedCollision} from '../src/StreamedCollision.js';
import {VehicleSystem} from '../src/VehicleSystem.js';
import {vehicleAsset,vehicleHero} from './lib/vehicle-fixtures.mjs';
import {poseDriver} from '../src/DrivingPose.js';
import {boneId} from '../src/MotionRetarget.js';
import {sanitizeVehicle,vehicleUpdateError} from '../src/VehicleNetwork.js';
import {VehicleController} from '../src/VehicleController.js';
const results=[];
async function terrain(height,{wall=false,gap=false}={}){
 const vertices=[];for(let z=-25;z<110;z+=.5){if(gap&&z>=14&&z<20)continue;for(const [x1,x2] of [[-15,15]]){const a=[x1,height(x1,z),z],b=[x2,height(x2,z),z],c=[x1,height(x1,z+.5),z+.5],d=[x2,height(x2,z+.5),z+.5];vertices.push(...a,...c,...b,...b,...c,...d);}}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial({side:T.DoubleSide}));mesh.userData.surfaceType='road';mesh.updateMatrixWorld(true);
 const world=new StreamedCollision();await world.initialized;const meshes=[mesh];
 if(wall){const box=new T.Mesh(new T.BoxGeometry(10,3,.12));box.position.set(0,height(0,14)+1.5,14);box.updateMatrixWorld(true);meshes.push(box);}
 world.setActiveMeshes(meshes);for(const m of meshes)world.enqueue(m);for(let i=0;i<200&&world.pending.length+!!world.job;i++)world.update(new T.Vector3(),{budgetMs:100,maxIndices:100000});
 const city={isStreamed:true,collisionWorld:world,raycast:(...args)=>world.raycast(...args)};return {world,city};
}
for(const degrees of [2,6,12,20,26])for(const fps of [24,60,144]){
 const slope=Math.tan(degrees*Math.PI/180),height=(_x,z)=>z<5?0:z<25?(z-5)*slope:z<42?20*slope:z<62?(62-z)*slope:0;
 const {world,city}=await terrain(height);try{
  const c=new VehicleController(city,new T.Vector3(0,.02,0));let maxError=0;
  for(let i=0;i<fps*8;i++){c.update(1/fps,{forward:true});maxError=Math.max(maxError,Math.abs(c.position.y-.02-height(c.position.x,c.position.z)));if(c.position.z>80)break;}
  assert(c.position.z>75,`${degrees}deg ${fps}fps stopped at ${c.position.z.toFixed(3)}; support=${JSON.stringify(c.support(c.position,0))}`);
  assert(maxError<.4,'Chassis lost terrain');results.push({degrees,fps,distance:c.position.z,maxError});
 }finally{world.dispose();}
}
// Grade aligned across the car, uphill in reverse, and a real obstacle on a ramp.
for(const reverse of [false,true]){
 const height=(x,z)=>.12*x+.16*z,{world,city}=await terrain(height);try{const c=new VehicleController(city,new T.Vector3(0,.02,0),reverse?Math.PI:0);for(let i=0;i<240;i++)c.update(1/60,{[reverse?'backward':'forward']:true});assert(c.position.z>10);assert(Math.abs(c.roll)>.05);results.push({case:reverse?'reverse diagonal grade':'cross slope',distance:c.position.z});}finally{world.dispose();}
}
for(const kind of ['wall','gap']){
 const height=(_x,z)=>z*.12,{world,city}=await terrain(height,{[kind]:true});try{const c=new VehicleController(city,new T.Vector3(0,.02,0));for(let i=0;i<360;i++)c.update(1/60,{forward:true});assert(c.position.z<14,`${kind} was crossed`);results.push({case:kind,stoppedAt:c.position.z});}finally{world.dispose();}
}
for(const [kind,height,expected] of [
 ['small curb',(_x,z)=>z<14?0:.12,true],
 ['high step',(_x,z)=>z<14?0:.6,false],
 ['excessive grade',(_x,z)=>Math.max(0,z-5)*Math.tan(35*Math.PI/180),false],
]){
 const {world,city}=await terrain(height);try{const c=new VehicleController(city,new T.Vector3(0,.02,0));for(let i=0;i<300;i++)c.update(1/60,{forward:true});assert(expected?c.position.z>30:c.position.z<14,kind);results.push({case:kind,distance:c.position.z});}finally{world.dispose();}
}
const hero=await vehicleHero();
for(const model of ['bmw','corvette']){
 const height=(x,z)=>2+.12*x+.22*z,{world,city}=await terrain(height);const asset=await vehicleAsset(model);
 try{
  const physics={position:new T.Vector3(0,2.1,0),renderPosition:new T.Vector3(),velocity:new T.Vector3(),state:'IDLE',facingAngle:0};
  const system=new VehicleSystem({city,scene:new T.Scene(),physics,character:hero});system.selected=model;
  const parking=system.findParking();assert(parking,'Could not summon on a moderate incline');
  system.asset=asset;system.controller=new VehicleController(city,parking.position,parking.yaw);system.state='DRIVING';system.entryStart=physics.position.clone();system.syncCar(0);assert(Math.abs(asset.visual.rotation.x)>.1,'Parked car did not align with incline on first frame');
  let previous=null,maxSeatError=0;
  for(let i=0;i<120;i++){
   system.controller.update(1/60,{forward:true});system.syncCar(1/60);physics.position.copy(system.controller.position).y+=.1;
   poseDriver(hero,asset,system.controller.steering);
   const hip=Object.values(hero.bones).find(b=>boneId(b.name)==='hips');maxSeatError=Math.max(maxSeatError,hip.getWorldPosition(new T.Vector3()).distanceTo(asset.visual.localToWorld(asset.seat.clone())));
   const packet=system.networkSnapshot();assert(sanitizeVehicle(packet),'Invalid incline network packet');
   if(previous)assert.equal(vehicleUpdateError(packet,previous,{player:physics.position,elapsed:1/60}),null,'Incline triggered network correction');
   assert(Math.abs(packet.position.y-asset.visual.getWorldPosition(new T.Vector3()).y)<1e-6,'Remote car did not receive the rendered ride height');previous=packet;
  }
  assert(maxSeatError<.001,'Driver slipped out of the tilted seat');
  const exit=system.findExit();assert(exit,'No safe exit on a moderate incline');assert(Math.abs(exit.y-height(exit.x,exit.z)-.1)<.001);
  let tyreError=0;for(const wheel of asset.wheels){const sole=asset.visual.localToWorld(new T.Vector3(wheel.hx,wheel.restY-wheel.drop-wheel.radius,wheel.hz));tyreError=Math.max(tyreError,Math.abs(sole.y-height(sole.x,sole.z)));}assert(tyreError<.16,'Tyres lost contact on an incline');
  results.push({model,case:'incline summon, seat, tyres, exit and network',maxSeatError,tyreError});
 }finally{world.dispose();}
}
fs.mkdirSync('docs/qa/vehicle-slopes-2026-10-28',{recursive:true});fs.writeFileSync('docs/qa/vehicle-slopes-2026-10-28/results.json',JSON.stringify({status:'PASS',results},null,2)+'\n');console.log('PASS real Rapier terrain: grades, crest, descent, reverse, cross slope, walls and missing road',results);
