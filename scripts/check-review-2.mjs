import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SwingPhysics } from '../src/SwingPhysics.js';
import { ThirdPersonCamera } from '../src/Camera.js';
import { TimeTrialSystem } from '../src/TimeTrial.js';
import { Preferences } from '../src/Preferences.js';
import { GameApp } from '../src/main.js';
import { City } from '../src/City.js';

let passed = 0, failed = 0;
async function check(name, run) {
  try { await run(); passed++; console.log(`PASS REVIEW: ${name}`); }
  catch (error) { failed++; console.error(`FAIL REVIEW: ${name}: ${error.message}`); }
}
const silent = new Proxy({}, {get:()=>()=>{}});
function player() {
  return new SwingPhysics(new THREE.Scene(), {buildingMeshes:[],colliders:[],checkCollision:()=>({collided:false}),
    getRooftopSpawn:()=>new THREE.Vector3(0,.1,0)},
    {group:new THREE.Group(),update(){},requestTurn(){},stopAnimation(){},toggleHand(){},fireWeb(){}}, silent);
}
const camera = new THREE.PerspectiveCamera(); camera.position.set(0,11.3,-5);camera.lookAt(0,11.3,20);camera.updateMatrixWorld(true);
async function withDOM(run) {
  const original = globalThis.document;
  globalThis.document = {getElementById:()=>null,querySelector:()=>null};
  try { await run(); }
  finally { await new Promise(resolve=>setTimeout(resolve,5)); globalThis.document = original; }
}
await check('Resuming does not latch an unheld swing after a reel reaches the target',()=>withDOM(()=>{
  const p=player();p.position.set(0,12,9.9);p.zipTarget=new THREE.Vector3(0,12,10);
  p.zipAnchor=new THREE.Vector3(0,14,10);p.zipTime=8;p.state='WEB_ZIP';
  const app=Object.create(GameApp.prototype);Object.assign(app,{physics:p,input:{webHold:true,strafe:0},heldKeys:new Set(),audio:silent,isPlaying:true});
  app.setPaused(true);app.setPaused(false);
  p.update(1/120,app.input,camera);p.update(1/120,app.input,camera);
  assert(!p.isSwinging,'The resumed reel kept swinging without a held mouse button');
  assert.equal(app.input.webHold,false);
  p.isSwinging=false;p.position.set(0,12,10);p.state='WEB_ZIP';p.zipTime=8;
  p.zipTarget=new THREE.Vector3(0,12,100);p.zipAnchor=new THREE.Vector3(0,14,100);
  p.findBestAnchor=()=>new THREE.Vector3(0,30,40);
  app.setPaused(true);app.setPaused(false);p.update(1/120,app.input,camera);
  assert.equal(p.state,'WEB_ZIP','Resume retargeted a reel before reaching its target');
  assert.equal(p.zipTarget.z,100);
}));
await check('Race clock measures a delayed active frame, while physics stays bounded',()=>withDOM(()=>{
  const original=globalThis.requestAnimationFrame;globalThis.requestAnimationFrame=()=>{};
  try {
    let physicsDelta=0,trialDelta=0;
    const app=Object.create(GameApp.prototype);Object.assign(app,{clock:{getDelta:()=>.5,elapsedTime:.5},city:{update(){},buildingMeshes:[]},
      assetsReady:true,isPlaying:true,isPaused:false,physics:{update:dt=>{physicsDelta=dt;},position:new THREE.Vector3(),velocity:new THREE.Vector3()},
      input:{},camera,tpsCamera:{update(){}},preferences:{values:{}},vfx:{update(){}},timeTrial:{update:(_pos,dt)=>{trialDelta=dt;}},
      updateTrialHUD(){},updateHUD(){},renderer:{render(){}},scene:new THREE.Scene()});
    app.animate();assert.equal(physicsDelta,.1);assert.equal(trialDelta,.5);
    app.isPaused=true;trialDelta=0;app.animate();assert.equal(trialDelta,0);
  } finally {globalThis.requestAnimationFrame=original;}
}));
await check('Facade normal matches the world-space triangle after unequal scaling',()=>{
  const geometry=new THREE.PlaneGeometry(20,20).rotateY(Math.PI/4);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  mesh.scale.set(4,1,1);mesh.position.set(0,11.3,20);mesh.updateMatrixWorld(true);
  const p=player();p.position.set(0,10,0);p.city.buildingMeshes=[mesh];assert(p.findBestAnchor(camera));
  const points=[0,1,2].map(i=>new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,geometry.index.getX(i)).applyMatrix4(mesh.matrixWorld));
  const expected=new THREE.Vector3().crossVectors(points[1].clone().sub(points[0]),points[2].clone().sub(points[0])).normalize();
  assert(p.bestAnchorNormal.dot(expected)>.999,`Wrong normal ${p.bestAnchorNormal.toArray()}`);
});
await check('Best-time quota failure is visible to the player',()=>withDOM(()=>{
  const preferences=new Preferences({getItem:()=>null,setItem:()=>{throw new Error('quota');}});
  const app=Object.create(GameApp.prototype);let notice='';Object.assign(app,{preferences,
    timeTrial:{courseId:'procedural-v3-12345678',isActive:true,isCompleted:true,elapsedTime:10},showNotice:text=>{notice=text;}});
  app.updateTrialHUD({completed:true,totalTime:10});assert.match(notice,/저장/);assert.match(notice,/이번 실행/);
}));
function course(gates) {
  const trial=new TimeTrialSystem(new THREE.Scene(),{},silent);trial.isActive=true;trial.previousPosition=new THREE.Vector3();
  trial.checkpoints=gates.map(z=>({position:new THREE.Vector3(0,0,z),normal:new THREE.Vector3(0,0,1),radius:3.2,mesh:new THREE.Mesh(trial.ringGeom,trial.activeMat)}));
  return trial;
}
await check('A single movement segment can cross two gates in course order',()=>{
  const trial=course([1,2]);const result=trial.update(new THREE.Vector3(0,0,3),.1);
  assert(result.completed);assert.equal(trial.currentIndex,2);trial.dispose();
});
await check('Crossing a later gate before the current gate never completes a race',()=>{
  const trial=course([2,1]);const result=trial.update(new THREE.Vector3(0,0,3),.1);
  assert(!result.completed);assert.equal(trial.currentIndex,1);trial.dispose();
});
await check('Enabling reduced motion immediately cancels a shake already in progress',()=>{
  const c=new ThirdPersonCamera(new THREE.PerspectiveCamera(),{});c.triggerShake(1);c.reducedMotion=true;
  c.update(1/60,new THREE.Vector3(),new THREE.Vector3(),false);
  assert.equal(c.shakeIntensity,0);assert.equal(c.shakeOffset.length(),0);
});
await check('Saving, reloading, and limiting layout records preserves the fastest valid time',()=>{
  let saved=null;const storage={getItem:()=>saved,setItem:(_key,value)=>{saved=value;}};const prefs=new Preferences(storage);
  for(let i=0;i<80;i++)prefs.recordTime(`procedural-v3-${i.toString(16).padStart(8,'0')}`,i+1);
  const last='procedural-v3-0000004f';assert(!prefs.recordTime(last,100));assert(prefs.recordTime(last,10));
  assert(!prefs.recordTime(last,-1));const reloaded=new Preferences(storage);assert.equal(Object.keys(reloaded.values.bestTimes).length,64);
  assert.equal(reloaded.values.bestTimes[last],10);assert.equal(reloaded.values.bestTimes['procedural-v3-00000000'],undefined);
});
await check('An unavailable fullscreen API gives feedback rather than doing nothing',()=>withDOM(async()=>{
  document.documentElement={};const app=Object.create(GameApp.prototype);let notice='';app.showNotice=text=>{notice=text;};
  await app.toggleFullscreen();assert.match(notice,/전체화면을 사용할 수 없습니다/);
  document.documentElement.requestFullscreen=async()=>{throw new Error('denied');};notice='';
  await app.toggleFullscreen();assert.match(notice,/전체화면을 사용할 수 없습니다/);
}));
await check('A generated local course completes all eight ordered gates and can restart',()=>withDOM(()=>{
  document.createElement=()=>({width:0,height:0,getContext:()=>silent});
  const city=new City(new THREE.Scene());const trial=new TimeTrialSystem(new THREE.Scene(),city,silent);
  assert(trial.start());assert.equal(trial.checkpoints.length,8);const id=trial.courseId;
  trial.checkpoints.forEach((cp,index)=>assert.equal(cp.mesh.visible,index<=1));
  assert.match(id,/^procedural-v4-/);
  const prefs=new Preferences();prefs.recordTime(id.replace('-v4-','-v3-'),1);
  assert.equal(prefs.values.bestTimes[id],undefined);assert(prefs.recordTime(id,4));
  for(let i=0;i<8;i++){
    const cp=trial.checkpoints[i];trial.previousPosition=cp.position.clone().addScaledVector(cp.normal,-1);
    const result=trial.update(cp.position.clone().addScaledVector(cp.normal,1),.5);
    assert.equal(trial.currentIndex,i+1);assert.equal(result.completed,i===7);
    trial.checkpoints.forEach((gate,index)=>assert.equal(gate.mesh.visible,index===i+1||index===i+2));
  }
  assert.equal(trial.elapsedTime,4);trial.stop();assert(trial.start());assert.equal(trial.courseId,id);
  assert.equal(trial.currentIndex,0);assert.equal(trial.elapsedTime,0);trial.dispose();
}));
await check('Seeded mixed movement stays finite and speed-bounded over twelve simulated minutes',()=>{
  let seed=0x12345678;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(const fps of [30,60,144]){
    const p=player();p.position.set(0,.1,0);p.state='IDLE';p.city.playableHalfExtent=80;
    p.city.colliders=[{minX:-8,maxX:8,minY:0,maxY:5,minZ:15,maxZ:15.05}];p.city.raycast=City.prototype.raycast;
    const input={forward:false,backward:false,left:false,right:false,sprint:false,jump:false,webHold:false,wallRun:false,strafe:0};
    for(let frame=0;frame<fps*240;frame++){
      if(frame%Math.max(1,Math.round(fps/4))===0){
        input.forward=random()>.2;input.backward=random()>.85;input.strafe=random()>.5?1:-1;
        input.sprint=random()>.4;input.wallRun=random()>.7;input.jump=random()>.5;
      }
      p.update(1/fps,input,camera);
      assert([...p.position,...p.velocity,...p.renderPosition].every(Number.isFinite));
      assert(p.velocity.length()<=p.maxSpeed+1e-6);assert(p.position.y>=.1-1e-6);
    }
  }
});
console.log(`Second review: ${passed} passed, ${failed} failed.`);
if(failed)process.exitCode=1;
