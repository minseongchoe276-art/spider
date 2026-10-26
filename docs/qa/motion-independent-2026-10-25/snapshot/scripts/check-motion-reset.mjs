import assert from 'node:assert/strict';
import * as T from 'three';
import {loadMotionRig, joint, disposeRig} from './lib/motion-rig.mjs';

// A respawn must render the same pose as a new actor, regardless of which
// procedural layer owned the body before it. Test output, not cache names.
const {actor} = await loadMotionRig();
const points = ['hips', 'head', 'lefthand', 'righthand', 'leftfoot', 'rightfoot'];
let cases = 0;
for (const fps of [24, 30, 60, 144]) for (const prior of ['SWINGING', 'WEB_ZIP', 'WALL_RUNNING', 'SPRINTING', 'ROLLING']) {
  const used = actor(), fresh = actor(), dt = 1 / fps;
  try {
    used.wallNormal = new T.Vector3(0, 0, 1);
    used.wallDistance = .7;
    if (prior === 'WALL_RUNNING') used.group.position.set(0, 4, .7);
    for (let frame = 0; frame < Math.ceil(.4 * fps); frame++) {
      if (prior === 'SPRINTING') used.combatAction = {id: 1, key: 'jab', time: frame * dt, duration: .72};
      used.update(dt, prior, new T.Vector3(4, prior === 'WALL_RUNNING' ? 2.8 : -10, 6.5), new T.Vector3(0, 15, 6));
    }
    for (const c of [used, fresh]) {
      c.stopAnimation();
      c.group.position.set(0, .1, 0);
      c.combatAction = null;
      c.wallNormal = null;
    }
    let maxGap = 0;
    // Cover the first rendered frame and the subsequent settling window.
    for (let frame = 0; frame < Math.ceil(.3 * fps); frame++) {
      for (const c of [used, fresh]) { c.update(dt, 'IDLE', new T.Vector3()); c.group.updateMatrixWorld(true); }
      for (const id of points) maxGap = Math.max(maxGap,
        joint(used, id).getWorldPosition(new T.Vector3()).distanceTo(joint(fresh, id).getWorldPosition(new T.Vector3())));
    }
    assert(maxGap < 1e-5, `${prior} reset at ${fps} FPS retained ${(maxGap * 1000).toFixed(2)}mm of its old pose`);
    cases++;
  } finally { disposeRig(used); disposeRig(fresh); }
}
console.log(`PASS ${cases} motion resets: first frame and settling match a fresh actor within 0.01mm`);
