import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ThirdPersonCamera} from '../src/Camera.js';

const player = new THREE.Vector3();
const still = new THREE.Vector3();
function place(orbit, swinging, frames = 30) {
  const camera = new THREE.PerspectiveCamera();
  const view = new ThirdPersonCamera(camera, {});
  view.yaw = 0;
  view.pitch = 0.16;
  view.strikeOrbit = orbit;
  view.currentPos.set(0, 2, 8);
  view.lookAtTarget.set(0, 1.7, 0);
  for (let i = 0; i < frames; i++) view.update(1 / 60, player, still, swinging, [], null, 0, null);
  return {camera, view};
}

const strike = place(0.52, false);
assert.equal(strike.camera.userData.movementYaw, 0, 'Strike orbit wrote itself into the aim yaw');
const behind = strike.camera.position.clone();
// Facing +Z, character right is -X. The boom sits behind and on that side.
assert.ok(behind.x < -0.8, `Camera stayed behind the torso (x ${behind.x.toFixed(2)})`);
assert.ok(behind.z < -1, `Camera left the rear arc (z ${behind.z.toFixed(2)})`);

const swing = place(0.52, true);
assert.equal(swing.view.presentationYaw, 0, 'Web swing kept the strike shoulder offset');
assert.ok(Math.abs(swing.camera.position.x) < 0.35, `Swing camera slid sideways (${swing.camera.position.x.toFixed(2)})`);

const plain = place(0, false);
assert.ok(Math.abs(plain.camera.position.x) < 0.35, `Idle boom left center (${plain.camera.position.x.toFixed(2)})`);

console.log(`PASS strike boom x ${behind.x.toFixed(2)} z ${behind.z.toFixed(2)}, aim yaw 0, swing offset 0`);
