import assert from 'node:assert/strict';
import * as THREE from 'three';
import {StreamedCollision} from '../src/StreamedCollision.js';
import {UrbanGroundCity} from '../src/UrbanGroundCity.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {CombatSystem} from '../src/Combat.js';
const world=new StreamedCollision();await world.initialized;
const roof=new THREE.Mesh(new THREE.BoxGeometry(30,2,30));roof.position.set(0,19,0);roof.updateMatrixWorld(true);
const wall=new THREE.Mesh(new THREE.BoxGeometry(2,35,30));wall.position.set(12,17.5,0);wall.updateMatrixWorld(true);
world.setActiveMeshes([roof,wall]);world.enqueue(roof);world.enqueue(wall);for(let i=0;i<20;i++)world.update(new THREE.Vector3(0,20.1,0));
const city=Object.create(UrbanGroundCity.prototype);Object.assign(city,{isStreamed:true,collisionWorld:world,buildingMeshes:[roof,wall],colliders:[],playerPosition:new THREE.Vector3(),getRooftopSpawn:()=>new THREE.Vector3(0,20.1,0)});
const silent=new Proxy({}, {get:()=>()=>{}}),character={group:new THREE.Group(),update(){},updateWeb(){},fireWeb(){},stopAnimation(){},targetFacingAngle:0};
const p=new SwingPhysics(new THREE.Scene(),city,character,silent),camera=new THREE.PerspectiveCamera(60,1,.1,500);
const input=()=>({forward:false,backward:false,left:false,right:false,strafe:0,sprint:false,jump:false,wallRun:false,webHold:false});
let checks=0;function check(label,run){run();checks++;console.log('PASS HONG KONG: '+label);}
check('Streamed adapter gives genuine roof support and wall normals',()=>{assert(Math.abs(city.supportHeight(new THREE.Vector3(0,20.1,0))-20)<.01);assert.equal(city.supportHeight(new THREE.Vector3(40,20.1,0)),null);assert(city.raycast(new THREE.Vector3(0,22,0),new THREE.Vector3(1,0,0),20).normal.x<-.9);});
const anchor={anchor:new THREE.Vector3(11,25,0),normal:new THREE.Vector3(-1,0,0)};
check('Anchors require baked physical surfaces, not only rendered tiles',()=>{assert(p.anchorSupported(anchor));assert(!p.anchorSupported({anchor:new THREE.Vector3(6,25,0),normal:anchor.normal}));world.ready=false;assert(!p.anchorSupported(anchor));world.ready=true;});
check('Attachment effects fire only after a supported web actually attaches',()=>{
 const attachmentPhysics=new SwingPhysics(new THREE.Scene(),city,{...character,group:new THREE.Group()},silent);let effects=0;attachmentPhysics.onWebAttach=()=>effects++;
 attachmentPhysics.position.set(0,22,0);attachmentPhysics.webEnabled=true;attachmentPhysics.bestAnchorNormal=anchor.normal;
 attachmentPhysics.findBestAnchor=()=>anchor.anchor;assert(attachmentPhysics.startSwing(camera));assert.equal(effects,1);
 attachmentPhysics.findBestAnchor=()=>new THREE.Vector3(6,25,0);assert.equal(attachmentPhysics.startSwing(camera),false);assert.equal(effects,1);
 attachmentPhysics.releaseSwing();assert.deepEqual(attachmentPhysics.character.webAttachments,[]);assert.equal(attachmentPhysics.character.persistentWebAnchor,null);assert.equal(attachmentPhysics.character.webShotTimer,0);assert(attachmentPhysics.lastWebAnchor);
 assert(attachmentPhysics.performWebPull(camera));assert.equal(effects,2);attachmentPhysics.clearWebAnchor();
 attachmentPhysics.canAirJump=true;attachmentPhysics.raycaster.intersectObjects=()=>[{point:anchor.anchor,face:{normal:anchor.normal},object:wall,distance:12}];
 assert(attachmentPhysics.performAirJump(camera));assert.equal(effects,3);attachmentPhysics.clearWebAnchor();
 attachmentPhysics.canAirJump=true;attachmentPhysics.raycaster.intersectObjects=()=>[{point:new THREE.Vector3(6,25,0),face:{normal:anchor.normal},object:wall,distance:12}];
 assert.equal(attachmentPhysics.performAirJump(camera),false);assert.equal(effects,3);assert.equal(attachmentPhysics.canAirJump,true);
});
check('Landing from a web pull removes its rope instead of leaving ghost webs',()=>{
 const pullCharacter={...character,group:new THREE.Group(),persistentWebAnchor:anchor.anchor,webShotTimer:1,webAttachments:[{hand:'left',anchor:anchor.anchor}]};
 const pullPhysics=new SwingPhysics(new THREE.Scene(),city,pullCharacter,silent);
 pullPhysics.position.set(0,20.1,0);pullPhysics.velocity.set(0,-1,0);pullPhysics.state='WEB_ZIP';pullPhysics.zipAnchor=anchor.anchor;pullPhysics.zipTarget=anchor.anchor;
 pullPhysics.handleCollisions(1/60,input());assert.equal(pullPhysics.zipAnchor,null);assert.equal(pullCharacter.persistentWebAnchor,null);assert.deepEqual(pullCharacter.webAttachments,[]);
});
check('Ground movement, sprint, jump and dodge share streamed collision',()=>{
 const c=new CombatSystem(new THREE.Scene(),p,character);p.position.set(0,20.1,0);p.state='IDLE';camera.position.set(0,22,-5);camera.lookAt(0,22,5);camera.updateMatrixWorld(true);
 const planted=p.position.clone();assert(c.attack(camera));for(let i=0;i<30;i++){c.before(1/60,camera);p.update(1/60,input(),camera);c.after(1/60);}assert(Math.hypot(p.position.x-planted.x,p.position.z-planted.z)<.04,'Planted punch skated across the roof');c.cancel();
 for(let i=0;i<60;i++){c.before(1/60,camera);p.update(1/60,{...input(),forward:true},camera);c.after(1/60);}assert(p.position.z>1&&p.position.y>20);
 c.cancel();c.stamina=100;const beforeDodge=p.position.clone();assert(c.dodge({right:true},camera));for(let i=0;i<35;i++){c.before(1/60,camera);p.update(1/60,input(),camera);c.after(1/60);}
 const dodgeTravel=p.position.x-beforeDodge.x;assert(dodgeTravel>.12&&dodgeTravel<.5,'Short right slip did not stay inside its collision-safe travel range');
 c.cancel();p.update(1/60,{...input(),jump:true},camera);assert.equal(p.state,'JUMPING');const takeoff=p.velocity.y;assert.equal(c.heavy(camera),false);assert.equal(p.velocity.y,takeoff);for(let i=0;i<25;i++){c.before(1/60,camera);p.update(1/60,input(),camera);c.after(1/60);}assert(p.position.y>=20);
});
check('A vanished LOD anchor releases without adding launch energy',()=>{
 p.webEnabled=true;p.position.set(0,22,0);p.velocity.set(3,0,0);p.state='SWINGING';p.isSwinging=true;p.webs=[{...anchor,hand:'left',length:12}];p.anchorPoint=anchor.anchor;
 world.world.removeCollider(world.meshes.get(wall.uuid).collider,true);world.meshes.delete(wall.uuid);p.updateSwingPhysics(1/60,input(),camera);assert.equal(p.isSwinging,false);assert.equal(p.webs.length,0);assert(p.velocity.length()<=3.01);
});
check('A vanished zip target clears its persistent web and exits the pull',()=>{p.zipAnchor=anchor.anchor;p.lastWebNormal=anchor.normal;p.zipTarget=anchor.anchor;p.state='WEB_ZIP';p.updateFreePhysics(1/60,input(),camera);assert.notEqual(p.state,'WEB_ZIP');assert.equal(p.zipTarget,null);assert.equal(character.persistentWebAnchor,null);});
check('Collision baking keeps the old support while a replacement is pending',()=>{
 const originalPerformance=globalThis.performance;let now=0;globalThis.performance={now:()=>now};
 try {
  const replacement=new THREE.Mesh(new THREE.BoxGeometry(30,2,30));replacement.position.copy(roof.position);replacement.updateMatrixWorld(true);const sourceIndex=replacement.geometry.index.array;const repeated=new Uint32Array(sourceIndex.length*1000);for(let i=0;i<1000;i++)repeated.set(sourceIndex,i*sourceIndex.length);replacement.geometry.setIndex(new THREE.BufferAttribute(repeated,1));world.setActiveMeshes([replacement]);world.enqueue(replacement);
  world.update(new THREE.Vector3(0,20.1,0));now=3000;
  // Keep an inactive backing surface while active replacement work is queued.
  const entry=world.meshes.get(roof.uuid);entry.inactiveSince=0;
  world.update(new THREE.Vector3(0,20.1,0));assert(world.meshes.has(roof.uuid));assert(world.groundAt(new THREE.Vector3(0,20.3,0),1)!==null);
  for(let i=0;i<20;i++)world.update(new THREE.Vector3(0,20.1,0));assert(!world.meshes.has(roof.uuid));assert(Math.abs(world.groundAt(new THREE.Vector3(0,20.3,0),1)-20)<.01);
 } finally {globalThis.performance=originalPerformance;}
});
world.dispose();console.log(`PASS: ${checks} streamed Hong Kong adapter scenarios`);
