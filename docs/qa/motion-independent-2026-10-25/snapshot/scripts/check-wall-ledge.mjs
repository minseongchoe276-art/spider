import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SwingPhysics } from '../src/SwingPhysics.js';
import { City } from '../src/City.js';
import { planMantle, mantlePosition } from '../src/LedgeTraversal.js';
import { StreamedCollision } from '../src/StreamedCollision.js';
import { proceduralCollision } from './city-collision.mjs';
import './check-mantle-balcony.mjs';

const silent=new Proxy({},{get:()=>()=>{}});
const held={forward:true,wallRun:true,strafe:0};
function actor(city){return new SwingPhysics(new THREE.Scene(),city,{group:new THREE.Group(),update(){},fireWeb(){}},silent);}
const roof={minX:-5,maxX:5,minY:0,maxY:10,minZ:-12,maxZ:0};
const parapet={minX:-5,maxX:5,minY:10,maxY:11.2,minZ:-.8,maxZ:0};
function rotated(box,angle){const b=new THREE.Box3();for(const x of [box.minX,box.maxX])for(const z of [box.minZ,box.maxZ])for(const y of [box.minY,box.maxY])b.expandByPoint(new THREE.Vector3(x,y,z).applyAxisAngle(new THREE.Vector3(0,1,0),angle));return {minX:b.min.x,maxX:b.max.x,minY:b.min.y,maxY:b.max.y,minZ:b.min.z,maxZ:b.max.z};}
let passed=0,failed=0;
async function check(name,run){try{await run();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}}
await check('Four facade directions and three frame rates climb over the actual 1.2m parapet and stay on its roof',()=>{
  for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(const fps of [30,60,144]){
    const city={colliders:[rotated(roof,angle),rotated(parapet,angle)],buildingMeshes:[],raycast:City.prototype.raycast,checkCollision:City.prototype.checkCollision};
    const p=actor(city),normal=new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0),angle),camera=new THREE.PerspectiveCamera();camera.rotation.y=angle;
    p.position.copy(normal).multiplyScalar(.7);p.position.y=7;p.state='WALL_RUNNING';p.wallNormal.copy(normal);p.wallBuilding=city.colliders[0];
    let mantle=false,landed=false,maxStep=0;
    for(let frame=0;frame<fps*5;frame++){
      const previous=p.position.clone();p.update(1/fps,{...held},camera);maxStep=Math.max(maxStep,previous.distanceTo(p.position));
      mantle ||= p.state==='MANTLING';assert(!['FALLING','JUMPING'].includes(p.state),'A held climb detached at the parapet');
      if(mantle && ['IDLE','RUNNING'].includes(p.state)){landed=true;break;}
    }
    assert(landed);assert.equal(p.position.y,10.1);assert(maxStep<.4,'Traversal root jumped between frames');
    for(let frame=0;frame<fps;frame++)p.update(1/fps,{},camera);
    assert.equal(p.state,'IDLE');assert.equal(p.position.y,10.1);
  }
});
await check('Parapet plan distinguishes the hand-grip height from the lower supported landing',()=>{
  const city={colliders:[roof,parapet],raycast:City.prototype.raycast},normal=new THREE.Vector3(0,0,1);
  const plan=planMantle(city,new THREE.Vector3(0,10.4,.7),normal,11.2);assert(plan);
  assert.equal(plan.end.y,10.1);assert(plan.end.z< -1.5);
  for(let i=0;i<=100;i++){const t=i/100,p=mantlePosition(plan,t);if(t>.42 && t<.78)assert(p.y>=11.3,'Feet lowered into the parapet before crossing it');}
});
await check('Blocked headroom retains the wall grip without passing through the roof',()=>{
  const ceiling={minX:-5,maxX:5,minY:11.3,maxY:11.6,minZ:-12,maxZ:1};
  const city={colliders:[roof,ceiling],buildingMeshes:[],raycast:City.prototype.raycast,checkCollision:City.prototype.checkCollision},p=actor(city);
  p.position.set(0,9.4,.7);p.wallNormal.set(0,0,1);p.state='WALL_RUNNING';
  for(let i=0;i<180;i++)p.update(1/60,{...held},new THREE.PerspectiveCamera());
  assert.equal(p.state,'WALL_RUNNING');assert(p.position.y<10);assert.equal(p.velocity.y,0);
});
await check('A blocked grip can move sideways to a clear, supported roof entry',()=>{
  const ceiling={minX:-.9,maxX:.9,minY:11.3,maxY:11.6,minZ:-12,maxZ:1};
  const city={colliders:[roof,ceiling],buildingMeshes:[],raycast:City.prototype.raycast,checkCollision:City.prototype.checkCollision},p=actor(city);
  p.position.set(0,9.4,.7);p.wallNormal.set(0,0,1);p.state='WALL_RUNNING';let mantle=false,landed=false;
  for(let i=0;i<240;i++){p.update(1/60,{...held,strafe:1},new THREE.PerspectiveCamera());mantle ||= p.state==='MANTLING';assert.notEqual(p.state,'FALLING');if(mantle && ['IDLE','RUNNING'].includes(p.state)){landed=true;break;}}
  assert(landed);assert(p.position.x>1.6);assert.equal(p.position.y,10.1);
});
await check('Holding a climb past 25 seconds does not impose an unexplained fall',()=>{
  const city={colliders:[{...roof,maxY:250}],buildingMeshes:[],raycast:City.prototype.raycast,checkCollision:City.prototype.checkCollision},p=actor(city);
  p.position.set(0,40,.7);p.wallNormal.set(0,0,1);p.state='WALL_RUNNING';p.wallRunTimer=26;
  p.update(1/60,{...held},new THREE.PerspectiveCamera());assert.equal(p.state,'WALL_RUNNING');assert(p.velocity.y>0);
});
await check('Real local-city building facades complete a supported arrival or retain the blocked grip',()=>{
  const city=proceduralCollision(),boxes=city.colliders.filter(b=>b.maxY-b.minY>15 && b.maxX-b.minX>8 && b.maxZ-b.minZ>8);let landed=0,blocked=0;
  for(const box of boxes)for(const face of ['north','south','east','west']){
    const p=actor(city),normal=new THREE.Vector3(face==='east'?1:face==='west'?-1:0,0,face==='north'?1:face==='south'?-1:0);
    p.position.set(normal.x?normal.x>0?box.maxX+.7:box.minX-.7:(box.minX+box.maxX)/2,box.maxY-2.5,normal.z?normal.z>0?box.maxZ+.7:box.minZ-.7:(box.minZ+box.maxZ)/2);
    p.wallNormal.copy(normal);p.state='WALL_RUNNING';p.wallBuilding=box;let mantle=false;
    for(let i=0;i<240;i++){p.update(1/60,{...held},new THREE.PerspectiveCamera());mantle ||= p.state==='MANTLING';assert.notEqual(p.state,'FALLING',`${face} facade at height ${box.maxY} detached`);if(mantle && ['IDLE','RUNNING'].includes(p.state))break;}
    if(mantle && ['IDLE','RUNNING'].includes(p.state))landed++;else{assert.equal(p.state,'WALL_RUNNING');blocked++;}
  }
  assert(landed>=boxes.length);console.log(`  Actual city: ${landed} safe arrivals, ${blocked} blocked grips, ${boxes.length*4} facades.`);
});
await check('Real Rapier terrain supports crossing the lip onto its lower roof at 30/60/144 FPS',async()=>{
  const world=new StreamedCollision();await world.initialized;
  for(const box of [roof,parapet]){const mesh=new THREE.Mesh(new THREE.BoxGeometry(box.maxX-box.minX,box.maxY-box.minY,box.maxZ-box.minZ));mesh.position.set((box.maxX+box.minX)/2,(box.maxY+box.minY)/2,(box.maxZ+box.minZ)/2);world.enqueue(mesh);}
  for(let i=0;i<30;i++)world.update(new THREE.Vector3());
  try{for(const fps of [30,60,144]){
    const city={collisionWorld:world,colliders:[],buildingMeshes:[],raycast:world.raycast.bind(world),resolveMovement:world.resolve.bind(world),supportHeight:p=>{const h=world.groundAt(p,.6);return h!==null && Math.abs(p.y-h-.1)<.3?h:null;},checkCollision:()=>({collided:false})};
    const p=actor(city);p.position.set(0,7,.375);p.wallNormal.set(0,0,1);p.state='WALL_RUNNING';let mantle=false,landed=false;
    for(let frame=0;frame<fps*5;frame++){p.update(1/fps,{...held},new THREE.PerspectiveCamera());mantle ||= p.state==='MANTLING';assert.notEqual(p.state,'FALLING');if(mantle && ['IDLE','RUNNING'].includes(p.state)){landed=true;break;}}
    assert(landed);assert(Math.abs(p.position.y-10.1)<.12);
  }}finally{world.dispose();}
});
console.log(`Wall ledge review: ${passed} passed, ${failed} failed.`);if(failed)process.exitCode=1;

// The actual generator has micrometre offsets between the body and parapet.
// Starting five metres below this roof used to hang forever at roofY - .8.
for(const fps of [24,30,60,144]) {
  const city=proceduralCollision(),box=city.colliders.find(c=>c.minY<1&&c.maxY>25&&c.maxX-c.minX>10&&c.maxZ-c.minZ>10);
  const p=actor(city);p.position.set((box.minX+box.maxX)/2,box.maxY-5,box.maxZ+.7);
  p.previousFixedPosition.copy(p.position);p.renderPosition.copy(p.position);
  p.wallNormal.set(0,0,1);p.state='WALL_RUNNING';p.wallBuilding=box;
  const seam=p.position.clone();seam.y=box.maxY;
  assert(city.raycast(seam,new THREE.Vector3(0,0,-1),1.1).normal.z>.99,'Horizontal facade ray selected a roof normal at the seam');
  let mantle=false,landed=false;
  for(let n=0;n<fps*6;n++) {
    p.update(1/fps,{...held},new THREE.PerspectiveCamera());mantle ||= p.state==='MANTLING';
    if(mantle&&['IDLE','RUNNING'].includes(p.state)){landed=true;break;}
  }
  assert(landed,`${fps}fps actual parapet seam trapped the climb`);
  assert(Math.abs(p.position.y-box.maxY-.1)<.01);
}
console.log('PASS 24/30/60/144fps real floating-point parapet seam completes a roof arrival');
