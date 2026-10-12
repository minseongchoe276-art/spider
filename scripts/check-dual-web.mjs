import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SwingPhysics } from '../src/SwingPhysics.js';
import { constrainWebs } from '../src/WebConstraints.js';
import { City } from '../src/City.js';

const silent=new Proxy({}, {get:()=>()=>{}});
const camera=new THREE.PerspectiveCamera();camera.rotation.y=Math.PI;
const input=()=>({forward:false,backward:false,left:false,right:false,strafe:0,webHold:true,webTap:false,webFireHeld:false});
const player=()=>{
  const shots=[];
  const character={group:new THREE.Group(),update(){},stopAnimation(){},
    fireWeb(anchor,hand){this.currentHand=hand;shots.push({anchor:anchor.clone(),hand});}};
  const city={buildingMeshes:[],colliders:[],checkCollision:()=>({collided:false}),
    getRooftopSpawn:()=>new THREE.Vector3(0,10,0)};
  const p=new SwingPhysics(new THREE.Scene(),city,character,silent);
  p.position.set(0,10,0);p.state='FALLING';p.launchAssistAvailable=false;
  p.findBestAnchor=()=>p.bestAnchorCandidate;
  p.shoot=point=>{p.bestAnchorCandidate=point?.clone()||null;p.bestAnchorNormal=new THREE.Vector3(0,1,0);return p.startSwing(camera);};
  p.shots=shots;return p;
};
let cases=0;
const check=(title,fn)=>{fn();cases++;console.log('PASS WEB: '+title);};
check('The first shot is the left hand and the second shot replaces that one rope',()=>{
  const p=player(),a=new THREE.Vector3(-5,20,2),b=new THREE.Vector3(5,20,2);
  assert(p.shoot(a));assert.equal(p.webs.length,1);assert.equal(p.shots[0].hand,'left');
  const pos=p.position.clone(),vel=p.velocity.clone();assert(p.shoot(b));
  assert.equal(p.webs.length,1);assert.equal(p.webs[0].hand,'right');assert(p.webs[0].anchor.equals(b));
  assert(!p.webs.some(w=>w.anchor.equals(a)),'The first anchor stayed on the body');
  assert(p.position.equals(pos),'Shot teleported the body');assert(p.velocity.equals(vel),'Second shot injected launch energy');
  assert.equal(p.character.webAttachments.length,1);
});
check('Repeated shots stay at one rope, and the same point does not stack',()=>{
  const p=player(),a=new THREE.Vector3(0,22,8);
  assert(p.shoot(a));assert.equal(p.webs.length,1);
  p.bestAnchorCandidate=a.clone();assert.equal(p.startSwing(camera,false),false);
  assert.equal(p.webs.length,1);assert(p.webs[0].anchor.equals(a));assert.equal(p.shots.length,1);
  let hand='right';
  for(let n=0;n<1000;n++) {
    assert(p.shoot(new THREE.Vector3((n%2? -1:1)*(6+n*0.001),21+n*0.001,3)));
    assert.equal(p.webs.length,1);assert.equal(p.webs[0].hand,hand);assert.equal(p.character.webAttachments.length,1);
    assert.equal(p.velocity.length(),0);
    hand=hand==='left'?'right':'left';
  }
});
check('A miss while the button is held keeps the one rope',()=>{
  const p=player();p.shoot(new THREE.Vector3(-5,20,2));
  const anchor=p.webs[0].anchor.clone();
  p.bestAnchorCandidate=null;const i=input();i.webTap=true;i.webFireHeld=true;
  p.update(1/60,i,camera);
  assert(p.isSwinging);assert.equal(p.webs.length,1);assert(p.webs[0].anchor.equals(anchor));assert.equal(i.webHold,true);
});
check('A missed click emits a visible shot without creating an anchor',()=>{
  const p=player(),misses=[];
  p.character.fireWebMiss=(target,hand)=>misses.push({target,hand});
  p.bestAnchorCandidate=null;
  const i=input();i.webTap=true;i.webHold=false;
  p.update(1/60,i,camera);
  assert.equal(misses.length,1);
  assert.equal(misses[0].hand,'left');
  assert(misses[0].target.toArray().every(Number.isFinite));
  assert(misses[0].target.y>p.position.y+1.3,'Missed web was aimed below the roof');
  assert.equal(p.webs.length,0);
  assert.equal(p.isSwinging,false);
  assert.equal(i.webHold,false);
});
let reference;
for(const fps of [30,60,144])check(`One length limit stays taut, finite and bounded at ${fps}fps`,()=>{
  const p=player();p.velocity.set(0,0,12);
  p.shoot(new THREE.Vector3(0,24,-6));
  let travel=0;const i=input();
  for(let n=0;n<fps*10;n++) {
    const before=p.position.clone();p.update(1/fps,i,camera);travel+=p.position.distanceTo(before);
    assert.equal(p.webs.length,1);assert(p.isSwinging);
    assert([...p.position,...p.velocity].every(Number.isFinite));assert(p.velocity.length()<=p.maxSpeed+1e-6);
    assert(p.position.distanceTo(p.webs[0].anchor)<=p.webs[0].length+0.002,'The rope stretched');
    assert(p.position.distanceTo(before)<=p.maxSpeed/fps+0.002,'The rope solve snapped the body');
  }
  assert(travel>1,'The single web froze all tangent movement');
  if(reference)assert(p.position.distanceTo(reference)<1e-7,'One-web trajectory depends on render FPS');
  reference=p.position.clone();
});
check('Slack webs never push outward and constraint impulses cannot add kinetic energy',()=>{
  const position=new THREE.Vector3(),velocity=new THREE.Vector3(1,2,3),before=velocity.clone();
  const webs=[{anchor:new THREE.Vector3(-4,10,0),length:20},{anchor:new THREE.Vector3(4,10,0),length:20}];
  constrainWebs(position,velocity,webs);assert(position.equals(new THREE.Vector3()));assert(velocity.equals(before));
  const p=player();p.shoot(new THREE.Vector3(0,30,0));
  p.velocity.set(0,8,0);const energy=p.velocity.lengthSq();constrainWebs(p.position,p.velocity,p.webs);
  assert(p.velocity.lengthSq()<=energy+1e-6);
  assert(p.velocity.dot(p.position.clone().sub(p.webs[0].anchor).normalize())<1e-5);
});
check('An obstructed rope releases instead of staying attached through a wall',()=>{
  const p=player();p.shoot(new THREE.Vector3(0,20,2));
  p.city.raycast=()=>({distance:1});
  p.updateSwingPhysics(1/120,input(),camera);
  assert.equal(p.isSwinging,false);assert.equal(p.state,'FALLING');assert.equal(p.webs.length,0);assert.equal(p.character.webAttachments.length,0);
  assert.equal(p.performWebPull(camera),false,'Blocked old anchor allowed a pull through the wall');
});
check('Right-click zips to the current anchor and arrives on one tether',()=>{
  const p=player();p.shoot(new THREE.Vector3(5,20,2));
  const latest=p.webs[0].anchor.clone();assert(p.performWebPull(camera));
  assert(p.zipAnchor.equals(latest));assert.equal(p.webs.length,0);assert.equal(p.pullHand,'left');
  p.position.copy(p.zipTarget);assert(p.enterSwingFromPull(camera));assert.equal(p.webs.length,1);
  assert.equal(p.webs[0].hand,'left');assert(p.webs[0].anchor.equals(latest));
});
check('Clear and respawn remove the rope and the hand-pose cache',()=>{
  const p=player();p.shoot(new THREE.Vector3(-5,20,2));
  p.clearWebAnchor();assert(!p.isSwinging);assert.equal(p.webs.length,0);assert.equal(p.character.webAttachments.length,0);
  p.shoot(new THREE.Vector3(-5,20,2));p.resetPosition();assert.equal(p.nextWebHand,'left');assert.equal(p.webs.length,0);assert.equal(p.character.webAttachments.length,0);
});
check('A shot during a reel replaces the pull with one new swing',()=>{
  const p=player();p.shoot(new THREE.Vector3(-5,20,2));
  const retained=p.webs[0].anchor.clone();assert(p.performWebPull(camera));
  p.velocity.set(0,0,9);const before=p.position.clone();const next=new THREE.Vector3(-8,24,3);
  assert(p.shoot(next));
  assert.equal(p.webs.length,1);assert(p.webs[0].anchor.equals(next));assert(!p.webs[0].anchor.equals(retained));
  assert.equal(p.webs[0].hand,'right');assert(p.position.equals(before));
  assert.equal(p.velocity.length(),9);assert.equal(p.state,'SWINGING');
});
check('Aimed facade shots end on the later point as one web',()=>{
  const p=player();p.findBestAnchor=SwingPhysics.prototype.findBestAnchor;
  p.position.set(0,3,0);p.city.checkCollision=City.prototype.checkCollision;p.city.raycast=City.prototype.raycast;
  p.city.buildingMeshes=[-4,4].map(x=>{const m=new THREE.Mesh(new THREE.BoxGeometry(1.5,8,1.5));m.position.set(x,6,4);m.updateMatrixWorld(true);return m;});
  const i=input();const cam=new THREE.PerspectiveCamera();
  for(let n=0;n<50;n++) {
    const old=n/120,t=(n+1)/120;cam.position.copy(p.position).add(new THREE.Vector3(0,1.3,0));cam.rotation.y=Math.PI;
    i.webTap=false;i.webFireHeld=false;
    for(const [time,x,y] of [[0.05,-4,7],[0.3,4,7]])if(old<time && t>=time) {cam.lookAt(x,y,4);cam.updateMatrixWorld(true);i.webTap=true;i.webFireHeld=true;}
    p.update(1/120,i,cam);
  }
  assert.equal(p.webs.length,1);assert.equal(p.state,'SWINGING');assert(p.webs[0].anchor.x>1,'The later aimed point did not replace the rope');
});
check('Letting go boosts a rising or fast swing, and W shortens only while held forward',()=>{
  const rising=player();rising.shoot(new THREE.Vector3(0,30,0));rising.velocity.set(0,5,0);
  rising.releaseSwing(true);assert(rising.velocity.y>5);assert.equal(rising.isSwinging,false);
  const fast=player();fast.isSwinging=true;fast.velocity.set(20,0,0);fast.releaseSwing(true);
  assert.equal(fast.velocity.x,20*1.18);assert.equal(fast.velocity.y,Math.min(14,4+20*0.3));
  const slow=player();slow.isSwinging=true;slow.velocity.set(10,0,0);slow.releaseSwing(true);
  assert.equal(slow.velocity.x,10);assert.equal(slow.velocity.y,0);
  const held=player();held.shoot(new THREE.Vector3(0,30,0));held.velocity.set(0,5,0);
  const release=input();release.webHold=false;held.update(1/60,release,camera);
  assert.equal(held.isSwinging,false);assert(held.velocity.y>5,'Button release skipped the slingshot');
  const pump=player();pump.position.set(0,10,0);pump.shoot(new THREE.Vector3(0,30,0));
  const pumping=input();pumping.forward=true;pump.updateSwingPhysics(1,pumping,camera);
  assert.equal(pump.webs[0].length,12);
  const low=player();low.position.set(0,2,0);low.shoot(new THREE.Vector3(0,22,0));
  const parked=low.webs[0].length;low.updateSwingPhysics(1,input(),camera);assert.equal(low.webs[0].length,parked);
});
console.log(`PASS: ${cases} one-rope web cases`);
