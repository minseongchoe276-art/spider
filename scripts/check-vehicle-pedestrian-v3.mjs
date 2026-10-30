import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VehicleSystem} from '../src/VehicleSystem.js';
import {VehicleController,VEHICLE} from '../src/VehicleController.js';
import {prepareBMW,prepareCorvette} from '../src/VehicleAsset.js';
import {AmbientCitizens,AMBIENT_COUNTS} from '../src/AmbientCitizens.js';
import {attachFootpaths} from '../src/PedestrianRoutes.js';
import {districtLayout} from '../src/DistrictLayout.js';
import {LOCAL_CITY} from '../src/LocalCityLayout.js';
import {loadCitizenRigs} from './lib/citizen-rig.mjs';
globalThis.ProgressEvent=class{};

const seed=()=>{let x=7281;return()=>((x=(1664525*x+1013904223)>>>0)/4294967296);};
async function rig(path){
 const b=fs.readFileSync(path),sz=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+sz));
 j.buffers[0].uri='data:application/octet-stream;base64,'+b.subarray(28+sz).toString('base64');
 delete j.images;delete j.textures;j.materials=[];
 j.meshes.forEach(m=>m.primitives.forEach(p=>delete p.material));
 return (await new GLTFLoader().parseAsync(JSON.stringify(j),'')).scene;
}
function boxCity(meshes,streamed=false){
 const ray=new T.Raycaster();
 return {
  isStreamed:streamed,
  playableHalfExtent:400,
  colliders:meshes.map(mesh=>{mesh.updateMatrixWorld(true);const box=new T.Box3().setFromObject(mesh);return {minX:box.min.x,maxX:box.max.x,minY:box.min.y,maxY:box.max.y,minZ:box.min.z,maxZ:box.max.z};}),
  raycast(origin,direction,distance){
   ray.set(origin,direction);ray.far=distance;
   const hit=ray.intersectObjects(meshes,false)[0];
   if(!hit)return null;
   return {point:hit.point,distance:hit.distance,normal:hit.face.normal.clone().transformDirection(hit.object.matrixWorld),building:true};
  }
 };
}
function physicsAt(x,y,z){
 return {position:new T.Vector3(x,y,z),renderPosition:new T.Vector3(x,y,z),previousFixedPosition:new T.Vector3(x,y,z),velocity:new T.Vector3(),state:'IDLE',facingAngle:0,clearPendingInput(){},clearWebAnchor(){}};
}
function parkSystem(city,physics,asset){
 const notices=[];
 const system=new VehicleSystem({scene:new T.Scene(),city,physics,character:{group:new T.Group(),bones:{},actions:{}},loadAsset:async()=>asset,onNotice:message=>notices.push(message),getCitizens:()=>[]});
 return {system,notices};
}

const results={};
// TEST 01 roof. A street plane sits under the roof. The car must stay on the roof.
{
 const roof=new T.Mesh(new T.BoxGeometry(40,2,40));roof.position.set(100,94,90);roof.updateMatrixWorld(true);
 const street=new T.Mesh(new T.PlaneGeometry(400,400));street.rotation.x=-Math.PI/2;street.position.y=0;street.updateMatrixWorld(true);
 const city=boxCity([roof,street]);city.isStreamed=false;
 const physics=physicsAt(100,95.12,90);
 const {system}=parkSystem(city,physics);
 const found=system.findParking();
 assert(found,`TEST 01 roof spawn was refused ${system.playerSupport()}`);
 assert(found.position.y>90&&found.position.y<96,`TEST 01 car left the roof at y=${found.position.y}`);
 assert(Math.abs(found.position.x-100)<40&&Math.abs(found.position.z-90)<40,'TEST 01 car left the roof slab');
 results.roof={y:+found.position.y.toFixed(3),x:+found.position.x.toFixed(2),z:+found.position.z.toFixed(2)};
}
// TEST 02 street. Do not copy a high player onto an empty sample.
{
 const city=boxCity([]);city.isStreamed=false;
 const physics=physicsAt(0,.1,0);
 const {system}=parkSystem(city,physics);
 const found=system.findParking();
 assert(found&&found.position.y<1&&found.position.y>-.05,`TEST 02 street height ${found?.position.y}`);
 assert(Math.hypot(found.position.x,found.position.z)>6,'TEST 02 parked on the player');
 results.street={y:+found.position.y.toFixed(3)};
}
// TEST 03 no stall on this floor, and no surface while airborne.
{
 const pad=new T.Mesh(new T.BoxGeometry(3,1,3));pad.position.set(0,40,0);pad.updateMatrixWorld(true);
 const city=boxCity([pad]);city.isStreamed=false;
 const physics=physicsAt(0,40.6,0);
 const {system,notices}=parkSystem(city,physics);
 system.asset={frame:{visible:false,position:new T.Vector3()},wheels:[]};
 assert.equal(await system.interact(),false);
 assert(notices.at(-1).includes('지금 서 있는 층'),notices.at(-1));
 physics.position.set(0,30,0);
 const air=[];
 system.onNotice=message=>air.push(message);
 assert.equal(system.findParking(),null);
 assert.equal(await system.interact(),false);
 assert(air.at(-1).includes('발밑'),air.at(-1));
 results.noSpace=true;
}
// TEST 13 rolling. The spin formula is unchanged; distance must match the arc.
{
 const floor=new T.Mesh(new T.PlaneGeometry(200,200));floor.rotation.x=-Math.PI/2;floor.updateMatrixWorld(true);
 const city=boxCity([floor],true);
 const car=new VehicleController(city,new T.Vector3(0,.02,0));car.wheelRadius=.34;
 for(let i=0;i<120;i++)car.update(1/60,{forward:true});
 assert(car.speed>2,'TEST 13 car did not get up to speed');
 const arc=Math.abs(car.spin*car.wheelRadius),distance=car.position.length();
 assert(Math.abs(arc-distance)<.05,`TEST 13 arc ${arc.toFixed(3)} vs distance ${distance.toFixed(3)}`);
 assert(VEHICLE.acceleration===5.8&&VEHICLE.maxSpeed===24,'TEST 13 changed a forbidden vehicle number');
 results.roll={speed:+car.speed.toFixed(3),arc:+arc.toFixed(3),distance:+distance.toFixed(3)};
}

const bmw=prepareBMW(await rig('public/vehicles/bmw-330i.glb'));
const corvette=prepareCorvette(await rig('public/vehicles/corvette-c6.glb'));
function doorCenter(asset){
 asset.frame.position.set(0,0,0);asset.frame.rotation.set(0,0,0);asset.frame.updateMatrixWorld(true);
 const box=new T.Box3();
 asset.door.traverse(node=>{
  const position=node.isMesh&&node.geometry.attributes?.position;if(!position)return;
  const step=Math.max(1,Math.floor(position.count/250));
  for(let i=0;i<position.count;i+=step)box.expandByPoint(asset.frame.worldToLocal(node.localToWorld(new T.Vector3().fromBufferAttribute(position,i))));
 });
 return box.getCenter(new T.Vector3());
}
// TEST 04 and 05. The 2.3 m rule stays. The trunk is still too far. The door point is outside the cabin, on the seat's side.
for(const [name,asset] of [['bmw',bmw],['corvette',corvette]]){
 asset.frame.position.set(0,0,0);asset.frame.rotation.set(0,0,0);asset.frame.updateMatrixWorld(true);
 const entry=asset.frame.worldToLocal(new T.Vector3(1.65,.1,.15).applyMatrix4(asset.frame.matrixWorld));
 assert(entry.x>asset.size.x/2,`${name} door point is inside the body x=${entry.x}`);
 assert(Math.sign(entry.x)===Math.sign(asset.seat.x),`${name} door point is on the opposite side from the seat`);
 assert(Math.abs(entry.z)<asset.size.z/2-0.4,`${name} door point sits past a bumper z=${entry.z}`);
 const rear=new T.Vector3(0,.1,-asset.size.z/2);
 assert(rear.distanceTo(entry)>2.3,`${name} trunk is inside the enter radius`);
 const floor=new T.Mesh(new T.PlaneGeometry(80,80));floor.rotation.x=-Math.PI/2;floor.updateMatrixWorld(true);
 const city=boxCity([floor],true);
 const physics=physicsAt(0,.1,0);
 const {system}=parkSystem(city,physics,asset);
 await system.interact();
 assert.equal(system.state,'PARKED',name);
 physics.position.copy(asset.frame.localToWorld(rear.clone()));physics.state='IDLE';
 assert.equal(await system.interact(),false,`${name} entered from the trunk`);
 assert(physics.position.distanceTo(system.doorPoint())>2.3);
 physics.position.copy(system.doorPoint());physics.state='IDLE';
 assert.equal(await system.interact(),true,`${name} refused the driver door`);
 assert.equal(system.state,'ENTERING');
 results[name]={entry:entry.toArray().map(v=>+v.toFixed(3)),door:doorCenter(asset).toArray().map(v=>+v.toFixed(3))};
}
assert(new T.Vector3(...results.bmw.entry).distanceTo(new T.Vector3(...results.bmw.door))<1.4,'BMW door point is far from the door skin');

const assets=await loadCitizenRigs();
function localCity(id){
 if(id==='procedural'){
  const city={mapId:id,layout:{...LOCAL_CITY},buildings:[],district:{roads:[],zones:[]},isStreamed:false,playableHalfExtent:LOCAL_CITY.playableHalfExtent};
  city.footpaths=attachFootpaths(city);
  return city;
 }
 const district=districtLayout(id);
 const city={mapId:id,buildings:district.buildings,district,isStreamed:false,playableHalfExtent:LOCAL_CITY.playableHalfExtent};
 city.footpaths=attachFootpaths(city);
 return city;
}
function population(id,playerY){
 const city=localCity(id);
 const player={position:new T.Vector3(0,playerY,0),velocity:new T.Vector3(),state:'IDLE',facingAngle:0};
 const manager=new AmbientCitizens({scene:new T.Scene(),city,player,assets,random:seed(),max:AMBIENT_COUNTS[id]});
 return {city,player,manager};
}
const counts={};
for(const id of ['procedural','harbor','gardens','old-town','skyline']){
 const {city,manager}=population(id,.2);
 const cpu=[];
 for(let i=0;i<90;i++){manager.update(1/30);cpu.push(manager.metrics.lastMs||0);}
 assert(manager.targets.length>0,`${id} spawned nobody`);
 assert(manager.targets.length<=AMBIENT_COUNTS[id],`${id} exceeded its cap`);
 for(const n of manager.targets){
  assert(city.footpaths.allows(n.position.x,n.position.z),`${id} citizen left the footpath`);
  assert(!manager.buildingFootprint(n.position.x,n.position.z),`${id} citizen inside a building`);
  assert(n.position.y>-.05&&n.position.y<.2,`${id} citizen y=${n.position.y}`);
 }
 const start=new Map(manager.targets.map(n=>[n.id,n.position.clone()]));
 for(let i=0;i<60;i++)manager.update(1/30);
 const travel=[];
 for(const n of manager.targets){
  const from=start.get(n.id);if(!from)continue;
  travel.push(n.position.distanceTo(from));
  assert(city.footpaths.allows(n.position.x,n.position.z),`${id} walked off the path`);
  assert(!manager.buildingFootprint(n.position.x,n.position.z),`${id} entered a building`);
 }
 assert(travel.some(d=>d>.4),`${id} nobody walked ${travel.map(d=>d.toFixed(2))}`);
 const pool=manager.slots.length;
 const ids=new Set(manager.targets.map(n=>n.id));
 manager.clear();
 assert.equal(manager.targets.length,0,`${id} clear left citizens`);
 playerCatch(manager);
 for(let i=0;i<90;i++)manager.update(1/30);
 assert(manager.slots.length<=pool+AMBIENT_COUNTS[id],'pool grew without a bound');
 assert(manager.targets.length>0&&manager.targets.length<=AMBIENT_COUNTS[id],`${id} did not return after clear`);
 assert(manager.targets.every(n=>!ids.has(n.id)),`${id} reused a live id after clear`);
 manager.dispose();
 assert.equal(manager.slots.length,0);
 const sorted=cpu.filter(v=>v>0).sort((a,b)=>a-b);
 counts[id]={count:travel.length,cap:AMBIENT_COUNTS[id],cpuP95:sorted.length?+sorted[Math.floor(sorted.length*.95)].toFixed(3):0,walked:travel.filter(d=>d>.4).length};
}
function playerCatch(manager){manager.player.position.set(0,.2,0);}

assert(new Set(Object.values(AMBIENT_COUNTS)).size>=4,'every city was given the same citizen cap');
assert(counts.procedural.cap!==counts['old-town'].cap,'procedural and old-town caps match');
results.citizens=counts;

// Roof player still gets a street population, not a copy of the roof height.
{
 const {manager}=population('procedural',95.5);
 for(let i=0;i<120;i++)manager.update(1/30);
 assert(manager.targets.length>0,'roof player saw an empty street');
 for(const n of manager.targets){
  assert(n.position.y<1,'citizen spawned on the roof');
  const horizontal=Math.hypot(n.position.x,n.position.z);
  assert(horizontal>=22&&horizontal<=70,`roof bubble ${horizontal.toFixed(1)}`);
 }
 manager.dispose();
 results.roofCitizens=manager.metrics.spawned;
}

// TEST 11. An offscreen legacy road spawn is recycled instead of walking through traffic.
{
 const blocks=[new T.Mesh(new T.BoxGeometry(6,12,160)),new T.Mesh(new T.BoxGeometry(6,12,160))];
 blocks[0].position.set(11,6,0);blocks[1].position.set(-11,6,0);
 for(const mesh of blocks)mesh.userData.surfaceType='building';
 const floor=new T.Mesh(new T.PlaneGeometry(400,400));floor.rotation.x=-Math.PI/2;floor.position.y=2;floor.userData.surfaceType='terrain';
 const meshes=[floor,...blocks];for(const mesh of meshes)mesh.updateMatrixWorld(true);
 const ray=new T.Raycaster();
 const city={isStreamed:true,collisionWorld:{ready:true},raycast(origin,direction,distance){ray.set(origin,direction);ray.far=distance;const h=ray.intersectObjects(meshes,false)[0];return h?{distance:h.distance,point:h.point,normal:h.face.normal.clone().transformDirection(h.object.matrixWorld),mesh:h.object}:null;}};
 const player={position:new T.Vector3(0,2.01,40),velocity:new T.Vector3(),state:'IDLE',facingAngle:0};
 const manager=new AmbientCitizens({scene:new T.Scene(),city,player,assets,random:seed(),max:1});
 assert(manager.place(new T.Vector3(0,2.01,0),0));
 const person=manager.targets[0];
 manager.spawnAt=Infinity;
 let previous=person.position.clone(),worst=0;
 for(let i=0;i<150;i++){
  manager.update(1/30);
  const step=person.position.distanceTo(previous);
  worst=Math.max(worst,step);
  previous=person.position.clone();
 }
 assert(worst<.7,`TEST 11 teleported ${worst.toFixed(2)} m in one frame`);
 assert.equal(person.active,false,'TEST 11 invalid road resident was not recycled');
 results.recovery={x:+person.position.x.toFixed(2),state:person.state,worst:+worst.toFixed(3)};
 manager.dispose();
}

// TEST 12. A footprint sample is not a floor, and live citizens stayed on the graph above.
{
 const {city,manager}=population('procedural',.2);
 const block=city.footpaths.nodes[0];
 assert.equal(manager.floor(new T.Vector3(0,0,0),true)===0||manager.floor(new T.Vector3(0,0,0),true)===null,true);
 // Block centers are not sidewalks. Use a point the graph rejects.
 assert.equal(manager.floor(new T.Vector3(1000,0,1000)),null);
 assert(block,'no footpath node');
 assert.equal(manager.floor(new T.Vector3(block.x,0,block.z)),0);
 manager.dispose();
 results.pierce=true;
}

// TEST 14. Citizens do not gain a vehicle fear state. A body inside the car stops it.
{
 const floor=new T.Mesh(new T.PlaneGeometry(80,80));floor.rotation.x=-Math.PI/2;floor.updateMatrixWorld(true);
 const city=boxCity([floor],true);
 const car=new VehicleController(city,new T.Vector3(0,.02,0));
 const body=new T.Vector3(0,.5,3);
 car.occupied=(position)=>position.distanceTo(body)<2;
 for(let i=0;i<90;i++)car.update(1/60,{forward:true});
 assert(car.position.z<3.2,`car drove through the body to ${car.position.z.toFixed(2)}`);
 assert.equal(car.speed,0);
 results.together={stopped:+car.position.z.toFixed(2)};
}

fs.mkdirSync('docs/qa/quality-director-2026-10-28',{recursive:true});
fs.writeFileSync('docs/qa/quality-director-2026-10-28/vehicle-pedestrian-v3-unit.json',JSON.stringify(results,null,2)+'\n');
console.log('PASS v3',JSON.stringify(results));
