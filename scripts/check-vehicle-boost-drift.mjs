import assert from 'node:assert/strict';
import * as T from 'three';
import {VehicleController,VEHICLE} from '../src/VehicleController.js';

const city={isStreamed:false,colliders:[]};
for(const fps of [30,60,144]){
  const drive=(input,seconds,limit)=>{const car=new VehicleController(city);for(let i=0;i<seconds*fps;i++)car.update(1/fps,{...input,speedLimit:limit});return car;};
  const normal=drive({forward:true},8,Infinity),boost=drive({forward:true,sprint:true},8,Infinity);
  assert(normal.speed<=VEHICLE.maxSpeed+.001);
  assert(boost.speed>normal.speed+5&&boost.speed<=VEHICLE.boostSpeed+.001,`${fps}fps boost did not increase speed`);
  assert(drive({forward:true,sprint:true},8,24).speed<=24.001,'Online speed ceiling was exceeded');
  const car=new VehicleController(city);car.speed=15;
  for(let i=0;i<fps;i++)car.update(1/fps,{forward:true,left:true,jump:true});
  assert(Math.abs(car.yaw-car.travelYaw)>.05,'Handbrake steering produced no sideslip');
  assert(car.position.toArray().every(Number.isFinite));
  for(let i=0;i<fps*2;i++)car.update(1/fps,{jump:true});
  assert(Math.abs(car.speed)<.01,'Straight handbrake failed to stop');
}
const blocked=new VehicleController({isStreamed:true,raycast:()=>null});blocked.speed=20;
blocked.update(1/30,{forward:true,left:true,jump:true,sprint:true});
assert.equal(blocked.speed,0);assert.equal(blocked.velocity.length(),0);
console.log('PASS boost, online ceiling, drift, braking and unloaded terrain at 30/60/144 FPS');
