import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SwingPhysics } from '../src/SwingPhysics.js';

const camera=new THREE.PerspectiveCamera();
const silent=new Proxy({}, {get:()=>()=>{}});
const input=()=>({strafe:0,webHold:false,webFireHeld:false,webTap:false,
  webHoldRight:false,webFireHeldRight:false,webTapRight:false});
function player() {
  const character={group:new THREE.Group(),update(){},
    fireWeb(anchor,hand){this.currentHand=hand;this.webShotAnchor=anchor.clone();
      this.webShotTimer=.38;this.persistentWebAnchor=anchor.clone();
      this.webAttachments=[...(this.webAttachments || []).filter(w=>w.hand!==hand),{hand,anchor:anchor.clone()}];}};
  const p=new SwingPhysics(new THREE.Scene(),{buildingMeshes:[],colliders:[],
    checkCollision:()=>({collided:false})},character,silent);
  p.position.set(0,20,0);p.findBestAnchor=()=>new THREE.Vector3(0,40,0);
  return p;
}
const press=(p,i,button)=>{
  if(button===0)i.webHold=i.webFireHeld=i.webTap=true;
  else i.webHoldRight=i.webFireHeldRight=i.webTapRight=true;
  p.update(1/120,i,camera);
};
let passed=0,failed=0;
function check(name,fn){try{fn();passed++;console.log('PASS PLAYER: '+name);}
  catch(e){failed++;console.error('FAIL PLAYER: '+name+': '+e.message);}}

for(const first of [0,2])check(`Button ${first}: releasing and reattaching keeps the held opposite strand`,()=>{
  const p=player(),i=input();press(p,i,first);press(p,i,first===0?2:0);
  assert.equal(p.webs.length,2);
  const retained=p.webs.find(w=>w.button!==first);
  if(first===0)i.webHold=i.webFireHeld=false;
  else i.webHoldRight=i.webFireHeldRight=false;
  p.releaseWebButton(first);p.update(1/120,i,camera);
  for(let n=0;n<8;n++) {
    press(p,i,first);
    assert.equal(p.webs.length,2,'Reattached hand stole the other button\'s strand');
    assert(p.webs.includes(retained),'Held anchor or length was replaced');
    assert.equal(new Set(p.webs.map(w=>w.hand)).size,2);
    assert.equal(p.webs.filter(w=>w.button===first).length,1);
    p.releaseWebButton(first);
  }
});
check('Refiring the right button never stacks two strands owned by that button',()=>{
  const p=player(),i=input();press(p,i,0);press(p,i,2);
  i.webHold=i.webFireHeld=false;p.releaseWebButton(0);
  press(p,i,2);assert.equal(p.webs.length,1);assert.equal(p.webs[0].button,2);
});
check('An obstructed freshly fired hand loses its shot visual while the other hand remains',()=>{
  const p=player(),i=input();press(p,i,0);press(p,i,2);
  const removed=p.character.currentHand;
  p.webObstructed=w=>w.hand===removed;
  p.updateSwingPhysics(1/120,i,camera);
  assert.equal(p.webs.length,1);assert(p.isSwinging);
  assert.equal(p.character.webShotTimer,0,'Severed strand remains drawn by the shot timer');
  assert.equal(p.character.webShotAnchor,null);
  assert(p.character.persistentWebAnchor.equals(p.webs[0].anchor));
});
check('Zip-to-swing transition retains inward momentum on a slackening strand',()=>{
  const p=player();p.zipAnchor=new THREE.Vector3(0,40,0);p.lastWebNormal=new THREE.Vector3(0,1,0);
  p.state='WEB_ZIP';p.velocity.set(3,8,0);
  const before=p.velocity.clone();assert(p.enterSwingFromPull(camera));
  assert(p.velocity.equals(before),'Transition discarded allowed inward momentum');
});
check('A reticle miss never falls back to a different reachable facade',()=>{
  const p=player();p.findBestAnchor=SwingPhysics.prototype.findBestAnchor;
  const hit=(y,z)=>({distance:z,point:new THREE.Vector3(0,y,z),
    face:{normal:new THREE.Vector3(0,0,-1)},object:new THREE.Mesh()});
  const blocked=hit(51,30),clear=hit(29,20);let rays=0;
  p.raycaster.intersectObjects=()=>++rays===1?[]:rays<=4?[blocked]:[clear];
  p.webObstructed=w=>w.anchor.y>40;
  assert.equal(p.findBestAnchor(camera),null,'A miss selected a facade away from the reticle');assert.equal(rays,1,'Targeting scanned for off-reticle alternatives');
});
check('A new obstacle across a live zip severs the tether before continuing the pull',()=>{
  const p=player();p.state='WEB_ZIP';p.zipTime=3;
  p.zipTarget=new THREE.Vector3(0,25,12);p.zipAnchor=new THREE.Vector3(0,27,12);
  p.lastWebNormal=new THREE.Vector3(0,0,-1);p.character.fireWeb(p.zipAnchor,'left');
  p.city.raycast=()=>({distance:2});
  p.update(1/120,input(),camera);
  assert.equal(p.state,'FALLING','Zip keeps pulling after its tether becomes obstructed');
  assert.equal(p.zipAnchor,null);assert.equal(p.character.persistentWebAnchor,null);
});
for(const fps of [30,60,144])check(`Mixed button presses, releases and misses at ${fps} FPS retain independent ownership`,()=>{
  const p=player(),i=input();let seed=812;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  let available=true;
  p.findBestAnchor=()=>available?new THREE.Vector3(0,40,0):null;
  for(let n=0;n<fps*20;n++) {
    available=random()>.2;
    const button=random()<.5?0:2,pressing=random()<.6;
    const opposite=p.webs.filter(w=>w.button!==button);
    if(button===0){i.webTap=pressing;i.webHold=i.webFireHeld=pressing;}
    else {i.webTapRight=pressing;i.webHoldRight=i.webFireHeldRight=pressing;}
    p.update(1/fps,i,camera);
    assert(p.webs.length<=2);assert.equal(new Set(p.webs.map(w=>w.hand)).size,p.webs.length);
    assert.equal(new Set(p.webs.map(w=>w.button)).size,p.webs.length);
    for(const web of opposite)assert(p.webs.includes(web),'Other button changed a held attachment');
    assert([...p.position,...p.velocity].every(Number.isFinite));
    for(const web of p.webs)assert(p.position.distanceTo(web.anchor)<=web.length+1e-5);
    assert(p.velocity.length()<=p.maxSpeed+1e-6);
  }
});
for(const button of [0,2])check(`Zip arrival retains the held button ${button} and releases with that button`,()=>{
  const p=player(),i=input();p.state='WEB_ZIP';p.zipTime=3;
  p.zipAnchor=new THREE.Vector3(0,40,0);p.zipTarget=p.position.clone();
  p.lastWebNormal=new THREE.Vector3(0,1,0);p.pullHand=button===0?'left':'right';
  if(button===0)i.webHold=i.webFireHeld=true;
  else i.webHoldRight=i.webFireHeldRight=true;
  p.updateFreePhysics(1/120,i,camera);
  assert(p.isSwinging,'Held offhand was dropped on zip arrival');
  assert.equal(p.webs.length,1);assert.equal(p.webs[0].button,button);
  p.releaseWebButton(button);assert.equal(p.webs.length,0);assert(!p.isSwinging);
});
console.log(`Player audit: ${passed} passed, ${failed} failed.`);
if(failed)process.exitCode=1;
