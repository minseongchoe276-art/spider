import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SwingPhysics } from '../src/SwingPhysics.js';
import { GameApp } from '../src/main.js';
import { ThirdPersonCamera } from '../src/Camera.js';
import { CombatSystem } from '../src/Combat.js';

const silent=new Proxy({}, {get:()=>()=>{}});
const camera=new THREE.PerspectiveCamera(60,1,0.1,500);
camera.position.set(0,12,0);camera.lookAt(0,12,20);camera.updateMatrixWorld(true);
const input=()=>({forward:false,backward:false,left:false,right:false,strafe:0,
  webHold:false,webFireHeld:false,webTap:false,jump:false});
function player() {
  const character={group:new THREE.Group(),update(){},stopAnimation(){},
    fireWeb(anchor,hand){this.currentHand=hand;this.persistentWebAnchor=anchor.clone();
      this.webAttachments=[{hand,anchor:anchor.clone()}];this.webShotAnchor=anchor.clone();this.webShotTimer=0.38;}};
  const city={buildingMeshes:[],colliders:[],checkCollision:()=>({collided:false}),
    getRooftopSpawn:()=>new THREE.Vector3(0,40,0)};
  const p=new SwingPhysics(new THREE.Scene(),city,character,silent);
  p.position.set(0,12,0);p.state='FALLING';return p;
}
function zip() {
  const p=player();p.zipTarget=new THREE.Vector3(0,12,10);p.zipAnchor=new THREE.Vector3(0,14,10);
  p.lastWebAnchor=p.zipAnchor.clone();p.lastWebNormal=new THREE.Vector3(0,1,0);
  p.state='WEB_ZIP';p.zipTime=3;p.character.fireWeb(p.zipAnchor,'left');return p;
}
function withInput(p,run) {
  const oldWindow=globalThis.window,oldDocument=globalThis.document;
  globalThis.window=new EventTarget();globalThis.document=new EventTarget();
  const canvas=new EventTarget();canvas.getBoundingClientRect=()=>({left:0,top:0,width:800,height:600});
  const app=Object.create(GameApp.prototype);
  Object.assign(app,{canvas,physics:p,camera,isPlaying:true,isPaused:false,input:input(),heldKeys:new Set(),
    audio:silent,combat:{mode:'web'},tpsCamera:{handleMouseMove(){}}});
  app.initInputListeners();
  const key=code=>{const e=new Event('keydown',{cancelable:true});Object.defineProperty(e,'code',{value:code});window.dispatchEvent(e);};
  try{run(app,key);}finally{globalThis.window=oldWindow;globalThis.document=oldDocument;}
}
let passed=0,failed=0;
function check(name,run){try{run();passed++;console.log('PASS MECHANICS: '+name);}
  catch(error){failed++;console.error('FAIL MECHANICS: '+name+': '+error.message);}}

check('A miss clears the old target marker and surface metadata',()=>{
  const p=player(),mesh=new THREE.Mesh(new THREE.BoxGeometry(8,20,2));
  mesh.position.set(0,12,20);mesh.updateMatrixWorld(true);p.city.buildingMeshes=[mesh];
  assert(p.findBestAnchor(camera));p.city.buildingMeshes=[];
  assert.equal(p.findBestAnchor(camera),null);assert.equal(p.bestAnchorCandidate,null);
  assert.equal(p.bestAnchorNormal,null);assert.equal(p.bestAnchorObject,null);
});
check('Web reach is measured from the player rather than the camera',()=>{
  const p=player(),mesh=new THREE.Mesh(new THREE.BoxGeometry(8,20,2));
  mesh.position.set(0,12,145);mesh.updateMatrixWorld(true);p.city.buildingMeshes=[mesh];
  const remoteCamera=camera.clone();remoteCamera.position.z=25;remoteCamera.updateMatrixWorld(true);
  assert.equal(p.findBestAnchor(remoteCamera),null,'A camera inside range enabled a 144m rope');
});
check('Historical attachment cannot grant repeated Space jumps in the air',()=>{
  const p=player();p.lastWebAnchor=new THREE.Vector3(0,40,10);p.velocity.set(8,-5,0);
  withInput(p,(app,key)=>{key('Space');assert.equal(p.velocity.y,-5);assert.equal(p.state,'FALLING');
    p.update(1/120,app.input,camera);assert(p.velocity.y< -5);});
});
check('Jumping off a live web consumes the jump and the old attachment cannot jump again',()=>{
  const p=player();p.findBestAnchor=()=>new THREE.Vector3(0,32,0);p.startSwing(camera);
  withInput(p,(app,key)=>{const velocity=p.velocity.clone();key('Space');assert(!p.isSwinging);assert(p.velocity.equals(velocity));
    p.velocity.y=-2;key('Space');assert.equal(p.velocity.y,-2);});
});
check('Zip arrival without left mouse held releases immediately without generated tangent speed',()=>{
  const p=zip();p.position.copy(p.zipTarget);p.velocity.set(0,0,4);
  p.update(1/120,input(),camera);assert(!p.isSwinging);assert.notEqual(p.state,'SWINGING');
  assert.equal(p.character.persistentWebAnchor,null);assert.equal(p.zipAnchor,null);
  assert(p.velocity.length()<4.1,'Arrival generated a sideways boost');
});
check('Zip arrival with left mouse held keeps exactly one original tether',()=>{
  const p=zip(),anchor=p.zipAnchor.clone();p.position.copy(p.zipTarget);
  const i=input();i.webHold=i.webFireHeld=true;
  p.update(1/120,i,camera);assert(p.isSwinging);assert.equal(p.webs.length,1);
  assert(p.anchorPoint.equals(anchor));assert.equal(p.velocity.length(),0);
});
check('Zip timeout clears its visible strand and cannot grant a later air jump',()=>{
  const p=zip();p.zipTime=0;p.update(1/120,input(),camera);
  assert.equal(p.state,'FALLING');assert.equal(p.zipAnchor,null);
  assert.equal(p.character.persistentWebAnchor,null);assert.equal(p.character.webAttachments.length,0);
});
check('A wall interrupting a zip removes the persistent web in that physics step',()=>{
  const p=zip();p.city.colliders=[{minX:-5,maxX:5,minY:0,maxY:25,minZ:3,maxZ:3.05}];
  for(let n=0;n<120 && p.state==='WEB_ZIP';n++)p.update(1/120,input(),camera);
  assert.equal(p.state,'FALLING');assert(p.position.z<2.31);
  assert.equal(p.zipAnchor,null);assert.equal(p.character.persistentWebAnchor,null);
});
check('Grounded E does not replace a jump with a zip',()=>{
  const p=player();p.state='IDLE';p.position.y=0.1;
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(8,20,2));mesh.position.set(0,10,20);mesh.updateMatrixWorld(true);
  p.city.buildingMeshes=[mesh];assert.equal(p.performAirJump(camera),false);assert(p.canAirJump);
  assert.equal(p.state,'IDLE');assert.equal(p.velocity.length(),0);
});
check('Mouse movement keeps the aim at the fixed center and E uses that aim',()=>{
  const p=player();p.webAimNdc.set(0.6,0.2);let actual;
  p.performAirJump=(_camera,aim)=>{actual=aim?.clone();return false;};
  withInput(p,(_app,key)=>{
    const e=new Event('mousemove');Object.defineProperties(e,{clientX:{value:750},clientY:{value:80}});
    window.dispatchEvent(e);key('KeyE');
  });assert(actual?.equals(new THREE.Vector2()));
});
check('Jumping during a grounded attack cancels it before landing',()=>{
  const p=player();p.state='IDLE';const c=new CombatSystem(new THREE.Scene(),p,p.character);
  assert(c.heavy(camera));p.state='JUMPING';c.before(1/60,camera);
  assert.equal(c.action,null);assert.equal(p.combatMotion,null);assert.equal(p.character.combatAction,null);
});
check('First-person camera stays at the head during fast travel and view changes',()=>{
  const view=new THREE.PerspectiveCamera(),follow=new ThirdPersonCamera(view,{});
  follow.currentPos.set(0,2,-8);follow.mode='first';
  const root=new THREE.Vector3(35,40,20);follow.update(1/144,root,new THREE.Vector3(30,0,0),true);
  assert(view.position.distanceTo(root.clone().add(new THREE.Vector3(0,1.58,0)))<1e-6,
    'First-person view trailed many metres behind its character');
});
check('High downward speed is capped before movement rather than after crossing a roof',()=>{
  const p=player();p.position.y=100;p.velocity.y=-1000;const before=p.position.clone();
  p.update(1/120,input(),camera);
  assert(p.position.distanceTo(before)<=p.maxSpeed/120+1e-6);
});
check('A facade visible to the camera behind an obstacle is not offered as a usable web target',()=>{
  const p=player(),mesh=new THREE.Mesh(new THREE.BoxGeometry(8,20,2));
  mesh.position.set(0,12,20);mesh.updateMatrixWorld(true);p.city.buildingMeshes=[mesh];
  p.city.raycast=()=>({distance:1});
  assert.equal(p.findBestAnchor(camera),null);assert.equal(p.bestAnchorCandidate,null);
});
check('Swing facing carries through release rather than turning back to the old ground facing',()=>{
  const p=player();p.findBestAnchor=()=>new THREE.Vector3(0,32,0);p.startSwing(camera);
  p.velocity.set(-12,0,0);const held=input();held.webHold=true;
  p.update(1/120,held,camera);assert(Math.abs(p.facingAngle+Math.PI/2)<0.01);
  p.releaseSwing(false);p.update(1/120,input(),camera);
  assert.equal(p.character.targetFacingAngle,p.facingAngle);
});
console.log(`Mechanics audit: ${passed} passed, ${failed} failed.`);
if(failed)process.exitCode=1;
