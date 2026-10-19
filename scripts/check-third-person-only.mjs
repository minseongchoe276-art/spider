import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {ThirdPersonCamera} from '../src/Camera.js';
import {Character} from '../src/Character.js';

const camera=new ThirdPersonCamera(new T.PerspectiveCamera(),{});
assert.deepEqual(camera.modeOrder,['close','follow','swing']);
assert(!fs.existsSync('src/FirstPersonArms.js'));
assert.equal(Character.prototype.setFirstPersonMode,undefined);
assert.equal(Character.prototype.setFirstPersonCamera,undefined);
const start=camera.mode;
for(let i=0;i<30;i++)assert(camera.modeOrder.includes(camera.cycleMode()));
assert.equal(camera.mode,start);
for(const obsolete of ['first','unknown',null]){const current=camera.mode;camera.setMode(obsolete);assert.equal(camera.mode,current);}
for(const mode of camera.modeOrder)for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
 camera.setMode(mode);camera.placeBehind(new T.Vector3(0,2,0),yaw);camera.lockBehind=false;
 const distance=camera.targetDistance;camera.handleWheel(1);assert(camera.targetDistance>=distance);
 camera.handleMouseMove(0,-100);assert(camera.pitch<.16);
 camera.update(1/60,new T.Vector3(0,2,0),new T.Vector3(),false);
 assert(camera.camera.position.distanceTo(new T.Vector3(0,3.7,0))>=camera.minDistance-.01);
 assert(camera.camera.position.toArray().every(Number.isFinite));
}
for(const path of ['src/main.js','src/Character.js','src/CharacterAppearance.js','src/Multiplayer.js','src/MotionReview.js','src/CombatReview.js','src/WebHandReview.js','src/TraversalPlaytest.js','index.html']){
 assert(!/setFirstPerson|firstPersonRig|firstPersonHands|1인칭/.test(fs.readFileSync(path,'utf8')),`${path}: obsolete first-person feature remains`);
}
console.log('PASS only three third-person cameras: cycle, removed/invalid modes, four headings, wheel, pitch, full-body implementation and UI');
