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

function bare() {
  const shots=[];
  const character={group:new THREE.Group(),update(){},stopAnimation(){},fireWeb(anchor,hand){this.currentHand=hand;shots.push(hand);}};
  const city={buildingMeshes:[],colliders:[],checkCollision:()=>({collided:false}),getRooftopSpawn:()=>new THREE.Vector3(0,10,0)};
  const body=new SwingPhysics(new THREE.Scene(),city,character,silent);
  body.position.set(-12,44,0);body.velocity.set(0,0,0);
  body.findBestAnchor=()=>new THREE.Vector3(0,60,0);
  body.shots=shots;
  return body;
}
const heldInput=side=>{
  const value={forward:false,backward:false,left:false,right:false,strafe:0,jump:false,
    webTap:false,webFireHeld:false,webHold:false,webTapRight:false,webFireHeldRight:false,webHoldRight:false};
  if(side==='left')value.webTap=value.webFireHeld=value.webHold=true;
  else value.webTapRight=value.webFireHeldRight=value.webHoldRight=true;
  return value;
};
const ride=side=>{
  const body=bare(),held=heldInput(side);
  body.update(1/60,held,camera);
  held.webTap=held.webTapRight=false;
  for(let n=0;n<240;n++)body.update(1/60,held,camera);
  return body;
};
const leftRide=ride('left'),rightRide=ride('right');
assert.equal(leftRide.webs.length,1);assert.equal(leftRide.webs[0].hand,'left');assert.equal(leftRide.shots.length,1);
assert.equal(rightRide.webs.length,1);assert.equal(rightRide.webs[0].hand,'right');assert.equal(rightRide.shots.length,1);
assert.equal(rightRide.nextWebHand,'left','Right click advanced the left-click hand');
assert(leftRide.anchorPoint.equals(rightRide.anchorPoint));
assert.equal(leftRide.ropeLength,rightRide.ropeLength);
assert(leftRide.position.distanceTo(rightRide.position)<1e-6,'Right-click pendulum diverged from the left-click pendulum');
assert(leftRide.velocity.distanceTo(rightRide.velocity)<1e-6,'Right-click pendulum velocity diverged');
console.log('PASS PENDULUM: right click matches the left-click Viking swing from the opposite hand');

const paired=bare();
paired.findBestAnchor=()=>paired.webs.length?new THREE.Vector3(5,30,2):new THREE.Vector3(-5,30,2);
paired.position.set(0,10,0);
const both=heldInput('left');
paired.update(1/60,both,camera);
assert.equal(paired.webs[0].hand,'left');assert.equal(paired.nextWebHand,'right');
both.webTap=false;both.webTapRight=both.webFireHeldRight=both.webHoldRight=true;
paired.update(1/60,both,camera);
assert.deepEqual(paired.webs.map(web=>web.hand),['left','right']);
assert.deepEqual(paired.webs.map(web=>web.button),[0,2]);
assert.equal(paired.nextWebHand,'right');
assert(paired.webs[0].anchor.x<0&&paired.webs[1].anchor.x>0);
const boosts=[];
const originalRelease=paired.releaseSwing.bind(paired);
paired.releaseSwing=flag=>{boosts.push(flag);return originalRelease(flag);};
const kept=paired.webs[1].length;
both.webHold=both.webFireHeld=false;both.webTapRight=false;
paired.update(1/60,both,camera);
assert.equal(paired.webs.length,1);assert.equal(paired.webs[0].hand,'right');assert.equal(paired.webs[0].length,kept);
assert(paired.isSwinging);assert.equal(boosts.length,0,'Releasing the left hand boosted or dropped the right rope');
both.webHoldRight=both.webFireHeldRight=false;
paired.update(1/60,both,camera);
assert.equal(paired.isSwinging,false);assert.deepEqual(boosts,[false],'Letting go of the last rope added a slingshot');
console.log('PASS PENDULUM: releasing one hand keeps the opposite rope without a slingshot');

const swapped=bare();
const first=heldInput('left');
swapped.update(1/60,first,camera);
first.webTap=first.webHold=first.webFireHeld=false;
swapped.update(1/60,first,camera);
assert.equal(swapped.isSwinging,false);assert.equal(swapped.nextWebHand,'right');
const other=heldInput('right');
swapped.update(1/60,other,camera);
assert.equal(swapped.webs.length,1);assert.equal(swapped.webs[0].hand,'left','Right click repeated the hand left click would use');
assert.equal(swapped.nextWebHand,'right');
console.log('PASS PENDULUM: right click follows the opposite of the next left-click hand');

const locked=bare();
locked.webEnabled=false;locked.state='IDLE';locked.position.set(0,0.1,0);
const denied=heldInput('right');
locked.update(1/60,denied,camera);
assert.equal(locked.isSwinging,false);assert.equal(denied.webTapRight,false);
locked.state='FALLING';locked.position.set(0,6,0);
denied.webTapRight=denied.webFireHeldRight=denied.webHoldRight=true;
locked.update(1/60,denied,camera);
assert.equal(locked.isSwinging,false);assert.equal(locked.webs.length,0);
locked.webEnabled=true;denied.webTapRight=denied.webFireHeldRight=denied.webHoldRight=true;locked.update(1/60,denied,camera);assert.equal(locked.isSwinging,true);assert.equal(locked.webs[0].hand,'right');
console.log('PASS PENDULUM: human mode blocks ground and air webs; transformation restores the opposite-hand web');
