import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SwingPhysics } from '../src/SwingPhysics.js';

const camera=new THREE.PerspectiveCamera();
const silent=new Proxy({}, {get:()=>()=>{}});
const input=()=>({webTap:false,webFireHeld:true,webHold:true,strafe:0});
function player() {
  const shots=[];
  const character={group:new THREE.Group(),update(){},fireWeb(anchor){shots.push(anchor.clone());}};
  const city={buildingMeshes:[],colliders:[],checkCollision:()=>({collided:false})};
  const p=new SwingPhysics(new THREE.Scene(),city,character,silent);
  p.position.set(-12,44,0);p.velocity.set(0,0,0);
  p.findBestAnchor=()=>new THREE.Vector3(0,60,0);
  p.startSwing(camera);
  assert.equal(p.velocity.length(),0,'Attaching injected energy');
  return {p,shots};
}
let reference;
for(const fps of [30,60,144]) {
  const {p,shots}=player(),held=input(),anchor=p.anchorPoint.clone(),length=p.ropeLength;
  const energy=()=>0.5*p.velocity.lengthSq()+p.gravity*(p.position.y-40);
  const initialEnergy=energy();let minHeight=p.position.y,maxX=p.position.x,reversed=false;
  // Camera aim changes while held must not move the pendulum's pivot.
  p.findBestAnchor=()=>new THREE.Vector3(25,70,20);
  for(let n=0;n<fps*8;n++) {
    p.update(1/fps,held,camera);
    assert(p.isSwinging);assert.equal(p.webs.length,1);assert.equal(shots.length,1);
    assert(p.anchorPoint.equals(anchor));assert.equal(p.ropeLength,length);
    assert(p.position.distanceTo(anchor)<=length+1e-6);
    assert(energy()<=initialEnergy+0.1,'Unpowered swing generated energy');
    minHeight=Math.min(minHeight,p.position.y);maxX=Math.max(maxX,p.position.x);
    if(p.position.x>5 && p.velocity.x<0)reversed=true;
  }
  assert(minHeight<40.2,'Pendulum did not descend below the pivot');
  assert(maxX>8,'Pendulum did not rise on the opposite side');
  assert(reversed,'Pendulum did not swing back like a Viking ride');
  if(reference)assert(p.position.distanceTo(reference)<1e-7,'Swing depends on display FPS');
  reference=p.position.clone();
  const velocity=p.velocity.clone();p.releaseSwing(false);
  assert(p.velocity.equals(velocity),'Mouse release changed momentum');
  const released=input();released.webHold=false;released.webFireHeld=false;
  p.update(1/60,released,camera);
  assert(!p.isSwinging);assert.equal(p.webs.length,0);
  assert(Math.abs(p.velocity.y-(velocity.y-p.gravity/60))<1e-6,'Released motion did not follow gravity');
  console.log(`PASS PENDULUM: fixed pivot, constant length, natural reversal and release at ${fps}fps`);
}
const {p}=player();const held=input();held.forward=true;
for(let n=0;n<240;n++)p.update(1/120,held,camera);
assert.equal(p.ropeLength,20,'W reeled the rope toward the anchor');
console.log('PASS PENDULUM: W applies tangent steering without shortening the rope');
