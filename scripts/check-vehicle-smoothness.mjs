import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {VehicleController,VEHICLE} from '../src/VehicleController.js';
import {VehicleSystem} from '../src/VehicleSystem.js';
import {vehicleAsset,vehicleHero} from './lib/vehicle-fixtures.mjs';
import {boneId} from '../src/MotionRetarget.js';
const results=[];
for(const fps of [30,60,90,120,144,165,240]){
 const c=new VehicleController({});c.speed=VEHICLE.maxSpeed;c.resetRenderPose();let rawLast=0,renderLast=0,raw=[],render=[];
 for(let i=0;i<fps*2;i++){c.update(1/fps,{forward:true});const z=c.sampleRenderPose().position.z;if(i>=fps){raw.push(c.position.z-rawLast);render.push(z-renderLast);}rawLast=c.position.z;renderLast=z;}
 const rawRange=Math.max(...raw)-Math.min(...raw),range=Math.max(...render)-Math.min(...render);
 assert(range<1e-9,`${fps} Hz fixed-step judder survived`);assert(render.every(distance=>Math.abs(distance-VEHICLE.maxSpeed/fps)<1e-9));
 assert(c.position.z-c.sampleRenderPose().position.z<=VEHICLE.maxSpeed*VEHICLE.step+1e-6,'Interpolation lag exceeded one tick');
 results.push({fps,rawRange,renderRange:range,rawHeldFrames:raw.filter(d=>d===0).length,renderHeldFrames:render.filter(d=>d===0).length});
 c.occupied=()=>true;const stop=c.position.clone();for(let i=0;i<fps;i++){c.update(1/fps,{forward:true});assert(c.sampleRenderPose().position.z<=stop.z+1e-9,'Presentation crossed a blocked collision');}assert(c.position.equals(stop));
 c.position.set(100,5,100);c.yaw=-Math.PI+.02;c.resetRenderPose(true);assert.equal(c.sampleRenderPose().rideY,4.98,'Correction retained an old road height');assert(c.sampleRenderPose().position.equals(c.position),'Correction replayed old movement');
 c.renderPrevious.yaw=Math.PI-.02;c.accumulator=VEHICLE.step*.5;assert(Math.abs(Math.abs(c.sampleRenderPose().yaw)-Math.PI)<1e-6,'Yaw wrapped the long way');
}
const hero=await vehicleHero();
for(const model of ['bmw','corvette'])for(const fps of [60,144]){
 const asset=await vehicleAsset(model),physics={position:new T.Vector3(),renderPosition:new T.Vector3(),previousFixedPosition:new T.Vector3(),velocity:new T.Vector3(),facingAngle:0};
 const c=new VehicleController({});c.speed=VEHICLE.maxSpeed;c.resetRenderPose();
 const system=new VehicleSystem({scene:new T.Scene(),city:{},physics,character:hero});system.asset=asset;system.controller=c;system.state='DRIVING';
 let maxSeatError=0,maxCameraError=0;const hip=Object.values(hero.bones).find(b=>boneId(b.name)==='hips');
 for(let i=0;i<fps;i++){system.update(1/fps,{forward:true,left:i>fps/2});assert.equal(physics.facingAngle,asset.frame.rotation.y,'Camera heading used the physical tick');const seat=asset.visual.localToWorld(asset.seat.clone());maxSeatError=Math.max(maxSeatError,hip.getWorldPosition(new T.Vector3()).distanceTo(seat));maxCameraError=Math.max(maxCameraError,system.cameraTarget.distanceTo(asset.visual.getWorldPosition(new T.Vector3())));}
 assert(maxSeatError<.001,'Driver and chassis use different clocks');assert(maxCameraError<1e-9,'Camera tracks the physical staircase');
 assert(system.applyCorrection({x:50,y:.12,z:50}));assert(asset.frame.position.distanceTo(new T.Vector3(50,.02,50))<1e-9,'Correction interpolated through old geometry');
 results.push({model,fps,maxSeatError,maxCameraError});
}
fs.mkdirSync('docs/qa/vehicle-smoothness-2026-10-28',{recursive:true});fs.writeFileSync('docs/qa/vehicle-smoothness-2026-10-28/continuity.json',JSON.stringify({status:'PASS',results},null,2)+'\n');console.log('PASS vehicle render interpolation, exact per-frame travel, no collision overshoot, resets, yaw wrapping, real driver rigs and camera alignment');
