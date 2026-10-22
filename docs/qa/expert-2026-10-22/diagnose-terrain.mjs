import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SwingPhysics } from '../../../src/SwingPhysics.js';
import { StreamedCollision } from '../../../src/StreamedCollision.js';
import { planMantle, groundSample } from '../../../src/LedgeTraversal.js';
import { City } from '../../../src/City.js';

const silent=new Proxy({}, {get:()=>()=>{}}),camera=new THREE.PerspectiveCamera();
const input=()=>({forward:false,backward:false,left:false,right:false,strafe:0,wallRun:false,webHold:false});
const roof={minX:-3,maxX:3,minZ:-6,maxZ:0,minY:0,maxY:10};
const start=new THREE.Vector3(0,9.4,0.7),normal=new THREE.Vector3(0,0,1);
function player(city) {
  const character={group:new THREE.Group(),update(){},stopAnimation(){},toggleHand(){},fireWeb(){}};
  const p=new SwingPhysics(new THREE.Scene(),city,character,silent);
  return p;
}
function begin(city) {
  city.buildingMeshes ||= [];city.checkCollision ||= ()=>({collided:false});
  const p=player(city);p.position.copy(start);p.wallNormal.copy(normal);
  p.mantle=planMantle(city,start,normal,10);assert(p.mantle);p.state='MANTLING';return p;
}
let cases=0,reference;
for(const fps of [30,60,144]) {
  const city={colliders:[roof],raycast:City.prototype.raycast,checkCollision:City.prototype.checkCollision};
  const p=begin(city),i=input();let maxStep=0;
  for(let n=0;n<fps;n++) {
    const previous=p.position.clone();p.update(1/fps,i,camera);
    maxStep=Math.max(maxStep,p.position.distanceTo(previous));
  }
  assert.equal(p.state,'IDLE');assert.equal(p.position.y,10.1);assert(maxStep<0.3,'Mantle snapped its physical root');
  if(!reference)reference=p.position.clone();assert(p.position.distanceTo(reference)<1e-8);cases++;
}
assert.equal(planMantle({colliders:[{...roof,minX:-0.2,maxX:0.2}]},start,normal,10),null,'Narrow railing accepted as a rooftop');cases++;
assert.equal(planMantle({colliders:[roof]},start,new THREE.Vector3(),10),null,'Missing facade normal accepted');
assert.equal(planMantle({colliders:[roof]},start,normal,NaN),null,'Non-finite roof height accepted');cases++;
const overhead={minX:-3,maxX:3,minZ:-3,maxZ:1,minY:11.3,maxY:11.5};
assert.equal(planMantle({colliders:[roof,overhead]},start,normal,10),null,'Blocked headroom accepted');cases++;
const jump=begin({colliders:[roof]});jump.update(1/120,{...input(),jump:true},camera);
assert.equal(jump.state,'JUMPING');assert.equal(jump.mantle,null);assert(jump.velocity.y>10 && jump.velocity.z>0);cases++;
const lost=begin({colliders:[roof]});lost.city.colliders=[];lost.update(1/120,input(),camera);
assert.equal(lost.state,'FALLING');assert.equal(lost.mantle,null);assert(lost.position.distanceTo(start)<0.1);cases++;
const narrowed=begin({colliders:[roof]});narrowed.city.colliders=[{...roof,minX:-0.2,maxX:0.2}];
narrowed.update(1/120,input(),camera);assert.equal(narrowed.state,'FALLING','LOD change removed the landing footprint but the mantle continued');cases++;
const blocked=begin({colliders:[roof]});blocked.city.colliders.push(overhead);
for(let n=0;n<120 && blocked.state==='MANTLING';n++)blocked.update(1/120,input(),camera);
assert.equal(blocked.state,'FALLING');assert(blocked.position.y<10,'Dynamic ceiling was passed through');cases++;
const transfer=begin({colliders:[roof]});
const facade=new THREE.Mesh(new THREE.BoxGeometry(8,10,1));facade.position.set(0,13,-12);facade.updateMatrixWorld(true);
transfer.city.buildingMeshes=[facade];camera.position.set(0,10.7,0.7);camera.lookAt(0,13,-12);camera.updateMatrixWorld(true);
assert(transfer.startSwing(camera));assert.equal(transfer.state,'SWINGING');assert.equal(transfer.mantle,null);cases++;

// Rendered triangles, real capsule and actual slope normals, not an analytic
// mock. Preserve controller clearance while walking uphill and braking.
const world=new StreamedCollision();await world.initialized;
const floor=new THREE.Mesh(new THREE.BoxGeometry(50,1,50));floor.position.y=-0.5;world.enqueue(floor);
const ramp=new THREE.Mesh(new THREE.PlaneGeometry(6,12));ramp.rotation.x=-Math.PI/2-Math.atan(0.3);ramp.position.y=1.8;world.enqueue(ramp);
for(let n=0;n<6;n++) {
  const step=new THREE.Mesh(new THREE.BoxGeometry(3,(n+1)*0.2,0.65));step.position.set(8,(n+1)*0.1,1+n*0.65);world.enqueue(step);
}
for(let n=0;n<30;n++)world.update(new THREE.Vector3());
const sample=groundSample({collisionWorld:world},new THREE.Vector3(0,4,0),5);
assert(sample && Math.abs(sample.normal.z+0.3/Math.sqrt(1.09))<0.001);cases++;
const terrain={collisionWorld:world,colliders:[],buildingMeshes:[],checkCollision:()=>({collided:false}),
  resolveMovement:(a,b,v)=>{const result=world.resolve(a,b,v);terrain.lastResolution={start:a.toArray(),target:b.toArray(),actual:result.position.toArray(),contacts:result.contacts};return result;},
  supportHeight:p=>{const h=world.groundAt(p,0.5);return h!==null && Math.abs(p.y-h-0.1)<0.25?h:null;}};
for(const fps of [30,60,144])for(const mode of ['up','down','stairs']) {
  const p=player(terrain);p.position.set(mode==='stairs'?8:0,5,mode==='down'?3:-3);
  p.position.y=world.groundAt(p.position,8)+0.14;p.state='IDLE';
  const cam=new THREE.PerspectiveCamera();if(mode!=='down')cam.rotation.y=Math.PI;
  const i=input();i.forward=true;const before=p.position.clone();
  let highest=p.position.y;
  for(let n=0;n<fps*3.5;n++){p.update(1/fps,i,cam);highest=Math.max(highest,p.position.y);}
  const moved=Math.abs(p.position.z-before.z);
  if(moved<=4.6)console.log({mode,fps,moved,position:p.position.toArray(),velocity:p.velocity.toArray(),last:terrain.lastResolution});
  assert(moved>4.6,`${mode} ${fps}fps: terrain reduced travel to ${moved.toFixed(2)}m`);
  if(mode==='stairs')assert(highest>1.15,'Capsule failed to climb all actual stair risers before walking off the far end');
  else console.log('SLOPE-END',mode,fps,{state:p.state,velocity:p.velocity.toArray(),position:p.position.toArray(),recovery:p.recoveryElapsed,recoveryTime:p.recoveryTime});
  i.forward=false;for(let n=0;n<fps*2;n++)p.update(1/fps,i,cam);
  assert.equal(p.state,'IDLE');assert(Math.hypot(p.velocity.x,p.velocity.z)<0.02,'No-input slope drift');
  assert(Number.isFinite(p.character.terrainPelvis ?? 0));cases++;
}
world.dispose();
console.log(`PASS: ${cases} traversal and terrain cases: frame-independent mantle, headroom/footprint, jump/web cancellation, lost support, dynamic obstruction, real slope/stairs and no-input braking`);
