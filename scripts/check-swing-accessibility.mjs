import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SwingPhysics } from '../src/SwingPhysics.js';
import { GameApp } from '../src/main.js';
import { Multiplayer } from '../src/Multiplayer.js';
import { StreamedCollision } from '../src/StreamedCollision.js';

const audio = new Proxy({}, { get: () => () => {} });
const camera = new THREE.PerspectiveCamera(60, 1, .1, 500);
camera.position.set(0, 2, -5); camera.lookAt(0, .2, 30); camera.updateMatrixWorld(true);
function player() {
  const character = { group: new THREE.Group(), update(){}, fireWeb(){}, requestTurn(){} };
  const city = { buildingMeshes: [], colliders: [], checkCollision: () => ({collided:false}) };
  const p = new SwingPhysics(new THREE.Scene(), city, character, audio);
  p.position.set(0, .1, 0); p.state = 'IDLE'; p.webEnabled = true;
  return p;
}
const wall = new THREE.Mesh(new THREE.BoxGeometry(24, 60, 2));
wall.position.set(0, 30, 30); wall.updateMatrixWorld(true);
const aimed = player(); aimed.city.buildingMeshes = [wall];
assert(aimed.findBestAnchor(camera).y > 8, 'Downward view selected a street-level pivot');
aimed.aimAssist = false;
assert(aimed.findBestAnchor(camera).y < 4, 'Manual aim was overridden with assistance disabled');
console.log('PASS downward view selects a higher real surface; manual aim remains exact');

let reference;
for (const fps of [30, 60, 144]) {
  const p = player(); p.findBestAnchor = () => new THREE.Vector3(0, 30, 30);
  assert(p.startSwing(camera)); assert(p.velocity.y >= p.jumpForce);
  const held = {webHold:true, webFireHeld:true, forward:true};
  let peak = 0, maxStep = 0, caughtLength;
  const launchLength=p.ropeLength;
  for (let n = 0; n < fps * 4; n++) {
    const before = p.position.clone(); p.update(1/fps, held, camera);
    if(p.webs[0]?.launchPending) {
      assert.equal(p.ropeLength,launchLength,'Takeoff reeled the rope before catching');
      const t=(n+1)/fps-p.accumulator;
      assert(Math.abs(p.position.y-(.1+26*t-14*t*t-14*p.fixedStep*t))<1e-6,`Takeoff arc mismatch fps=${fps} frame=${n} time=${t} y=${p.position.y} expected=${.1+26*t-14*t*t-14*p.fixedStep*t}`);
    } else {
      caughtLength ??= p.ropeLength;
      assert.equal(p.ropeLength,caughtLength,'Caught rope length changed');
    }
    assert(p.isSwinging, 'Ground launch immediately dropped the rope');
    assert(p.position.y >= .1, 'Swing arc entered the street');
    assert(p.position.distanceTo(p.anchorPoint) <= p.ropeLength + 1e-6);
    maxStep = Math.max(maxStep, before.distanceTo(p.position)); peak = Math.max(peak, p.position.y);
    if (n / fps >= 0.6) assert(p.position.y > 4, 'Arc settled too close to the street');
  }
  assert(peak > 10, 'Ground launch did not climb into a useful arc');
  assert(maxStep < 2, 'Launch teleported the player');
  if(reference) assert(p.position.distanceTo(reference) < 1e-7);
  reference = p.position.clone();
  const velocity = p.velocity.clone(); p.releaseSwing(false); assert(p.velocity.equals(velocity));
  console.log(`PASS grounded launch, clear arc, ballistic takeoff, fixed caught rope and momentum release at ${fps}fps`);
}

// A manually initiated jump also catches at its apex, with no second impulse.
const manual = player();
manual.update(1/120,{jump:true},camera);
manual.findBestAnchor=()=>new THREE.Vector3(0,30,30);
const jumpVelocity=manual.velocity.clone();
assert(manual.startSwing(camera));
assert(manual.velocity.equals(jumpVelocity),'Shooting during a jump injected another launch');
assert(manual.webs[0].launchPending,'A manual jump caught the rope before gaining height');
const earlyRelease=manual.velocity.clone();manual.releaseSwing(true);
assert(manual.velocity.equals(earlyRelease),'Space release added speed during takeoff');
console.log('PASS Space then web shares the ballistic takeoff, and early release preserves velocity');

const away = new THREE.PerspectiveCamera();
const launch = player(); launch.findBestAnchor = () => new THREE.Vector3(0, 30, 30);
assert(launch.startSwing(away));
assert(launch.velocity.z > 0, 'Ground launch moved away from the anchor');
console.log('PASS ground launch jumps toward the anchor, not the camera');

const groundZip=player();groundZip.city.buildingMeshes=[wall];
assert(!groundZip.performAirJump(camera),'E must not pull the player off the ground');
const zip = player(); zip.state='FALLING';zip.position.y=8;zip.city.buildingMeshes = [wall];
assert(zip.performAirJump(camera));
assert(zip.zipTarget.distanceTo(zip.position) <= 12 + 1e-8);
zip.zipCooldown = 0;
assert(!zip.performAirJump(camera), 'E retargeted while a hop was still in flight');
let shots = 0;
zip.character.fireWeb = () => {shots++; assert(zip.zipTarget.distanceTo(zip.position) <= 12 + 1e-8);};
for(let n=0;n<360;n++)zip.update(1/120, {webZipHeld:true}, camera);
assert.equal(shots,0,'Held E automatically repeated a zip');
assert(zip.canAirJump);
const again = player();again.state='FALLING';again.position.y=8;again.city.buildingMeshes = [wall];
assert(again.performAirJump(camera));
for(let n=0;n<180 && again.state==='WEB_ZIP';n++) again.update(1/120, {}, camera);
assert.notEqual(again.state, 'WEB_ZIP');
assert(again.performAirJump(camera), 'E stayed locked after one hop');
console.log('PASS E is airborne only, never repeats while held, and remains usable on a new press');

const blocked = player();blocked.state='FALLING';blocked.position.y=8;blocked.city.buildingMeshes = [wall];
blocked.city.colliders = [{minX:-10,maxX:10,minY:0,maxY:60,minZ:5,maxZ:6}];
assert(!blocked.performAirJump(camera), 'E bypassed an intervening wall');
assert.equal(blocked.zipCooldown, 0, 'A failed shot consumed the cooldown');
console.log('PASS short zip respects intervening collision and failed shots remain retryable');

const world = new StreamedCollision(); await world.initialized;
const floor = new THREE.Mesh(new THREE.BoxGeometry(200, 1, 200)); floor.position.y = -.5;
world.enqueue(floor); world.enqueue(wall);
for(let n=0;n<12;n++)world.update(new THREE.Vector3());
try {
  const p = player();
  Object.assign(p.city, {isStreamed:true, collisionWorld:world, buildingMeshes:[wall],
    raycast:(...args)=>world.raycast(...args), resolveMovement:(...args)=>world.resolve(...args),
    supportHeight:pos=>{const h=world.groundAt(pos,.5);return h!==null && Math.abs(pos.y-h-.1)<.25 ? h : null;}});
  p.position.y=.14;
  assert(p.startSwing(camera), 'Actual streamed facade rejected ground launch');
  for(let n=0;n<90;n++)p.update(1/120,{webHold:true,webFireHeld:true,forward:true},camera);
  assert(p.isSwinging && p.position.y>3, 'Rapier floor snapped the launch back to ground');
  assert(p.performAirJump(camera), 'E could not chain from a streamed swing');
  assert(p.zipTarget.distanceTo(p.position)<=12+1e-8);
  console.log('PASS actual streamed triangles and Rapier capsule launch upward and chain into E');
} finally {world.dispose();}

const oldWindow = globalThis.window, oldDocument = globalThis.document;
globalThis.window = new EventTarget(); globalThis.document = new EventTarget();
try {
  const p = player(); const app = Object.create(GameApp.prototype);
  Object.assign(app, {canvas:new EventTarget(),physics:p,camera,isPlaying:true,isPaused:false,
    input:{},heldKeys:new Set(),audio,combat:{mode:'web',cancel(){}},tpsCamera:{}});
  app.initInputListeners();
  const button = new EventTarget(); button.closest = selector => selector.includes('button') ? button : null;
  const e = new Event('keydown', {cancelable:true});
  Object.defineProperties(e, {code:{value:'KeyW'},target:{value:button}}); window.dispatchEvent(e);
  assert(app.input.forward, 'Focused room button swallowed W');
  const multiplayer = Object.create(Multiplayer.prototype); multiplayer.game = app; multiplayer.room={phase:'playing'};
  multiplayer.message({type:'correction',x:0,y:.1,z:0});
  assert(app.input.forward && app.heldKeys.has('KeyW'), 'Server correction erased physically held keys');
  p.update(1/60, app.input, camera); assert(p.velocity.length() > 0, 'Movement did not recover after correction');
  const typing = new EventTarget(); typing.closest = selector => selector.includes('input') ? typing : null;
  const text = new Event('keydown', {cancelable:true});
  Object.defineProperties(text, {code:{value:'KeyA'},target:{value:typing}}); window.dispatchEvent(text);
  assert(!app.heldKeys.has('KeyA'), 'Typing in a form steered the character');
} finally {globalThis.window = oldWindow; globalThis.document = oldDocument;}
console.log('PASS online button focus and corrections preserve movement; text inputs stay isolated');
