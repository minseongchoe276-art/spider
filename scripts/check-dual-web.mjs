import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SwingPhysics } from '../src/SwingPhysics.js';
import { constrainWebs } from '../src/WebConstraints.js';
import { City } from '../src/City.js';

const silent=new Proxy({}, {get:()=>()=>{}});
const camera=new THREE.PerspectiveCamera();camera.rotation.y=Math.PI;
const input=()=>({forward:false,backward:false,left:false,right:false,strafe:0,webHold:true});
const player=()=>{
  const shots=[];
  const character={group:new THREE.Group(),update(){},stopAnimation(){},
    fireWeb(anchor,hand){this.currentHand=hand;shots.push({anchor:anchor.clone(),hand});}};
  const city={buildingMeshes:[],colliders:[],checkCollision:()=>({collided:false}),
    getRooftopSpawn:()=>new THREE.Vector3(0,10,0)};
  const p=new SwingPhysics(new THREE.Scene(),city,character,silent);
  p.position.set(0,10,0);p.state='FALLING';p.launchAssistAvailable=false;
  p.findBestAnchor=()=>p.bestAnchorCandidate;
  p.shoot=point=>{p.bestAnchorCandidate=point?.clone();p.bestAnchorNormal=new THREE.Vector3(0,1,0);return p.startSwing(camera);};
  p.shots=shots;return p;
};
let cases=0;
const check=(title,fn)=>{fn();cases++;console.log('PASS DUAL WEB: '+title);};
check('First click uses left; second uses right with both real anchors retained',()=>{
  const p=player(),a=new THREE.Vector3(-5,20,2),b=new THREE.Vector3(5,20,2);
  assert(p.shoot(a));assert.equal(p.webs.length,1);assert.equal(p.shots[0].hand,'left');
  const pos=p.position.clone(),vel=p.velocity.clone();assert(p.shoot(b));
  assert.deepEqual(p.webs.map(w=>w.hand),['left','right']);assert(p.webs[0].anchor.equals(a));assert(p.webs[1].anchor.equals(b));
  assert(p.position.equals(pos),'Shot teleported the body');assert(p.velocity.equals(vel),'Second shot injected launch energy');
  assert.equal(p.character.webAttachments.length,2);
});
check('Third shot replaces only left; repeated firing keeps just two hand slots',()=>{
  const p=player();p.shoot(new THREE.Vector3(-5,20,2));p.shoot(new THREE.Vector3(5,20,2));
  const right=p.webs[1];assert(p.shoot(new THREE.Vector3(-8,23,4)));assert.equal(p.webs[0],right);
  assert.equal(p.webs.at(-1).hand,'left');
  for(let n=0;n<1000;n++) {
    assert(p.shoot(new THREE.Vector3((n%2? -1:1)*(6+n*0.001),21+n*0.001,3)));
    assert.equal(p.webs.length,2);assert.equal(new Set(p.webs.map(w=>w.hand)).size,2);
    assert.equal(p.character.webAttachments.length,2);assert.equal(p.velocity.length(),0);
  }
});
check('Both hands may attach to one point, without duplicating the first click',()=>{
  const p=player(),a=new THREE.Vector3(0,22,8);assert(p.shoot(a));assert.equal(p.webs.length,1);
  assert(p.shoot(a));assert.equal(p.webs.length,2);assert.equal(p.startSwing(camera,false),false);
  assert(p.shoot(a));assert.equal(p.webs.length,2);assert.equal(p.shots.at(-1).hand,'left');
});
check('A missed shot preserves both held webs and the alternating hand',()=>{
  const p=player();p.shoot(new THREE.Vector3(-5,20,2));p.shoot(new THREE.Vector3(5,20,2));
  p.bestAnchorCandidate=null;const i=input();i.webHold=false;i.webTap=true;
  p.update(1/60,i,camera);assert(p.isSwinging);assert(i.webHold);assert.equal(p.nextWebHand,'left');assert.equal(p.webs.length,2);
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
});
let reference;
for(const fps of [30,60,144])check(`Two real length limits stay taut, finite and bounded at ${fps}fps without an expiry timer`,()=>{
  const p=player();p.velocity.set(0,0,12);
  p.shoot(new THREE.Vector3(-5,20,2));p.shoot(new THREE.Vector3(5,20,2));
  let travel=0;const i=input();
  for(let n=0;n<fps*10;n++) {
    const before=p.position.clone();p.update(1/fps,i,camera);travel+=p.position.distanceTo(before);
    assert.equal(p.webs.length,2);assert(p.isSwinging);
    assert([...p.position,...p.velocity].every(Number.isFinite));assert(p.velocity.length()<=p.maxSpeed+1e-6);
    for(const web of p.webs)assert(p.position.distanceTo(web.anchor)<=web.length+0.002,'A retained strand stretched');
    assert(p.position.distanceTo(before)<=p.maxSpeed/fps+0.002,'Two-web solve snapped the body');
  }
  assert(travel>1,'Double web froze all tangent movement');
  if(reference)assert(p.position.distanceTo(reference)<1e-7,'Double-web trajectory depends on render FPS');
  reference=p.position.clone();
});
check('Slack webs never push outward and constraint impulses cannot add kinetic energy',()=>{
  const position=new THREE.Vector3(),velocity=new THREE.Vector3(1,2,3),before=velocity.clone();
  const webs=[{anchor:new THREE.Vector3(-4,10,0),length:20},{anchor:new THREE.Vector3(4,10,0),length:20}];
  constrainWebs(position,velocity,webs);assert(position.equals(new THREE.Vector3()));assert(velocity.equals(before));
  const p=player();p.shoot(new THREE.Vector3(-5,20,2));p.shoot(new THREE.Vector3(5,20,2));
  p.velocity.set(8,-20,12);const energy=p.velocity.lengthSq();constrainWebs(p.position,p.velocity,p.webs);
  assert(p.velocity.lengthSq()<=energy+1e-6);
  for(const w of p.webs)assert(p.velocity.dot(p.position.clone().sub(w.anchor).normalize())<1e-5);
});
check('One obstructed strand releases only that hand; both blocked strands detach safely',()=>{
  const p=player();p.shoot(new THREE.Vector3(-5,20,2));p.shoot(new THREE.Vector3(5,20,2));
  p.city.raycast=(origin,direction)=>direction.x<0?{distance:1}:null;
  p.updateSwingPhysics(1/120,input(),camera);
  assert(p.isSwinging);assert.equal(p.webs.length,1);assert.equal(p.webs[0].hand,'right');assert.equal(p.character.webAttachments.length,1);
  p.city.raycast=()=>({distance:1});p.updateSwingPhysics(1/120,input(),camera);
  assert.equal(p.isSwinging,false);assert.equal(p.state,'FALLING');assert.equal(p.webs.length,0);assert.equal(p.character.webAttachments.length,0);
  assert.equal(p.performWebPull(camera),false,'Blocked old anchor allowed a pull through the wall');
});
check('Right-click reels the latest anchor, frees the offhand and returns to one tether',()=>{
  const p=player();p.shoot(new THREE.Vector3(-5,20,2));p.shoot(new THREE.Vector3(5,20,2));
  const latest=p.webs.at(-1).anchor.clone();assert(p.performWebPull(camera));
  assert(p.zipAnchor.equals(latest));assert.equal(p.webs.length,0);assert.equal(p.pullHand,'right');
  p.position.copy(p.zipTarget);assert(p.enterSwingFromPull(camera));assert.equal(p.webs.length,1);
  assert.equal(p.webs[0].hand,'right');assert(p.webs[0].anchor.equals(latest));
});
check('Space-style clear and respawn remove both anchors and hand-pose caches',()=>{
  const p=player();p.shoot(new THREE.Vector3(-5,20,2));p.shoot(new THREE.Vector3(5,20,2));
  p.clearWebAnchor();assert(!p.isSwinging);assert.equal(p.webs.length,0);assert.equal(p.character.webAttachments.length,0);
  p.shoot(new THREE.Vector3(-5,20,2));p.resetPosition();assert.equal(p.nextWebHand,'left');assert.equal(p.webs.length,0);assert.equal(p.character.webAttachments.length,0);
});
check('A new opposite-hand shot during a reel keeps the pulling strand too',()=>{
  const p=player();p.shoot(new THREE.Vector3(-5,20,2));p.shoot(new THREE.Vector3(5,20,2));
  const retained=p.webs.at(-1).anchor.clone();assert(p.performWebPull(camera));
  p.velocity.set(0,0,9);const before=p.position.clone();assert(p.shoot(new THREE.Vector3(-8,24,3)));
  assert.equal(p.webs.length,2);assert(p.webs[0].anchor.equals(retained));
  assert.deepEqual(p.webs.map(w=>w.hand),['right','left']);assert(p.position.equals(before));
  assert.equal(p.velocity.length(),9);assert.equal(p.state,'SWINGING');
});
check('Actual aimed facade hits can retain a left and a right web',()=>{
  const p=player();p.findBestAnchor=SwingPhysics.prototype.findBestAnchor;
  p.position.set(0,3,0);p.city.checkCollision=City.prototype.checkCollision;p.city.raycast=City.prototype.raycast;
  p.city.buildingMeshes=[-4,4].map(x=>{const m=new THREE.Mesh(new THREE.BoxGeometry(1.5,8,1.5));m.position.set(x,6,4);m.updateMatrixWorld(true);return m;});
  const i=input();i.webHold=false;const cam=new THREE.PerspectiveCamera();
  for(let n=0;n<180;n++) {
    const old=n/120,t=(n+1)/120;cam.position.copy(p.position).add(new THREE.Vector3(0,1.3,0));cam.rotation.y=Math.PI;
    for(const [time,x,y] of [[0.05,-4,7],[0.3,4,7]])if(old<time && t>=time) {cam.lookAt(x,y,4);cam.updateMatrixWorld(true);i.webTap=true;}
    p.update(1/120,i,cam);
  }
  assert.equal(p.webs.length,2);assert.equal(p.state,'SWINGING');
});
console.log(`PASS: ${cases} independent-hand web cases`);
