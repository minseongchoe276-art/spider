import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Character } from '../src/Character.js';
import { SwingPhysics } from '../src/SwingPhysics.js';
import { ThirdPersonCamera } from '../src/Camera.js';
import { StreamedCollision } from '../src/StreamedCollision.js';
import { UrbanGroundCity } from '../src/UrbanGroundCity.js';
import { City } from '../src/City.js';
import { TimeTrialSystem } from '../src/TimeTrial.js';
import { Preferences } from '../src/Preferences.js';
import { VFXManager } from '../src/VFX.js';
import { SpeedLinesEffect } from '../src/SpeedLines.js';
import { SoundController } from '../src/Audio.js';
import { GameApp } from '../src/main.js';
import { fetchAsset } from '../src/AssetLoader.js';

let count = 0;
async function check(name, run) { await run(); count++; console.log(`PASS QA ${count}: ${name}`); }
const silent = new Proxy({}, { get: () => () => {} });
const camera = new THREE.PerspectiveCamera(); camera.rotation.y = Math.PI;
await check('Hong Kong layers share a city-owned budget without overwriting the library cache',async()=>{
  const renderer={extensions:{has:()=>false},capabilities:{isWebGL2:true},
    getSize:target=>target.set(1280,800),getPixelRatio:()=>1};
  const first=new UrbanGroundCity(new THREE.Scene(),camera,renderer);
  const second=new UrbanGroundCity(new THREE.Scene(),camera,renderer);
  assert(first.tilesets.every(t=>t.lruCache===first.tileCache));
  assert(second.tilesets.every(t=>t.lruCache===second.tileCache));
  assert.notEqual(first.tileCache,second.tileCache);
  assert.equal(first.tileCache.maxBytesSize,384*1024*1024);
  first.dispose();second.dispose();
  await Promise.all([first.collisionWorld.initialized,second.collisionWorld.initialized]);
});
await check('Streamed spawn is refreshed after a menu-time LOD change',()=>{
  const city=Object.create(UrbanGroundCity.prototype);city.isReady=true;
  city.rooftopSpawns=[new THREE.Vector3(0,47.15,0)];
  city.collisionWorld={groundAt:()=>19.5};
  assert.equal(city.getRooftopSpawn().y,19.65);
  city.collisionWorld.groundAt=()=>null;
  assert.equal(city.getRooftopSpawn().y,19.65);
});
await check('Streamed startup waits for idle queues and a stable support surface',()=>{
  const city=Object.create(UrbanGroundCity.prototype);city.loadedRoots=3;
  city.tilesets=[{stats:{queued:1}}];city.collisionWorld={pending:[],job:null};
  const spawn=new THREE.Vector3(0,20,0);
  assert(!city.startupSurfaceSettled(spawn,0));assert(!city.startupSurfaceSettled(spawn,1000));
  city.tilesets[0].stats.queued=0;
  assert(!city.startupSurfaceSettled(spawn,1200));assert(city.startupSurfaceSettled(spawn,1600));
  spawn.y=5;assert(!city.startupSurfaceSettled(spawn,1700));
  assert(!city.startupSurfaceSettled(spawn,2000));assert(city.startupSurfaceSettled(spawn,2400));
});
function player() {
  return new SwingPhysics(new THREE.Scene(),
    {buildingMeshes:[],colliders:[],checkCollision:()=>({collided:false}),getRooftopSpawn:()=>new THREE.Vector3(0,.1,0)},
    {group:new THREE.Group(),update(){},stopAnimation(){},toggleHand(){},fireWeb(){}},silent);
}
await check('Failed GLB remains startable, reports degradation, keeps attached web visible', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('simulated offline'); };
  let loaded = false;
  const character = new Character(new THREE.Scene(),()=>{},()=>{loaded=true;});
  await new Promise(resolve=>setImmediate(resolve));
  globalThis.fetch = original;
  assert(loaded && character.isLoaded);
  assert(character.loadWarning && character.placeholder.parent);
  character.fireWeb(new THREE.Vector3(-5,20,5),'left');
  assert(character.webLineOffhand.visible && !character.webLine.visible);
  character.fireWeb(new THREE.Vector3(5,20,5),'right');
  character.update(.5,'SWINGING',new THREE.Vector3(),new THREE.Vector3(5,20,5));
  assert(character.webLine.visible && character.webLineOffhand.visible);
  character.setFirstPersonMode(true); assert(!character.placeholder.visible);
});
await check('Asset HTTP failures and network timeout settle rather than wait forever', async () => {
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async()=>({ok:false,status:404});
    await assert.rejects(fetchAsset('/missing.glb'),/404/);
    globalThis.fetch=(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))));
    await assert.rejects(fetchAsset('/hanging.glb',10),/aborted/);
  } finally { globalThis.fetch=original; }
});
await check('Absent motion selects an available idle instead of keeping a fall pose',()=>{
  const c=Object.create(Character.prototype);c.model=new THREE.Group();c.mixer=new THREE.AnimationMixer(c.model);
  const clip=new THREE.AnimationClip('idle',1,[new THREE.NumberKeyframeTrack('.position[x]',[0,1],[0,0])]);
  c.actions={idle:c.mixer.clipAction(clip)};c.activeAction=null;
  c.fadeToAction('land');assert.equal(c.activeAction,c.actions.idle);
});
await check('Reattachment cannot repeatedly grant launch energy; swing cancels stale zip',()=>{
  const p=player();p.position.set(0,20,0);p.findBestAnchor=()=>new THREE.Vector3(0,40,20);
  assert(p.startSwing(camera)); assert.equal(p.velocity.length(),0);
  p.releaseSwing();p.swingCooldown=0;p.velocity.set(0,0,0);
  p.zipTarget=new THREE.Vector3();p.zipAnchor=new THREE.Vector3();p.zipTime=2;
  assert(p.startSwing(camera));assert.equal(p.velocity.length(),0);
  assert.equal(p.zipTarget,null);assert.equal(p.zipAnchor,null);assert.equal(p.zipTime,0);
});
await check('Tether obstruction on the same mesh releases the swing',()=>{
  const p=player();const geometry=new THREE.BoxGeometry(8,8,1),mesh=new THREE.Mesh(geometry);
  mesh.position.set(0,12,5);mesh.updateMatrixWorld(true);
  p.position.set(0,10,0);p.anchorPoint=new THREE.Vector3(0,15,10);
  p.anchorObject=mesh;p.city.buildingMeshes=[mesh];p.isSwinging=true;p.state='SWINGING';
  p.updateSwingPhysics(1/120,{strafe:0},camera);assert(!p.isSwinging);
});
await check('Procedural wall run mounts a supported rooftop',()=>{
  const p=player();p.city.colliders=[{minX:-4,maxX:4,minY:0,maxY:20,minZ:3,maxZ:8}];
  p.city.raycast=City.prototype.raycast;p.position.set(0,19.5,2.3);
  p.wallNormal.set(0,0,-1);p.state='WALL_RUNNING';
  p.updateWallRunPhysics(1/120,{forward:true,wallRun:true,strafe:0},camera);
  assert.equal(p.state,'MANTLING');
  for(let t=0;t<0.85 && p.state==='MANTLING';t+=1/120)p.updateMantlePhysics(1/120,{});
  assert.equal(p.state,'IDLE');assert.equal(p.position.y,20.1);
});
await check('Camera chooses the closest visual surface even with a farther collider',()=>{
  const c=new ThirdPersonCamera(new THREE.PerspectiveCamera(),{});
  const wall=new THREE.Mesh(new THREE.BoxGeometry(8,8,.1));wall.position.z=2;wall.updateMatrixWorld(true);
  const safe=c.safeDistance(new THREE.Vector3(),new THREE.Vector3(0,0,1),8,[wall],()=>({distance:7}));
  assert(safe<2,'New LOD wall was ignored');
});
await check('Blocked camera holds its chosen shoulder through small clearance changes',()=>{
  const c=new ThirdPersonCamera(new THREE.PerspectiveCamera(),{});
  let sideClearance=5.8;
  c.safeDistance=(_center,direction)=>direction.z<-.97?0.55:direction.x<0?sideClearance:5.3;
  const a=c.findCameraBoom(new THREE.Vector3(),0,.16,5.8,[],null);
  sideClearance=5.45;
  const b=c.findCameraBoom(new THREE.Vector3(),0,.16,5.8,[],null);
  assert(a.distance>5 && b.distance>5);
  assert(a.direction.distanceTo(b.direction)<1e-10,'Camera jumped to the other shoulder');
});
await check('Mouse vertical direction stays consistent between third and first person',()=>{
  const c=new ThirdPersonCamera(new THREE.PerspectiveCamera(),{});c.mode='first';c.pitch=0;
  c.handleMouseMove(0,-120);c.update(1,new THREE.Vector3(),new THREE.Vector3(),false);
  const direction=new THREE.Vector3();c.camera.getWorldDirection(direction);assert(direction.y>0);
  c.handleMouseMove(0,240);c.update(1,new THREE.Vector3(),new THREE.Vector3(),false);
  c.camera.getWorldDirection(direction);assert(direction.y<0);
});
await check('Reduced motion disables camera shake and speed FOV',()=>{
  const c=new ThirdPersonCamera(new THREE.PerspectiveCamera(),{});c.reducedMotion=true;
  c.triggerShake(1);assert.equal(c.shakeIntensity,0);
  c.update(3,new THREE.Vector3(),new THREE.Vector3(48,0,0),true);assert(Math.abs(c.camera.fov-c.baseFov)<.001);
});
await check('Long-lived large tile rebuilds collision around a moved player',async()=>{
  const world=new StreamedCollision();await world.initialized;
  const left=new THREE.BoxGeometry(20,1,20).translate(0,-.5,0).toNonIndexed();
  const right=new THREE.BoxGeometry(20,1,20).translate(1000,-.5,0).toNonIndexed();
  const mesh=new THREE.Mesh(mergeGeometries([left,right]));
  world.enqueue(mesh);world.setActiveMeshes([mesh]);world.update(new THREE.Vector3());
  assert.equal(world.groundAt(new THREE.Vector3(1000,2,0),3),null);
  world.update(new THREE.Vector3(1000,0,0));
  assert(Math.abs(world.groundAt(new THREE.Vector3(1000,2,0),3))<.01);
  assert.equal(world.meshes.size,1);world.dispose();
});
await check('Large triangle conversion is incremental and unload cancels pending work',async()=>{
  const world=new StreamedCollision();await world.initialized;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(100,100,100,100));mesh.rotation.x=-Math.PI/2;
  world.enqueue(mesh);world.setActiveMeshes([mesh]);world.update(new THREE.Vector3());
  assert(world.job,'20,000 triangles were converted in one frame');
  assert(world.job.cursor<=6000);
  world.setActiveMeshes([]);world.update(new THREE.Vector3());assert.equal(world.job,null);
  assert.equal(world.meshes.size,0);world.dispose();
});
await check('Disposal before Rapier init settles safely',async()=>{
  const world=new StreamedCollision();world.dispose();await world.initialized;assert(!world.ready);
});
await check('Time trial rejects an unloaded course without throwing',()=>{
  const trial=new TimeTrialSystem(new THREE.Scene(),{getRooftopSpawn:()=>new THREE.Vector3(),collisionWorld:{groundAt:()=>null}},silent);
  assert.equal(trial.start(),false);assert(!trial.isActive);trial.dispose();
});
await check('Time trial rings are placed clear of procedural rooftops',()=>{
  const trial=new TimeTrialSystem(new THREE.Scene(),{getRooftopSpawn:()=>new THREE.Vector3(0,95,0),colliders:[{minX:-10,maxX:10,minZ:30,maxZ:50,maxY:120}]},silent);
  assert(trial.start());assert.equal(trial.checkpoints[0].position.y,124);trial.dispose();
});
await check('A loaded but obstructed checkpoint moves to a nearby clear location',()=>{
  const trial=new TimeTrialSystem(new THREE.Scene(),{
    getRooftopSpawn:()=>new THREE.Vector3(),collisionWorld:{groundAt:()=>20},
    raycast:pos=>Math.abs(pos.x)<4 ? {distance:1} : null},silent);
  assert(trial.start());assert.equal(trial.checkpoints[0].position.x,8);
  assert.equal(trial.checkpoints.length,8);trial.dispose();
});
await check('Changed checkpoint layouts never share a best-time key',()=>{
  let height=20;
  const trial=new TimeTrialSystem(new THREE.Scene(),{isStreamed:true,
    getRooftopSpawn:()=>new THREE.Vector3(),collisionWorld:{groundAt:()=>height}},silent);
  assert(trial.start());const first=trial.courseId;
  assert(trial.start());assert.equal(trial.courseId,first);
  height=30;assert(trial.start());assert.notEqual(trial.courseId,first);
  const preferences=new Preferences();assert(preferences.recordTime(first,10));
  assert.equal(preferences.values.bestTimes[trial.courseId],undefined);trial.dispose();
});
await check('Race uses active simulation time and catches a fast ring crossing',()=>{
  const trial=new TimeTrialSystem(new THREE.Scene(),{},silent);
  trial.isActive=true;trial.startTime=performance.now()-100000;
  trial.checkpoints=[{position:new THREE.Vector3(0,5,10),normal:new THREE.Vector3(0,0,1),radius:3.2,mesh:new THREE.Mesh()}];
  trial.previousPosition=new THREE.Vector3(0,5,0);
  const result=trial.update(new THREE.Vector3(0,5,20),.1);
  assert(result.completed);assert.equal(result.totalTime,.1);
  assert.equal(trial.update(new THREE.Vector3(),5),null);assert.equal(trial.elapsedTime,.1);trial.dispose();
});
await check('Being beside the ring does not count as passing its aperture',()=>{
  const trial=new TimeTrialSystem(new THREE.Scene(),{},silent);trial.isActive=true;
  trial.checkpoints=[{position:new THREE.Vector3(),normal:new THREE.Vector3(0,0,1),radius:3.2,mesh:new THREE.Mesh()}];
  trial.previousPosition=new THREE.Vector3(4,0,-1);trial.update(new THREE.Vector3(4,0,1),.1);
  assert.equal(trial.currentIndex,0);trial.dispose();
});
await check('Corrupt, invalid and inaccessible storage cannot break play',()=>{
  for(const storage of [{getItem:()=>'{broken'}, {getItem(){throw new Error('denied');}},
      {getItem:()=>JSON.stringify({muted:'yes',quality:'ultra',bestTimes:{'hong-kong-v2':-1}})}]) {
    const p=new Preferences(storage);assert.equal(p.values.muted,false);assert.equal(p.values.quality,'balanced');
    assert.deepEqual(p.values.bestTimes,{});
  }
  const p=new Preferences({getItem:()=>null,setItem(){throw new Error('quota');}});
  assert.equal(p.save(),false);assert(p.recordTime('procedural-v2',10));
  assert(!p.recordTime('procedural-v2',12));assert(!p.recordTime('procedural-v2',NaN));
  assert(p.recordTime('procedural-v2',8));assert.equal(p.values.bestTimes['procedural-v2'],8);
});
await check('Particles remain visible away from the original cached bounds',()=>{
  const vfx=new VFXManager(new THREE.Scene());assert.equal(vfx.pointsMesh.frustumCulled,false);
  assert.equal(vfx.positions[1],-9999);vfx.spawnWebImpact(new THREE.Vector3(1000,30,1000));vfx.update(1/60);
  assert(vfx.positions[0]>990);vfx.update(2);assert(vfx.particles.every(p=>!p.active));
});
await check('Speed-effect response is independent of refresh rate',()=>{
  let reference;
  for(const fps of [30,60,144]) {
    const effect=Object.create(SpeedLinesEffect.prototype);effect.intensity=0;
    for(let i=0;i<fps;i++)effect.setSpeed(60,1/fps);
    reference??=effect.intensity;assert(Math.abs(effect.intensity-reference)<1e-10);
  }
});
await check('Input aliases and opposing directions reflect all held keys',()=>{
  const app=Object.create(GameApp.prototype);app.input={};app.heldKeys=new Set(['KeyW','ArrowUp','KeyA','KeyD','ShiftLeft','ShiftRight']);
  app.syncHeldInput();assert(app.input.forward);assert(app.input.sprint);assert.equal(app.input.strafe,0);
  app.heldKeys.delete('KeyW');app.heldKeys.delete('ShiftLeft');app.syncHeldInput();
  assert(app.input.forward && app.input.sprint);app.heldKeys.delete('ArrowUp');app.syncHeldInput();assert(!app.input.forward);
});
await check('Mute routes every effect through a master gain and restores wind',()=>{
  const a=new SoundController();let value;
  a.initialized=true;a.ctx={currentTime:0};a.masterGain={gain:{setTargetAtTime(v){value=v;}}};
  a.windGain={gain:{setTargetAtTime(){}}};a.windFilter={frequency:{setTargetAtTime(){}}};a.lastWindSpeed=80;
  assert(a.toggleMute());assert.equal(value,0);assert(!a.toggleMute());assert.equal(value,1);assert.equal(a.lastWindSpeed,80);
});
await check('Procedural spawns clear equipment, stay supported and keep the camera clear',()=>{
  const original=globalThis.document;
  globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>new Proxy({}, {get:()=>()=>{}})})};
  try {
    const city=new City(new THREE.Scene());assert(city.rooftopSpawns.length>10);
    for(const spawn of city.rooftopSpawns) {
      assert(!city.colliders.some(c=>c.maxY>spawn.y+.1&&c.minY<spawn.y+1.8&&
        spawn.x+.7>c.minX&&spawn.x-.7<c.maxX&&spawn.z+.7>c.minZ&&spawn.z-.7<c.maxZ));
      assert(city.colliders.some(c=>Math.abs(c.maxY+.1-spawn.y)<1e-6&&spawn.x>c.minX&&spawn.x<c.maxX&&spawn.z>c.minZ&&spawn.z<c.maxZ));
      assert(!city.raycast(spawn.clone().add(new THREE.Vector3(0,1.7,0)),new THREE.Vector3(0,1.3,-7).normalize(),7.2));
    }
  } finally {globalThis.document=original;}
});
await check('Initial spawn and recovery use the same preferred roof',()=>{
  const p=player();let requested;p.city.getRooftopSpawn=height=>{requested=height;return new THREE.Vector3(0,95.1,0);};
  p.resetPosition();assert.equal(requested,95);
});
await check('Audio device failure cannot prevent starting the game',()=>{
  const audio=new SoundController();audio.init=()=>{throw new Error('device unavailable');};
  assert.doesNotThrow(()=>audio.ensureContext());
});
await check('Pause clears physical buttons and resume does not invent a held mouse button',async()=>{
  const original=globalThis.document,canvas={};let exits=0;
  globalThis.document={pointerLockElement:canvas,exitPointerLock(){exits++;},getElementById:()=>null,querySelector:()=>null};
  try {
    const app=Object.create(GameApp.prototype);
    Object.assign(app,{canvas,isPlaying:true,isPaused:false,input:{webHold:true,webFireHeld:true,webTap:false},heldKeys:new Set(),
      physics:{isSwinging:true,clearPendingInput(){}},audio:{setWindSpeed(){}},clickToPlayOverlay:null});
    app.setPaused(true);assert(!app.input.webFireHeld&&!app.input.webTap&&!app.input.webHold);assert.equal(exits,1);
    app.setPaused(false);assert(!app.input.webHold);assert(app.physics.isSwinging);
    await new Promise(resolve=>setTimeout(resolve,1));
  } finally {globalThis.document=original;}
});
await check('Right click does not start a reel or keep the left mouse latched',()=>{
  const previousWindow=globalThis.window,previousDocument=globalThis.document;
  const fakeWindow=new EventTarget(),fakeDocument=new EventTarget(),canvas=new EventTarget();
  Object.assign(canvas,{getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})});
  globalThis.window=fakeWindow;globalThis.document=fakeDocument;
  try {
    const physics={isSwinging:false,state:'FALLING',webAimNdc:new THREE.Vector2(),webLatch:false,zipAnchor:new THREE.Vector3(0,10,10),
      setWebAimPoint(){},findBestAnchor(){this.bestAnchorCandidate=null;},performWebPull(){this.state='WEB_ZIP';return true;}};
    const app=Object.create(GameApp.prototype);
    Object.assign(app,{canvas,isPlaying:true,isPaused:false,input:{webHold:false,webTap:false,webFireHeld:false},
      heldKeys:new Set(),physics,camera:new THREE.PerspectiveCamera(),audio:{ensureContext(){}},vfx:{spawnWebImpact(){}}});
    app.initInputListeners();
    const mouse=(type,button)=>{const event=new Event(type,{cancelable:true});
      Object.defineProperties(event,{button:{value:button},clientX:{value:400},clientY:{value:300},target:{value:canvas}});
      fakeWindow.dispatchEvent(event);};
    mouse('mousedown',0);mouse('mousedown',2);mouse('mouseup',0);
    assert.equal(physics.state,'FALLING');assert.equal(app.input.webFireHeld,false);
    assert.equal(app.input.webHold,false,'Right click left the swing latched after mouse release');
  } finally {globalThis.window=previousWindow;globalThis.document=previousDocument;}
});
await check('A web pull arriving at its anchor keeps the swing latched on the following physics tick',()=>{
  const p=player();p.position.set(0,12,9.9);p.velocity.set(0,0,4);
  p.state='WEB_ZIP';p.zipTarget=new THREE.Vector3(0,12,10);p.zipAnchor=new THREE.Vector3(0,12,10);
  p.lastWebAnchor=p.zipAnchor.clone();p.lastWebNormal=new THREE.Vector3(0,0,-1);
  const i={forward:false,backward:false,left:false,right:false,sprint:false,jump:false,webHold:true,webTap:false,webFireHeld:false,strafe:0,wallRun:false};
  p.update(1/120,i,camera);assert.equal(p.state,'SWINGING');assert(p.isSwinging);
  p.update(1/120,i,camera);assert.equal(p.state,'SWINGING');assert(p.isSwinging,'Swing detached on the tick after pull arrival');
});
await check('A missed quick web tap does not leave the web latch stuck',()=>{
  const p=player();p.position.set(0,10,0);p.state='FALLING';
  const i={forward:false,backward:false,left:false,right:false,sprint:false,jump:false,webHold:true,webTap:true,webFireHeld:false,strafe:0,wallRun:false};
  p.update(1/60,i,camera);
  assert.equal(p.isSwinging,false);assert.equal(i.webHold,false);assert.equal(p.webLatch,false);
});
await check('Grounded combat clicks punch, airborne clicks web, and Space jumps off the line',()=>{
  const previousWindow=globalThis.window,previousDocument=globalThis.document;
  const fakeWindow=new EventTarget(),fakeDocument=new EventTarget(),canvas=new EventTarget();
  Object.assign(canvas,{getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})});
  globalThis.window=fakeWindow;globalThis.document=fakeDocument;
  try {
    const punches=[],webs=[],pulls=[],airs=[];
    let clears=0,boost=null;
    const physics={state:'IDLE',isSwinging:false,webAimNdc:new THREE.Vector2(),webLatch:false,jumpForce:17,
      velocity:new THREE.Vector3(),lastWebAnchor:null,
      setWebAimPoint(){},findBestAnchor(){},
      clearPendingInput(){},
      performWebPull(){pulls.push(this.state);this.state='WEB_ZIP';this.zipAnchor=new THREE.Vector3();return true;},
      performAirJump(){airs.push(this.state);return true;},
      clearWebAnchor(){clears++;this.lastWebAnchor=null;this.isSwinging=false;},
      releaseSwing(flag){boost=flag;this.isSwinging=false;this.state='FALLING';}};
    const combat={mode:'combat',attack(){punches.push('left');return true;},straight(){punches.push('right');return true;},heavy(){punches.push('hook');return true;}};
    const app=Object.create(GameApp.prototype);
    Object.assign(app,{canvas,isPlaying:true,isPaused:false,input:{webHold:false,webTap:false,webFireHeld:false,jump:false},
      heldKeys:new Set(),physics,combat,camera:new THREE.PerspectiveCamera(),audio:{ensureContext(){}},
      multiplayer:{attack(kind){webs.push(kind);}}});
    app.initInputListeners();
    const mouse=(type,button)=>{const event=new Event(type,{cancelable:true});
      Object.defineProperties(event,{button:{value:button},clientX:{value:400},clientY:{value:300},target:{value:canvas}});
      fakeWindow.dispatchEvent(event);};
    const key=code=>{const event=new Event('keydown',{cancelable:true});Object.defineProperty(event,'code',{value:code});fakeWindow.dispatchEvent(event);};
    mouse('mousedown',0);mouse('mousedown',2);
    assert.deepEqual(punches,['left','right']);assert.equal(app.input.webTap,false);assert.equal(pulls.length,0);
    physics.state='FALLING';mouse('mousedown',0);
    assert.equal(app.input.webTap,true);assert.deepEqual(webs,['punch','punch','web']);assert.deepEqual(punches,['left','right']);
    mouse('mouseup',0);assert.equal(app.input.webHold,false);assert.equal(app.input.webTap,true);
    mouse('mousedown',2);assert.equal(pulls.length,0);assert.deepEqual(punches,['left','right']);assert.equal(app.input.webHold,false);
    assert.equal(app.input.webTapRight,true);assert.equal(app.input.webHoldRight,true);
    assert.deepEqual(webs,['punch','punch','web','web'],'Airborne right click did not shoot a web');
    physics.state='FALLING';key('KeyE');assert.deepEqual(airs,['FALLING']);assert.equal(punches.includes('hook'),false);
    physics.state='IDLE';key('KeyE');assert.deepEqual(punches,['left','right','hook']);assert.deepEqual(airs,['FALLING']);
    assert.deepEqual(webs,['punch','punch','web','web','punch']);
    physics.state='SWINGING';physics.isSwinging=true;physics.velocity.set(16,1,0);physics.lastWebAnchor=new THREE.Vector3(0,10,0);
    app.input.webHold=true;app.input.webFireHeld=true;app.input.webTap=true;
    key('Space');
    assert.equal(boost,true);assert.equal(clears,0);assert.equal(physics.state,'JUMPING');
    assert(physics.velocity.y>=17);assert.equal(app.input.webHold,false);assert.equal(app.input.webTap,false);
    physics.isSwinging=false;physics.state='WEB_ZIP';physics.velocity.set(0,2,0);physics.lastWebAnchor=new THREE.Vector3(0,10,0);
    key('Space');assert.equal(clears,1);assert.equal(physics.state,'JUMPING');assert(physics.velocity.y>=17);
  } finally {globalThis.window=previousWindow;globalThis.document=previousDocument;}
});
await check('A complete Space down/up between frames still triggers a jump',()=>{
  const previousWindow=globalThis.window,previousDocument=globalThis.document;
  const fakeWindow=new EventTarget(),fakeDocument=new EventTarget(),canvas=new EventTarget();
  globalThis.window=fakeWindow;globalThis.document=fakeDocument;
  try {
    const app=Object.create(GameApp.prototype),physics=player();physics.position.set(0,.1,0);physics.state='IDLE';
    Object.assign(app,{canvas,isPlaying:true,isPaused:false,input:{jump:false},heldKeys:new Set(),physics,camera,
      tpsCamera:{handleWheel(){},handleMouseMove(){}},audio:silent});
    app.initInputListeners();
    const key=type=>{const event=new Event(type,{cancelable:true});Object.defineProperty(event,'code',{value:'Space'});return event;};
    fakeWindow.dispatchEvent(key('keydown'));fakeWindow.dispatchEvent(key('keyup'));
    physics.update(1/60,app.input,camera);assert.equal(physics.state,'JUMPING');assert(physics.velocity.y>0);
  } finally {globalThis.window=previousWindow;globalThis.document=previousDocument;}
});
console.log(`PASS: ${count} QA regression scenarios`);
