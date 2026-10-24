import {GameApp} from '../src/main.js';
import {City} from '../src/City.js';
import {LOCAL_MAPS} from '../src/MapCatalog.js';
import {PlayerExperience} from '../src/PlayerExperience.js';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import fs from 'node:fs';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {TouchControls} from '../src/TouchControls.js';
import {ThirdPersonCamera} from '../src/Camera.js';
import {followMobileCamera,MOBILE_ANCHOR_FAN,mobileAnchorScore,mobileStartingView} from '../src/MobileTraversal.js';
const results=[];const pass=name=>{results.push(name);console.log('PASS '+name);};
function world(meshes){
  meshes.forEach(mesh=>mesh.updateMatrixWorld(true));
  const character={group:new THREE.Group(),fireWeb(){},update(){},stopAnimation(){}};
  const city={buildingMeshes:meshes,colliders:[],checkCollision:()=>({collided:false}),getRooftopSpawn:()=>new THREE.Vector3(0,.1,0)};
  const p=new SwingPhysics(new THREE.Scene(),city,character,new Proxy({},{get:()=>()=>{}}));p.position.set(0,.1,0);p.state='IDLE';return p;
}
const camera=new THREE.PerspectiveCamera(60,1,.1,500);camera.position.set(0,6,8);camera.lookAt(0,6,-30);camera.updateMatrixWorld(true);
const wall=new THREE.Mesh(new THREE.BoxGeometry(8,30,2));wall.position.set(11,22,-30);
const p=world([wall]);assert.equal(p.findBestAnchor(camera),null,'Desktop reticle miss must remain a miss');
p.mobileTraversalAssist=true;let calls=0;const cast=p.castWebSurface.bind(p);p.castWebSurface=(...args)=>{calls++;return cast(...args);};
const target=p.findBestAnchor(camera);assert(target);assert(target.x>6&&target.y>3&&target.z<0);assert(calls<=MOBILE_ANCHOR_FAN.length+1);
assert(p.startSwing(camera));assert.equal(p.webs.length,1);const hand=p.webs[0].hand;p.releaseSwing(false);assert(p.startSwing(camera));assert.notEqual(p.webs[0].hand,hand,'Single button must alternate hands automatically');
pass('Forward side-wall assistance, bounded ten-ray fan, exact desktop miss and automatic hand alternation');
for(const position of [new THREE.Vector3(0,25,30),new THREE.Vector3(0,25,-180)]){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(15,30,2));mesh.position.copy(position);const empty=world([mesh]);empty.mobileTraversalAssist=true;assert.equal(empty.findBestAnchor(camera),null);
}
assert.equal(mobileAnchorScore(new THREE.Vector3(0,0,-30),p.position.clone().add(new THREE.Vector3(0,1.3,0)),camera),Infinity);
const blocked=world([wall]);blocked.mobileTraversalAssist=true;blocked.webObstructed=()=>true;assert.equal(blocked.findBestAnchor(camera),null);
const unloaded=world([wall]);unloaded.mobileTraversalAssist=true;unloaded.city.isStreamed=true;unloaded.city.collisionWorld={ready:false};assert.equal(unloaded.findBestAnchor(camera),null);
pass('No rear, ground, out-of-range, obstructed or unprepared streamed attachments');
for(const fps of [30,60,144]){
  const rig={yaw:0,pitch:.3,followStrength:1};let previous=0;
  for(let i=0;i<fps*3;i++){followMobileCamera(rig,1/fps,new THREE.Vector3(4,0,6),true,.6,{forward:true});assert(Math.abs(rig.yaw-previous)<=.75/fps+1e-9);previous=rig.yaw;}
  assert(Math.abs(rig.yaw-Math.atan2(4,6))<.04);assert(rig.pitch<0);
  rig.mobileLooking=true;const held=rig.yaw;for(let i=0;i<fps*4;i++)followMobileCamera(rig,1/fps,new THREE.Vector3(7,0,5),true,.9,{forward:true});assert.equal(rig.yaw,held);
  rig.mobileLooking=false;for(let i=0;i<fps*2;i++)followMobileCamera(rig,1/fps,new THREE.Vector3(7,0,5),true,.9,{forward:true});assert.equal(rig.yaw,held,'Manual grace must not be stolen early');
  for(let i=0;i<fps*2;i++)followMobileCamera(rig,1/fps,new THREE.Vector3(7,0,5),true,.9,{forward:true});assert(rig.yaw>held);
  const still=rig.yaw;for(const input of [{left:true},{right:true},{backward:true}])followMobileCamera(rig,1/fps,new THREE.Vector3(10,0,0),true,1.5,input);assert.equal(rig.yaw,still);
  rig.yaw=0;followMobileCamera(rig,1/fps,new THREE.Vector3(0,0,-8),true,Math.PI,{});assert.equal(rig.yaw,0,'Pendulum reversal must not whip the camera');
}
const rig=new ThirdPersonCamera(new THREE.PerspectiveCamera());rig.mobileAutoFollow=true;rig.handleMouseMove(10,5);assert.equal(rig.mobileLookDelay,2.2);rig.recenterBehind(.2);assert.equal(rig.mobileLookDelay,0);
pass('30/60/144 FPS smooth follow, angular-speed limit, manual priority/grace, strafe stability and no reversal whip');
const closeCamera=new ThirdPersonCamera(new THREE.PerspectiveCamera());closeCamera.mobileAutoFollow=true;
closeCamera.safeDistance=()=>.6;closeCamera.placeBehind(new THREE.Vector3(),0);closeCamera.update(1/60,new THREE.Vector3(),new THREE.Vector3(),false);assert(closeCamera.localAvatarOccluded);
closeCamera.safeDistance=()=>10;for(let i=0;i<120;i++)closeCamera.update(1/60,new THREE.Vector3(),new THREE.Vector3(),false);assert(!closeCamera.localAvatarOccluded);
closeCamera.mobileAutoFollow=false;closeCamera.safeDistance=()=>.6;closeCamera.update(1/60,new THREE.Vector3(),new THREE.Vector3(),false);assert(!closeCamera.localAvatarOccluded);
pass('Mobile wall retraction clears the local body from view and restores it after clearance; desktop visibility unchanged');

const cls={add(){},remove(){},toggle(){}},events=[];
const game={isPlaying:true,isPaused:false,input:{},physics:{webs:[],state:'IDLE',setWebAimPoint(){}},combat:{mode:'web'},audio:{ensureContext(){}},tpsCamera:{handleMouseMove(){}},syncHeldInput(){}};
const controls=Object.create(TouchControls.prototype);Object.assign(controls,{simpleTraversal:true,game,enabled:true,pointers:new Map(),wireLatched:false,knob:{style:{}},stick:{classList:cls},mouse(button,down,traversal){events.push({button,down,traversal});if(down){game.input.webTap=true;game.input.webHold=true;}else{game.input.webHold=game.input.webFireHeld=false;game.physics.webs=[];}},key(action,down){events.push({action,down});}});
const button={dataset:{mouse:'0'},classList:cls,setPointerCapture(){},closest(selector){return selector==='button'?this:null;}};
const event=(id,x=100,y=100,type='pointerup')=>({pointerId:id,pointerType:'touch',target:button,clientX:x,clientY:y,type,preventDefault(){}});
controls.down(event(1));assert.equal(events.length,0,'Down must not fire before the user can adjust the camera');controls.up(event(1));assert(controls.wireLatched);assert.equal(game.input.webFireHeld,false);assert.equal(events[0].traversal,true);assert(game.input.webHold);
game.input.webTap=false;game.physics.webs=[{button:0}];controls.down(event(2));controls.up(event(2));assert(!controls.wireLatched);assert(!game.input.webHold);
controls.down(event(3));controls.move(event(3,125));controls.up(event(3,125));assert(!controls.wireLatched,'Camera drag on the button must not accidentally fire');
controls.down(event(4));controls.up(event(4,100,100,'pointercancel'));assert(!controls.wireLatched);
controls.down(event(5));controls.up(event(5,100,100,'lostpointercapture'));assert(!controls.wireLatched);
controls.down(event(6));controls.up(event(6));assert(controls.wireLatched);game.isPaused=true;controls.release();assert(!controls.wireLatched);assert(!game.input.webHold);assert.equal(controls.pointers.size,0);
pass('Tap retains rope after finger lift; second tap releases; drag/cancel/capture-loss never fires; pause clears latch');
// Simulate a failed or severed rope at the next HUD tick. It must require another
// deliberate tap, instead of holding a hidden retry command indefinitely.
const primary={setAttribute(){},querySelector:()=>({textContent:'',setAttribute(){}})};
controls.root={dataset:{},querySelector:()=>primary};game.isPaused=false;game.input.webTap=false;game.input.webHold=false;controls.wireLatched=true;
const doc=globalThis.document;globalThis.document={body:{classList:cls}};try{controls.syncTraversal(true);assert(!controls.wireLatched);assert(!game.input.webHold);}finally{if(doc===undefined)delete globalThis.document;else globalThis.document=doc;}
pass('Failed/severed rope clears pending input and never auto-reconnects');
class MapCity extends City{
  initTextures(){for(const key of ['windowGlassTex','windowBrickTex','windowDarkTex','roadTex'])this[key]=new THREE.Texture();}
  createHelipad(){}
}
const starts=[];
for(const map of LOCAL_MAPS){
  const city=new MapCity(new THREE.Scene(),map.id),actor={group:new THREE.Group(),update(){},fireWeb(){}};
  const physics=new SwingPhysics(new THREE.Scene(),city,actor,new Proxy({},{get:()=>()=>{}}));physics.position.copy(city.getRooftopSpawn(95));physics.mobileTraversalAssist=true;
  const g={city,physics,camera:new THREE.PerspectiveCamera(65,390/844,.2,1000),touchControls:{enabled:true},multiplayer:{solo:true}};
  g.experience={safe:point=>PlayerExperience.prototype.safe.call({game:g},point)};
  const original=physics.position.clone(),start=mobileStartingView(g);assert(start,`${map.id}: no accessible first mobile attachment`);assert(g.experience.safe(start.position));assert(physics.position.equals(original),'Searching changed live player position');
  physics.position.copy(start.position);physics.facingAngle=start.yaw;const liveRig=new ThirdPersonCamera(g.camera);g.tpsCamera=liveRig;liveRig.mobileAutoFollow=true;GameApp.prototype.resetCamera.call(g);assert.equal(liveRig.pitch,.12,'Mobile reset used the steep desktop district preview angle');liveRig.update(1/60,start.position,new THREE.Vector3(),false,city.buildingMeshes,city.raycast.bind(city),start.yaw,{});assert(physics.findBestAnchor(g.camera),`${map.id}: collision-adjusted camera lost the starter pivot`);physics.position.copy(original);
  const saved=mobileStartingView(g,false);if(saved)assert(saved.position.equals(original),'Saved position was relocated');
  g.multiplayer.solo=false;assert.equal(mobileStartingView(g),null,'Online authority spawn was changed');g.multiplayer.solo=true;
  starts.push({map:map.id,position:start.position.toArray(),yaw:start.yaw,relocated:!start.position.equals(original)});
}
pass('All five districts have a safe mobile starting view with a visible pivot; saved/online positions are preserved');
const folder=process.env.MOBILE_TRAVERSAL_QA_DIR||'docs/qa/mobile-traversal-2026-10-25';fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(`${folder}/mechanics.json`,JSON.stringify({status:'PASS',checks:results,starts},null,2)+'\n');
