import assert from 'node:assert/strict';import fs from 'node:fs';import * as T from 'three';import {createServer} from 'node:http';import WebSocket from 'ws';import {attachRooms} from './rooms.mjs';import {RemoteMotion,capturePose,sanitizePose} from '../src/RemoteMotion.js';import {RemoteVehicle} from '../src/RemoteVehicle.js';import {sanitizeVehicle,vehicleOverlap} from '../src/VehicleNetwork.js';import {poseDriver} from '../src/DrivingPose.js';import {boneId} from '../src/MotionRetarget.js';import {vehicleAsset,vehicleHero,vehiclePacket} from './lib/vehicle-fixtures.mjs';
const hero=await vehicleHero(),results=[];
for(const model of ['bmw','corvette']){
 const asset=await vehicleAsset(model);assert.equal(asset.wheels.length,4,model+' wheels');assert(asset.door.children.length>0,model+' door');poseDriver(hero,asset);const hip=Object.values(hero.bones).find(b=>boneId(b.name)==='hips');assert(hip.getWorldPosition(new T.Vector3()).distanceTo(asset.visual.localToWorld(asset.seat.clone()))<.001);
 const bounds=new T.Box3();hero.model.traverse(mesh=>{if(mesh.isSkinnedMesh){mesh.skeleton.update();for(let i=0;i<mesh.geometry.attributes.position.count;i+=8)bounds.expandByPoint(mesh.localToWorld(mesh.applyBoneTransform(i,new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i))));}});assert(bounds.max.y<asset.size.y+.12,model+' driver head clips roof');
 for(const fps of [24,60,144]){
  const scene=new T.Scene(),player={id:model+fps,x:0,y:.12,z:7,facing:0,team:'free'},remote=new RemoteMotion(scene,hero,player,{});remote.vehicle.loadAsset=vehicleAsset;
  const first=vehiclePacket(1,'PARKED',model);remote.receive(player,{state:'IDLE',velocity:{x:0,y:0,z:0},vehicle:first},0);await remote.vehicle.ensureAsset(0);let seq=1,checks=0;
  for(let i=0;i<fps*5;i++){
   const time=i/fps,now=time*1000;if(i===0||Math.floor(time*10)>Math.floor((i-1)/fps*10)){
    const phase=time<.9?'ENTERING':time<3?'DRIVING':time<3.75?'EXITING':'PARKED',z=7+Math.max(0,Math.min(2.1,time-.9))*2,v=vehiclePacket(++seq,phase,model,{x:0,y:.02,z});v.start={x:1.65,y:.1,z:7.15};v.exit={x:1.65,y:.1,z:11.2};v.elapsed=phase==='ENTERING'?time:phase==='EXITING'?time-3:0;v.spin=(Math.max(0,time-.9)*5)%(Math.PI*2);v.steering=Math.sin(time)*.3;v.wheelDrops=[.02,.04,.06,.08];
    const p={...player,x:phase==='PARKED'?1.65:0,y:phase==='PARKED'?.1:.12,z:phase==='PARKED'?11.2:z};remote.receive(p,{state:phase==='PARKED'?'IDLE':'DRIVING',velocity:{x:0,y:0,z:phase==='DRIVING'?2:0},vehicle:v},now);
    if(seq>3)assert.equal(remote.vehicle.receive({...v,sequence:seq-2,position:{x:99,y:0,z:99}},now+1),false,'Reordered snapshot rewound car');
   }
   remote.update(1/fps,now);if(remote.vehicle.driver&&remote.vehicle.sample(now).phase==='DRIVING'){
    const asset=remote.vehicle.asset,bone=Object.values(remote.character.bones).find(b=>boneId(b.name)==='hips');assert(bone.getWorldPosition(new T.Vector3()).distanceTo(asset.visual.localToWorld(asset.seat.clone()))<.001,'Driver slid out of interpolated car');asset.wheels.forEach((w,i)=>assert(Math.abs(w.pivot.position.y-(w.restY-[.02,.04,.06,.08][i]))<.001,'Remote suspension diverged'));checks++;
   }
   for(const b of Object.values(remote.character.bones))assert(Math.abs(b.quaternion.length()-1)<.001);
  }
  assert(checks>fps);assert(!remote.vehicle.driver);assert(remote.mesh.position.distanceTo(remote.target)<.08,'Exit failed to restore walking root');remote.update(1/60,10000);assert.equal(remote.vehicle.sample(10000).speed,0,'Disconnected driver kept accelerating');remote.dispose();assert.equal(scene.children.length,0,'Remote car leaked after leaving');results.push({model,fps,seatChecks:checks});
 }
}
assert.equal(sanitizeVehicle({...vehiclePacket(1),model:'unknown'}),null);assert.equal(sanitizeVehicle({...vehiclePacket(1),position:{x:Infinity,y:0,z:0}}),null);assert.equal(sanitizePose({state:'DRIVING',velocity:{x:0,y:0,z:0}}),null);
assert(vehicleOverlap(vehiclePacket(1),vehiclePacket(1,'PARKED','corvette',{x:1,y:.02,z:7})));assert(!vehicleOverlap(vehiclePacket(1),vehiclePacket(1,'PARKED','corvette',{x:8,y:.02,z:7})));
// Disposal while a remote GLB is loading cannot resurrect a ghost car.
{const scene=new T.Scene(),c=await vehicleHero();let finish;const asset=await vehicleAsset('corvette'),remote=new RemoteVehicle(scene,c,{loadAsset:()=>new Promise(r=>finish=r)});remote.receive(vehiclePacket(1),0);remote.update(.016,0,new T.Vector3());remote.dispose();finish(asset);await new Promise(r=>setImmediate(r));assert.equal(scene.children.length,0);}
const server=createServer(),api=attachRooms(server);await new Promise(r=>server.listen(0,'127.0.0.1',r));const sockets=[];
const connect=()=>new Promise((resolve,reject)=>{const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);ws.events=[];ws.on('message',raw=>ws.events.push(JSON.parse(raw)));ws.once('open',()=>{sockets.push(ws);resolve(ws);});ws.once('error',reject);});const send=(ws,data)=>ws.send(JSON.stringify(data)),wait=async(ws,pred)=>{const end=Date.now()+3000;while(Date.now()<end){const i=ws.events.findIndex(pred);if(i>=0)return ws.events.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('WS timeout '+JSON.stringify(ws.events));};
try{
 const [a,b]=await Promise.all([connect(),connect()]);send(a,{type:'create',mode:'free',city:'procedural',capacity:2});const opened=await wait(a,v=>v.type==='room');const joined=await wait(a,v=>v.type==='joined');send(b,{type:'join',code:opened.room.code,city:'procedural'});await wait(a,v=>v.type==='room'&&v.players.length===2);for(const ws of [a,b])send(ws,{type:'ready',ready:true});await wait(a,v=>v.type==='room'&&v.players.every(p=>p.ready));send(a,{type:'start'});await wait(a,v=>v.type==='room'&&v.room.phase==='playing');
 const move=async(v,position={x:0,y:.1,z:0})=>{await new Promise(r=>setTimeout(r,60));send(a,{type:'move',...position,facing:0,pose:{state:v.phase==='PARKED'||v.phase==='NONE'?'IDLE':'DRIVING',velocity:{x:0,y:0,z:0},vehicle:v}});};
 await move(vehiclePacket(1));const parked=await wait(b,v=>v.type==='move'&&v.id===joined.id&&v.vehicle?.phase==='PARKED');assert.equal(parked.vehicle.model,'bmw');
 await move(vehiclePacket(2,'PARKED','bmw',{x:20,y:.02,z:20}));assert.equal((await wait(a,v=>v.type==='correction')).vehicle.model,'bmw');
 await move(vehiclePacket(3),{x:1.65,y:.1,z:7.15});await wait(a,v=>v.type==='move'&&v.pose?.vehicle?.sequence===3);await move(vehiclePacket(4,'ENTERING'),{x:0,y:.12,z:7});await wait(b,v=>v.type==='move'&&v.vehicle?.phase==='ENTERING');await move(vehiclePacket(5,'DRIVING'),{x:0,y:.12,z:7});await wait(b,v=>v.type==='move'&&v.vehicle?.phase==='DRIVING');
 await move({...vehiclePacket(6,'DRIVING'),position:{x:0,y:.02,z:50}},{x:0,y:.12,z:50});await wait(a,v=>v.type==='correction');
 await move(vehiclePacket(7,'EXITING'),{x:0,y:.12,z:7});await wait(b,v=>v.type==='move'&&v.vehicle?.phase==='EXITING');await move(vehiclePacket(8),{x:1.65,y:.1,z:7.15});await wait(b,v=>v.type==='move'&&v.vehicle?.sequence===8);
 send(a,{type:'leave'});await wait(b,v=>v.type==='room'&&v.players.length===1);
}finally{for(const ws of sockets)ws.close();await new Promise(r=>setTimeout(r,30));await new Promise(r=>server.close(r));}
fs.mkdirSync('docs/qa/online-vehicles-2026-10-28',{recursive:true});fs.writeFileSync('docs/qa/online-vehicles-2026-10-28/sync.json',JSON.stringify({status:'PASS',results,scope:'Real rigs, real car assets and real two-client WebSocket messages; interpolation, stale packet rejection, entry/drive/exit, collision correction and leave cleanup'},null,2)+'\n');console.log('PASS online vehicles',results);
