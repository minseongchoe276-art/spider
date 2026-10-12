import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SwingPhysics } from '../src/SwingPhysics.js';
import { StreamedCollision } from '../src/StreamedCollision.js';
import { sweepBody } from '../src/MovementCollision.js';
import { ThirdPersonCamera } from '../src/Camera.js';
import { City } from '../src/City.js';

const camera = new THREE.PerspectiveCamera(); camera.rotation.y = Math.PI;
const silent = new Proxy({}, { get: () => () => {} });
const input = () => ({ forward:false, backward:false, left:false, right:false,
  sprint:false, jump:false, webHold:false, webTap:false, strafe:0, wallRun:false });
function player() {
  const character = { group:new THREE.Group(), update(){}, requestTurn(){}, stopAnimation(){}, toggleHand(){}, fireWeb(){} };
  const city = { colliders:[], buildingMeshes:[], checkCollision:()=>({collided:false}),
    getRooftopSpawn:()=>new THREE.Vector3(0,0.1,0) };
  const p = new SwingPhysics(new THREE.Scene(),city,character,silent);
  p.position.set(0,0.1,0); p.state='IDLE'; return p;
}
// Free-cursor web aim follows the clicked screen point; pointer lock maps to center.
const aimCamera=new THREE.PerspectiveCamera(60,2,0.1,500);
aimCamera.position.set(0,1.3,0);aimCamera.lookAt(0,1.3,-1);aimCamera.updateMatrixWorld(true);
const aimed=player();
aimed.position.y=1; // Keep the quick-click swing test clear of the mock ground plane.
const aimBuilding=new THREE.Mesh(new THREE.BoxGeometry(6,8,2));
aimBuilding.position.set(28,11,-30);aimBuilding.updateMatrixWorld(true);
aimed.city.buildingMeshes=[aimBuilding];
aimed.city.colliders=[{minX:25,maxX:31,minY:7,maxY:15,minZ:-31,maxZ:-29}];
aimed.city.raycast=City.prototype.raycast;
aimed.setWebAimPoint(900,125,{left:0,top:0,width:1000,height:500});
const clickedAnchor=aimed.findBestAnchor(aimCamera);
assert(clickedAnchor && clickedAnchor.x>20,'Web shot ignored the clicked screen point');
aimed.setWebAimPoint(900,125,{left:0,top:0,width:1000,height:500});
const quickClick=input();quickClick.webTap=true;
aimed.update(1/60,quickClick,aimCamera);
assert(aimed.isSwinging,`Quick web tap lost: state=${aimed.state} candidate=${aimed.bestAnchorCandidate?.toArray()} anchor=${aimed.anchorPoint?.toArray()} held=${quickClick.webHold}`);
assert(quickClick.webHold,'Successful web tap did not latch until the explicit release action');
const proceduralWalls=Object.create(City.prototype);
proceduralWalls.colliders=[{minX:-2,maxX:2,minY:0,maxY:12,minZ:4,maxZ:5}];
const proceduralWallHit=proceduralWalls.raycast(new THREE.Vector3(0,2,0),new THREE.Vector3(0,0,1),6);
assert(proceduralWallHit && proceduralWallHit.normal.z<0,'Procedural city wall raycast is missing for wall-run attachment');
aimed.setWebAimPoint(900,125,{left:0,top:0,width:1000,height:500},true);
assert.equal(aimed.webAimNdc.x,0,'Pointer-lock aim did not return to screen center');
aimed.setWebAimPoint(500,250,{left:0,top:0,width:1000,height:500});
assert.equal(aimed.findBestAnchor(aimCamera),null,'Center aim incorrectly selected an off-center building');
const wall = { minX:-4, maxX:4, minY:0, maxY:10, minZ:3, maxZ:3.01 };
assert(sweepBody(new THREE.Vector3(0,1,0),new THREE.Vector3(0,1,20),[wall]));
const ceiling = { minX:-4,maxX:4,minZ:-4,maxZ:4,minY:2,maxY:2.1 };
const head = sweepBody(new THREE.Vector3(0,0.1,0),new THREE.Vector3(0,4,0),[ceiling]);
assert.equal(head.normal.y,-1);
// Equal simulated durations produce equal positions, including 144 Hz render.
let reference;
for (const rate of [30,60,120,144]) {
  const p=player(), i=input();i.forward=true;i.sprint=true;
  for(let n=0;n<rate*2;n++) p.update(1/rate,i,camera);
  if(!reference) reference=p.position.clone();
  assert(p.position.distanceTo(reference)<1e-8,`Position depends on render FPS ${rate}`);
}
const buffer=player();buffer.position.y=0.2;buffer.velocity.y=-2;buffer.state='FALLING';
const bi=input();bi.jump=true;buffer.update(1/120,bi,camera);
for(let n=0;n<12;n++)buffer.update(1/120,bi,camera);
assert(buffer.velocity.y>0,'Buffered jump was lost before landing');
const energy=player();energy.canAirJump=false;energy.isSwinging=true;energy.velocity.set(25,2,0);
const speed=energy.velocity.length();energy.releaseSwing();
assert.equal(energy.canAirJump,false);assert.equal(energy.velocity.length(),speed);
energy.position.x=NaN;energy.update(1/60,input(),camera);assert(Number.isFinite(energy.position.x));

// Actual triangle collisions, rather than mock bounding boxes: ground, slope,
// stairs/headroom and a thin wall share the rendered world-space geometry.
const world=new StreamedCollision();await world.initialized;
const floor=new THREE.Mesh(new THREE.BoxGeometry(40,1,40));floor.position.y=-0.5;
const facade=new THREE.Mesh(new THREE.BoxGeometry(8,8,0.05));facade.position.set(0,4,3);
world.enqueue(floor);world.enqueue(facade);
world.update(new THREE.Vector3());world.update(new THREE.Vector3());
assert(Math.abs(world.groundAt(new THREE.Vector3(0,2,0),3))<0.01);
const velocity=new THREE.Vector3(0,-2,40);
const result=world.resolve(new THREE.Vector3(0,0.15,0),new THREE.Vector3(0,0.05,8),velocity);
assert(result.position.z<2.7,'Capsule tunneled through a streamed triangle wall');
assert(result.position.y>-0.1,'Capsule fell through streamed ground');
const step=new THREE.Mesh(new THREE.BoxGeometry(3,0.2,2));step.position.set(7,0.1,0);
world.enqueue(step);world.update(new THREE.Vector3());
const climbed=world.resolve(new THREE.Vector3(4.5,0.125,0),new THREE.Vector3(7,0.12,0),new THREE.Vector3(4,-1,0));
assert(climbed.position.x>6.5 && climbed.position.y>0.25,'Small step failed autostep');
const roof=new THREE.Mesh(new THREE.BoxGeometry(3,0.1,3));roof.position.set(-7,2.2,0);
world.enqueue(roof);world.update(new THREE.Vector3());
const bonk=world.resolve(new THREE.Vector3(-7,0.15,0),new THREE.Vector3(-7,4,0),new THREE.Vector3(0,17,0));
assert(bonk.position.y<0.6,'Head passed through streamed ceiling');
const ramp=new THREE.Mesh(new THREE.BoxGeometry(4,0.2,5));ramp.rotation.x=Math.PI/12;ramp.position.set(12,1,0);
world.enqueue(ramp);world.update(new THREE.Vector3());
assert(world.groundAt(new THREE.Vector3(12,4,0),5)!==null,'Walkable slope rejected as support');
assert.equal(world.groundAt(new THREE.Vector3(100,4,100),5),null,'Unloaded space became an invisible floor');
const wallRay=world.raycast(new THREE.Vector3(0,2,0),new THREE.Vector3(0,0,1),5);
assert(wallRay && wallRay.distance>2 && wallRay.distance<3,'Collision ray missed streamed facade');
assert(wallRay.normal.z<-.9,'Collision ray normal points through the wall');
const roofMesh=new THREE.Mesh(new THREE.BoxGeometry(8,0.1,8));roofMesh.position.set(0,8.25,3.7);
world.enqueue(roofMesh);world.update(new THREE.Vector3());
const wallRunner=player();wallRunner.city.collisionWorld=world;wallRunner.city.raycast=world.raycast.bind(world);
wallRunner.state='WALL_RUNNING';wallRunner.position.set(0,2,2.6);wallRunner.wallNormal.set(0,0,-1);
const running=input();running.forward=true;running.wallRun=true;
wallRunner.updateWallRunPhysics(1/120,running,camera);
assert.equal(wallRunner.state,'WALL_RUNNING','Wall run detached despite a real streamed facade');
assert(wallRunner.velocity.y>0,'Wall run did not climb along the contacted facade');
wallRunner.city.raycast=()=>null;
wallRunner.updateWallRunPhysics(1/120,running,camera);
assert.equal(wallRunner.state,'FALLING','Wall run continued after the streamed facade ended');
wallRunner.state='WALL_RUNNING';wallRunner.position.set(0,7.55,2.6);wallRunner.wallNormal.set(0,0,-1);
wallRunner.city.raycast=world.raycast.bind(world);
wallRunner.updateWallRunPhysics(1/120,running,camera);
assert.equal(wallRunner.state,'MANTLING','Wall run failed to begin traversal onto a real streamed roof');
for(let t=0;t<0.85 && wallRunner.state==='MANTLING';t+=1/120)wallRunner.updateMantlePhysics(1/120,input());
assert.equal(wallRunner.state,'IDLE','Streamed mantle failed to complete');
assert(wallRunner.position.y>8.2,'Roof transition left the player below the actual roof surface');
const cameraCheck=new ThirdPersonCamera(new THREE.PerspectiveCamera(),{});
const cameraSafe=cameraCheck.safeDistance(new THREE.Vector3(),new THREE.Vector3(0,0,1),6,[],
  (origin,direction,max)=>direction.z>0?{distance:3}:null);
assert(cameraSafe<2.8 && cameraSafe>2.5,'Camera ignored streamed collision geometry');
world.setActiveMeshes([]);
for (const entry of world.meshes.values()) if(entry) entry.inactiveSince=performance.now()-3000;
world.update(new THREE.Vector3());
assert.equal(world.groundAt(new THREE.Vector3(0,2,0),3),null,'Inactive LOD retained a ghost floor');
console.log('PASS: fixed physics at 30/60/120/144 FPS, streamed wall/roof transitions, camera collision, thin walls, ceiling, input buffer, swing energy, recovery, triangle/capsule collision');
