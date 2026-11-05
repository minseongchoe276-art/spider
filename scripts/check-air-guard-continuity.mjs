import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadMotionRig, joint, point, disposeRig} from './lib/motion-rig.mjs';

const {actor} = await loadMotionRig();
for (const fps of [30, 60, 144]) {
  const c = actor();
  c.groundProbe = () => null;
  c.combatStance = true;
  c.group.position.y = 10;
  let previous;
  try {
    for (let frame = 0; frame < fps + Math.ceil(fps * 1.2); frame++) {
      c.combatAction = frame < fps ? {id: 1, key: 'jab', duration: 1, time: frame / fps} : null;
      c.update(1 / fps, 'FALLING', new THREE.Vector3(0, -4, 0));
      const arms = ['left', 'right'].map(side => ({
        rotation: joint(c, side + 'arm').quaternion.clone(),
        hand: point(c, side + 'hand').sub(c.group.position),
      }));
      if (frame === fps) {
        for (let i = 0; i < arms.length; i++) {
          assert(arms[i].rotation.angleTo(previous[i].rotation) < THREE.MathUtils.degToRad(35),
            `${fps} FPS: airborne guard snaps the arm`);
          assert(arms[i].hand.distanceTo(previous[i].hand) < .25,
            `${fps} FPS: airborne guard snaps the hand ${arms[i].hand.distanceTo(previous[i].hand).toFixed(3)}m`);
        }
      }
      previous = arms;
    }
    assert(c.airGuardWeight > .99, `${fps} FPS: guard did not settle`);
    console.log(`PASS ${fps} FPS airborne action → guard continuity`);
  } finally { disposeRig(c); }
}
