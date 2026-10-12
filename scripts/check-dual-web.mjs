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
check('The first shot is the left hand and the second keeps both anchors',()=>{
  const p=player(),a=new THREE.Vector3(-5,20,2),b=new THREE.Vector3(5,20,2);
  assert(p.shoot(a));assert.equal(p.webs.length,1);assert.equal(p.shots[0].hand,'left');
  const pos=p.position.clone(),vel=p.velocity.clone();assert(p.shoot(b));
  assert.deepEqual(p.webs.map(w=>w.hand),['left','right']);
  assert(p.webs[0].anchor.equals(a));assert(p.webs[1].anchor.equals(b));
  assert(p.position.equals(pos),'Shot teleported the body');assert(p.velocity.equals(vel),'Second shot injected launch energy');
  assert.equal(p.character.webAttachments.length,2);
});
check('A third shot replaces only the firing hand, and the same point does not stack',()=>{
  const p=player();p.shoot(new THREE.Vector3(-5,20,2));p.shoot(new THREE.Vector3(5,20,2));
  const right=p.webs[1];assert(p.shoot(new THREE.Vector3(-8,23,4)));assert.equal(p.webs[0],right);
  assert.equal(p.webs.at(-1).hand,'left');
  for(let n=0;n<1000;n++) {
    assert(p.shoot(new THREE.Vector3((n%2? -1:1)*(6+n*0.001),21+n*0.001,3)));
    assert.equal(p.webs.length,2);assert.equal(new Set(p.webs.map(w=>w.hand)).size,2);
    assert.equal(p.character.webAttachments.length,2);assert.equal(p.velocity.length(),0);
  }
  const same=player(),a=new THREE.Vector3(0,22,8);
  assert(same.shoot(a));assert(same.shoot(a));assert.equal(same.webs.length,2);
  same.bestAnchorCandidate=a.clone();assert.equal(same.startSwing(camera,false),false);
  assert(same.shoot(a));assert.equal(same.webs.length,2);assert.equal(same.shots.at(-1).hand,'left');
});
check('A miss while the button is held keeps both ropes',()=>{
  const p=player();p.shoot(new THREE.Vector3(-5,20,2));p.shoot(new THREE.Vector3(5,20,2));
  const anchors=p.webs.map(web=>web.anchor.clone());
  p.bestAnchorCandidate=null;const i=input();i.webTap=true;i.webFireHeld=true;
  p.update(1/60,i,camera);
  assert(p.isSwinging);assert.equal(p.webs.length,2);assert.equal(p.nextWebHand,'left');assert.equal(i.webHold,true);
  assert(p.webs[0].anchor.equals(anchors[0]));assert(p.webs[1].anchor.equals(anchors[1]));
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
for(const fps of [30,60,144])check(`Two length limits stay taut, finite and bounded at ${fps}fps`,()=>{
  const p=player();p.velocity.set(0,0,12);
  p.shoot(new THREE.Vector3(-5,20,2));p.shoot(new THREE.Vector3(5,20,2));
  let travel=0;const i=input();
  for(let n=0;n<fps*10;n++) {
    const before=p.position.clone();p.update(1/fps,i,camera);travel+=p.position.distanceTo(before);
    assert.equal(p.webs.length,2);assert(p.isSwinging);
    assert([...p.position,...p.velocity].every(Number.isFinite));assert(p.velocity.length()<=p.maxSpeed+1e-6);
    for(const web of p.webs)assert(p.position.distanceTo(web.anchor)<=web.length+0.002,'A retained strand stretched');
    assert(p.position.distanceTo(before)<=p.maxSpeed/fps+0.002,'The rope solve snapped the body');
  }
  assert(travel>1,'The two webs froze all tangent movement');
  if(reference)assert(p.position.distanceTo(reference)<1e-7,'Two-web trajectory depends on render FPS');
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
check('One obstructed strand releases only that hand',()=>{
  const p=player();p.shoot(new THREE.Vector3(-5,20,2));p.shoot(new THREE.Vector3(5,20,2));
  p.city.raycast=(origin,direction)=>direction.x<0?{distance:1}:null;
  p.updateSwingPhysics(1/120,input(),camera);
  assert(p.isSwinging);assert.equal(p.webs.length,1);assert.equal(p.webs[0].hand,'right');assert.equal(p.character.webAttachments.length,1);
  p.city.raycast=()=>({distance:1});p.updateSwingPhysics(1/120,input(),camera);
  assert.equal(p.isSwinging,false);assert.equal(p.state,'FALLING');assert.equal(p.webs.length,0);assert.equal(p.character.webAttachments.length,0);
  assert.equal(p.performWebPull(camera),false,'Blocked old anchor allowed a pull through the wall');
});
check('Right-click zips to the latest anchor and arrives on that tether',()=>{
  const p=player();p.shoot(new THREE.Vector3(-5,20,2));p.shoot(new THREE.Vector3(5,20,2));
  const latest=p.webs.at(-1).anchor.clone();assert(p.performWebPull(camera));
  assert(p.zipAnchor.equals(latest));assert.equal(p.webs.length,0);assert.equal(p.pullHand,'right');
  p.position.copy(p.zipTarget);assert(p.enterSwingFromPull(camera));assert.equal(p.webs.length,1);
  assert.equal(p.webs[0].hand,'right');assert(p.webs[0].anchor.equals(latest));
});
check('Clear and respawn remove both ropes and the hand-pose cache',()=>{
  const p=player();p.shoot(new THREE.Vector3(-5,20,2));p.shoot(new THREE.Vector3(5,20,2));
  p.clearWebAnchor();assert(!p.isSwinging);assert.equal(p.webs.length,0);assert.equal(p.character.webAttachments.length,0);
  p.shoot(new THREE.Vector3(-5,20,2));p.resetPosition();assert.equal(p.nextWebHand,'left');assert.equal(p.webs.length,0);assert.equal(p.character.webAttachments.length,0);
});
check('A shot during a reel keeps the pulling strand and adds the other hand',()=>{
  const p=player();p.shoot(new THREE.Vector3(-5,20,2));p.shoot(new THREE.Vector3(5,20,2));
  const retained=p.webs.at(-1).anchor.clone();assert(p.performWebPull(camera));
  p.velocity.set(0,0,9);const before=p.position.clone();const next=new THREE.Vector3(-8,24,3);
  assert(p.shoot(next));
  assert.equal(p.webs.length,2);assert(p.webs[0].anchor.equals(retained));
  assert.deepEqual(p.webs.map(w=>w.hand),['right','left']);assert(p.position.equals(before));
  assert.equal(p.velocity.length(),9);assert.equal(p.state,'SWINGING');
});
check('Aimed facade shots keep a left web and a right web',()=>{
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
  assert.equal(p.webs.length,2);assert.equal(p.state,'SWINGING');
  assert(p.webs.some(web=>web.anchor.x<-1)&&p.webs.some(web=>web.anchor.x>1),'Both aimed facades were not retained');
});
check('Explicit jump boosts, mouse release preserves momentum, and W keeps rope length fixed',()=>{
  const rising=player();rising.shoot(new THREE.Vector3(0,30,0));rising.velocity.set(0,5,0);
  rising.releaseSwing(true);assert(rising.velocity.y>5);assert.equal(rising.isSwinging,false);
  const fast=player();fast.isSwinging=true;fast.velocity.set(20,0,0);fast.releaseSwing(true);
  assert.equal(fast.velocity.x,20*1.18);assert.equal(fast.velocity.y,Math.min(14,4+20*0.3));
  const slow=player();slow.isSwinging=true;slow.velocity.set(10,0,0);slow.releaseSwing(true);
  assert.equal(slow.velocity.x,10);assert.equal(slow.velocity.y,0);
  const held=player();held.shoot(new THREE.Vector3(0,30,0));held.velocity.set(0,5,0);
  const release=input();release.webHold=false;held.update(1/60,release,camera);
  assert.equal(held.isSwinging,false);assert(Math.abs(held.velocity.y-(5-held.gravity/60))<1e-6,'Mouse release injected a slingshot impulse');
  const pump=player();pump.position.set(0,10,0);pump.shoot(new THREE.Vector3(0,30,0));
  const pumping=input();pumping.forward=true;pump.updateSwingPhysics(1,pumping,camera);
  assert.equal(pump.webs[0].length,20);
  const low=player();low.position.set(0,2,0);low.shoot(new THREE.Vector3(0,22,0));
  const parked=low.webs[0].length;low.updateSwingPhysics(1,input(),camera);assert.equal(low.webs[0].length,parked);
});
console.log(`PASS: ${cases} two-hand web cases`);
