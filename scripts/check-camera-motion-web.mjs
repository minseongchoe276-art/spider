import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Character} from '../src/Character.js';
import {ThirdPersonCamera} from '../src/Camera.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {GameApp} from '../src/main.js';
import {createWebStrand} from '../src/WebStrand.js';

function actor(scene=new THREE.Scene()) {
  const c=Object.create(Character.prototype),primary=createWebStrand(scene),secondary=createWebStrand(scene);
  Object.assign(c,{group:new THREE.Group(),model:new THREE.Group(),actions:{},bones:{},activeAction:null,
    currentHand:'left',webShotTimer:0,webAttachments:[],webLaunchTimers:{},webHandWeights:{},webHandTargets:{},
    targetFacingAngle:0,idleTime:0,trickRotation:0,
    webLine:primary.line,webMesh:primary.mesh,webLineOffhand:secondary.line,webMeshOffhand:secondary.mesh});
  c.group.add(c.model);scene.add(c.group);c.mixer=new THREE.AnimationMixer(c.model);
  for(const name of ['idle','walk','jump','swing']) {
    c.actions[name]=c.mixer.clipAction(new THREE.AnimationClip(name,2,
      [new THREE.NumberKeyframeTrack('.position[x]',[0,2],[0,0])]));
  }
  return c;
}
function player(c,scene=new THREE.Scene()) {
  const p=new SwingPhysics(scene,{buildingMeshes:[],colliders:[],checkCollision:()=>({collided:false})},
    c,new Proxy({},{get:()=>()=>{}}));
  p.position.set(0,20,0);p.state='FALLING';p.launchAssistAvailable=false;
  return p;
}
const ringCenter=mesh=>{
  const center=new THREE.Vector3();
  for(let j=0;j<6;j++)center.add(new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,j));
  return center.divideScalar(6);
};

for(const fps of [30,60,144]) {
  const c=actor();c.fadeToAction('idle',0);c.mixer.update(1/fps);
  c.fadeToAction('walk',.18);c.mixer.update(1/fps);
  const weight=c.actions.walk.getEffectiveWeight();
  c.fadeToAction('jump',.12);c.mixer.update(0);
  assert(Math.abs(c.actions.walk.getEffectiveWeight()-weight)<1e-6,'Interrupted transition revived its outgoing pose');
  c.mixer.update(.2);assert(c.actions.walk.getEffectiveWeight()<1e-6);

  const scene=new THREE.Scene(),shot=actor(scene),p=player(shot,scene),camera=new THREE.PerspectiveCamera();
  let candidate=new THREE.Vector3(-10,40,10);p.findBestAnchor=()=>candidate;
  const held={webTap:true,webHold:true,webFireHeld:true};p.update(1/fps,held,camera);
  candidate=null;held.webTapRight=held.webHoldRight=held.webFireHeldRight=true;
  p.update(1/fps,held,camera);
  assert(shot.webShotIsMiss && shot.webShotTimer>0,'Physics erased the missed offhand shot');
  assert(shot.webMesh.visible && shot.webMeshOffhand.visible,'Attached and missed strands must both render');
  assert(shot.webHandWeights.left>0 && shot.webHandWeights.right>0,'Both firing and attached arms must reach');
  assert.equal(p.webs.length,1);
  for(let n=0;n<Math.ceil(.6*fps);n++)p.update(1/fps,held,camera);
  assert(!shot.webMesh.visible && shot.webMeshOffhand.visible,'Expired miss must disappear while the attached rope remains');
  p.webObstructed=()=>true;p.update(1/fps,held,camera);
  assert(!shot.webMesh.visible && !shot.webMeshOffhand.visible,'Severed attachment redrew a ghost strand');

  const takeoff=actor(),reaches=[];takeoff.reachWebAnchor=(_a,_w,hand)=>reaches.push(hand);
  takeoff.webAttachments=[{hand:'left',anchor:new THREE.Vector3(0,30,10)}];
  takeoff.persistentWebAnchor=takeoff.webAttachments[0].anchor;
  for(let n=0;n<fps;n++)takeoff.update(1/fps,'JUMPING',new THREE.Vector3(0,5,0),takeoff.persistentWebAnchor);
  assert(reaches.includes('left') && takeoff.webHandWeights.left>.9,'Takeoff dropped the attached hand after its shot timer expired');
  console.log(`PASS ${fps}fps: interrupted blend, real offhand miss lifetime, sever cleanup, takeoff reach`);
}

for(const fps of [24,60,144])for(const yaw of [0,1.4,-2.3]) {
  const camera=new THREE.PerspectiveCamera(),view=new ThirdPersonCamera(camera,{});
  const pos=new THREE.Vector3(20,30,40),velocity=new THREE.Vector3();
  view.yaw=yaw;view.pitch=-.3;view.lockBehind=false;
  for(let n=0;n<fps;n++)view.update(1/fps,pos,velocity,false,[],null,yaw+1);
  const before=camera.getWorldDirection(new THREE.Vector3());
  view.setMode('swing');view.update(1/fps,pos,velocity,false,[],null,yaw+1);
  assert(before.angleTo(camera.getWorldDirection(new THREE.Vector3()))<1e-6,'Changing follow distance lost the aimed facade');
  view.setMode('close');view.update(1/fps,pos,velocity,false,[],null,yaw+1);
  assert(before.angleTo(camera.getWorldDirection(new THREE.Vector3()))<1e-6,'Returning to close view swung the aim at the body');
  for(let n=0;n<fps;n++)view.update(1/fps,pos,velocity,false,[],null,yaw+1);
  assert.equal(view.yaw,yaw,'A mode change silently recentered behind a differently facing body');
  view.recenterBehind(yaw+1);
  for(let n=0;n<fps;n++)view.update(1/fps,pos,velocity,false,[],null,yaw+1);
  assert(Math.abs(view.yaw-yaw-1)<.01,'Explicit X recenter stopped working');
}
console.log('PASS 24/60/144fps view round trips preserve facade aim and X still recenters');
