import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadMotionRig, disposeRig} from './lib/motion-rig.mjs';
import {boneId} from '../src/MotionRetarget.js';
import {capturePose, RemoteMotion} from '../src/RemoteMotion.js';

const {actor} = await loadMotionRig();
const c = actor();
const find = id => Object.values(c.bones).find(bone => boneId(bone.name) === id);
const clipName = () => Object.entries(c.actions).find(([, action]) => action === c.activeAction)?.[0] || null;
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const dodgeDuration = {dodgeLeft: 0.38, dodgeRight: 0.38, dodgeBack: 0.42, dodgeForward: 0.52};

function reset() {
  c.stopAnimation();
  Object.assign(c, {
    lastState: null, landingAction: null, locomotionGait: null, gaitChangeTime: 0, pendingGait: null,
    combatAction: null, combatStance: false, combatClipToken: null, airTrick: null, isTricking: false,
    rollReleaseTime: 0, rollRenderedPose: null, rollRenderedPhase: 0, recoveryProgress: null,
    endJointPose: null, endJointModel: null, movingPlants: null, movingGuardWeight: 0,
    movingStrikeToken: null, movingStrikePose: null, movingStrikeFrom: null,
    webAttachments: [], webShotTimer: 0, networkAnimation: null, contactTime: 0,
    wallNormal: null, mantle: null, pendingTurn: null, landingSpeed: 0,
  });
  c.group.position.set(0, 0.1, 0);
}

function poseError() {
  let worst = 0;
  for (const item of c.jointConstraints || []) {
    const over = item.rest.angleTo(item.bone.quaternion) - item.limit;
    if (over > worst) worst = over;
  }
  for (const bone of Object.values(c.bones)) {
    if (!bone.position.toArray().every(Number.isFinite) || Math.abs(bone.quaternion.length() - 1) > 1e-4) return Infinity;
  }
  return worst;
}

function wristBend() {
  let max = 0;
  for (const side of ['left', 'right']) {
    const forearm = find(side + 'forearm'), hand = find(side + 'hand'), finger = find(side + 'handmiddle1');
    const axis = hand.getWorldPosition(new THREE.Vector3()).sub(forearm.getWorldPosition(new THREE.Vector3()));
    const fingers = finger.getWorldPosition(new THREE.Vector3()).sub(hand.getWorldPosition(new THREE.Vector3()));
    max = Math.max(max, axis.angleTo(fingers));
  }
  return max * 180 / Math.PI;
}

function play(fps, seconds, drive) {
  const dt = 1 / fps;
  const clips = [];
  const slips = [];
  const gaps = [];
  let wrist = 0, jointOver = 0;
  const forearm = find('rightforearm');
  const uppers = [];
  for (let frame = 0, t = 0; t < seconds - 1e-8; frame++, t += dt) {
    const step = drive(t, frame, dt);
    c.group.position.x += (step.velocity?.x || 0) * dt;
    c.group.position.z += (step.velocity?.z || 0) * dt;
    if (step.position) c.group.position.copy(step.position);
    c.combatAction = step.combat ?? null;
    c.combatStance = !!step.stance;
    c.contactTime = step.contact ?? 0;
    c.recoveryProgress = step.recovery ?? null;
    c.pendingTurn = step.turn ?? null;
    c.wallNormal = step.wallNormal ?? null;
    c.mantle = step.mantle ?? null;
    c.landingSpeed = step.landingSpeed ?? 0;
    if (step.air) { if (!c.airTrick) c.triggerAirTrick('front'); }
    else if (step.air === false) { c.airTrick = null; c.isTricking = false; }
    c.webAttachments = step.webs || [];
    c.update(dt, step.state, step.velocity || v(0, 0, 0), step.anchor || null);
    clips.push({t, clip: clipName(), release: c.rollReleaseTime || 0, weight: c.movingGuardWeight || 0});
    jointOver = Math.max(jointOver, poseError());
    wrist = Math.max(wrist, wristBend());
    uppers.push(forearm.quaternion.clone());
    for (const side of ['left', 'right']) {
      const plant = c.movingPlants?.[side];
      const foot = find(side + 'foot').getWorldPosition(new THREE.Vector3());
      // Match check-pose: a plant younger than 80ms does not continue the
      // previous sample, so the first settled frame is not a slip.
      if (!plant || plant.age < 0.08) { play.last.delete(side); continue; }
      const prev = play.last.get(side);
      if (prev?.plant === plant) {
        slips.push(foot.distanceTo(prev.foot));
        gaps.push(foot.distanceTo(plant.position));
      }
      play.last.set(side, {plant, foot});
    }
  }
  return {clips, slips, gaps, wrist, jointOver, uppers};
}
play.last = new Map();

function runCase(label, fps, seconds, drive) {
  reset();
  play.last = new Map();
  const result = play(fps, seconds, drive);
  const slip = result.slips.length ? Math.max(...result.slips) : 0;
  const gap = result.gaps.length ? Math.max(...result.gaps) : 0;
  const names = [...new Set(result.clips.map(item => item.clip))];
  console.log(JSON.stringify({
    label, fps, names, wrist: +result.wrist.toFixed(2),
    jointOverDeg: +((result.jointOver || 0) * 180 / Math.PI).toFixed(3),
    slipMm: +(slip * 1000).toFixed(1), plantGapMm: +(gap * 1000).toFixed(1),
    samples: result.slips.length,
  }));
  assert(result.jointOver < 1e-3, `${label}: joint or bone failed by ${result.jointOver}`);
  assert(result.wrist <= 12.05, `${label}: wrist bend ${result.wrist.toFixed(2)}°`);
  return {...result, slip, gap, names};
}

const speed = 6.5;
const fast = 7.6;
const control = {};
for (const fps of [60, 30]) for (const sprintSpeed of [speed, fast]) {
  control[`${fps}:${sprintSpeed}`] = runCase(`sprint ${sprintSpeed} ${fps}`, fps, 2, () => ({state: 'SPRINTING', velocity: v(0, 0, sprintSpeed)}));
  assert(control[`${fps}:${sprintSpeed}`].names.join() === 'run', 'sprint left the run clip');
  if (!(fps === 30 && sprintSpeed === fast)) assert(control[`${fps}:${sprintSpeed}`].slip < 0.025, `sprint slip ${(control[`${fps}:${sprintSpeed}`].slip * 1000).toFixed(1)}mm`);
}

for (const fps of [60, 30]) for (const sprintSpeed of [speed, fast]) for (const key of Object.keys(dodgeDuration)) {
  const duration = dodgeDuration[key];
  const result = runCase(`${key} sprint ${sprintSpeed} ${fps}`, fps, duration + 0.35, t => ({
    state: 'SPRINTING', velocity: v(0, 0, sprintSpeed), stance: true,
    combat: t < duration ? {id: 1, key, time: t, duration} : null,
  }));
  assert(result.names.every(name => name === 'run'), `${key} replaced the run: ${result.names}`);
  assert(result.clips.some(item => item.t > 0.12 && item.t < duration && item.weight > 0.5), `${key}: upper body never took the dodge`);
  const baseline = control[`${fps}:${sprintSpeed}`].slip;
  assert(result.slip <= baseline + 0.003, `${key}: dodge added skate ${(result.slip * 1000).toFixed(1)}mm over sprint ${(baseline * 1000).toFixed(1)}mm`);
  if (fps === 60) assert(result.gap < 0.05, `${key}: foot left its plant by ${(result.gap * 1000).toFixed(1)}mm`);
}

for (const fps of [60, 30]) {
  const result = runCase(`hit sprint ${fps}`, fps, 0.4 + 0.35, t => ({
    state: 'SPRINTING', velocity: v(0, 0, speed), stance: true,
    combat: t < 0.4 ? {id: 2, key: 'hitHead', time: t, duration: 0.4} : null,
  }));
  assert(result.names.every(name => name === 'run'), `hit replaced the run: ${result.names}`);
  assert(result.slip < 0.025, `hit slip ${(result.slip * 1000).toFixed(1)}mm`);
  const plain = runCase(`hit control sprint ${fps}`, fps, 0.4 + 0.35, () => ({state: 'SPRINTING', velocity: v(0, 0, speed)}));
  let delta = 0;
  for (let i = 0; i < Math.min(result.uppers.length, plain.uppers.length); i++) delta = Math.max(delta, result.uppers[i].angleTo(plain.uppers[i]));
  console.log(JSON.stringify({label: `hit upper delta ${fps}`, deg: +(delta * 180 / Math.PI).toFixed(1)}));
  assert(delta > 8 * Math.PI / 180, `hit overlay did not move the forearm (${(delta * 180 / Math.PI).toFixed(1)}°)`);
}

for (const key of ['jab', 'cross', 'hook', 'heavy', 'special', 'guard']) {
  const duration = {jab: 0.72, cross: 0.82, hook: 0.9, heavy: 0.9, special: 1.2, guard: 0.4}[key];
  const result = runCase(`${key} sprint 60`, 60, duration, t => ({
    state: 'SPRINTING', velocity: v(0, 0, speed), stance: true,
    combat: key === 'guard' ? {key} : (t < duration ? {id: 3, key, time: t, duration} : null),
  }));
  assert(result.names.every(name => name === 'run'), `${key} replaced the run: ${result.names}`);
  assert(result.slip < 0.025, `${key} slip ${(result.slip * 1000).toFixed(1)}mm`);
}

for (const key of Object.keys(dodgeDuration)) {
  const duration = dodgeDuration[key];
  const result = runCase(`${key} idle 60`, 60, duration, t => ({
    state: 'IDLE', velocity: v(0, 0, 0), stance: true,
    combat: {id: 4, key, time: Math.min(t, duration - 1e-4), duration},
  }));
  assert(result.names.includes('combatIdle'), `${key} on idle did not play combatIdle: ${result.names}`);
  assert(!result.names.includes('run'), `${key} on idle kept the sprint clip`);
}
const idleHit = runCase('hit idle 60', 60, 0.4, t => ({
  state: 'IDLE', velocity: v(0, 0, 0), stance: true,
  combat: {id: 5, key: 'hitHead', time: Math.min(t, 0.399), duration: 0.4},
}));
assert(idleHit.names.includes('hitHead'), `idle hit played ${idleHit.names}`);

function forearmAt(samples, time) {
  return samples.clips.reduce((best, item, index) => Math.abs(item.t - time) < Math.abs(best.t - time) ? {t: item.t, q: samples.uppers[index]} : best, {t: Infinity, q: null});
}
function jabDistance(samples, time) {
  const bone = find('rightforearm');
  const clip = c.actions.jab.getClip();
  const track = clip.tracks.find(item => item.name === `${bone.name}.quaternion`);
  const phase = Math.min(0.999, Math.max(0, time - 0.4) / 0.72);
  const authored = new THREE.Quaternion().fromArray(track.createInterpolant().evaluate(phase * clip.duration));
  return forearmAt(samples, time).q.angleTo(authored) * 180 / Math.PI;
}
const earlyPunch = runCase('early roll then jab', 60, 1.2, t => {
  if (t < 0.4) return {state: 'ROLLING', velocity: v(0, 0, 4), recovery: Math.min(0.999, t / 0.7)};
  const jabT = t - 0.4;
  return {state: 'SPRINTING', velocity: v(0, 0, fast), stance: true, combat: jabT < 0.72 ? {id: 6, key: 'jab', time: jabT, duration: 0.72} : null};
});
const earlyRoll = runCase('early roll only', 60, 1.2, t => (
  t < 0.4 ? {state: 'ROLLING', velocity: v(0, 0, 4), recovery: Math.min(0.999, t / 0.7)} : {state: 'SPRINTING', velocity: v(0, 0, fast)}
));
assert(earlyPunch.names.includes('roll') && earlyPunch.names.includes('run'), `early roll clips ${earlyPunch.names}`);
assert(!earlyPunch.names.includes('jab'), `early roll still swapped in a full jab: ${earlyPunch.names}`);
assert(earlyPunch.clips.find(item => item.clip === 'run').release > 0.5, 'early roll release was not the long blend');
const punchAngle = jabDistance(earlyPunch, 0.7);
const rollAngle = jabDistance(earlyRoll, 0.7);
console.log(JSON.stringify({label: 'early roll jab visibility', punchAngle: +punchAngle.toFixed(1), rollAngle: +rollAngle.toFixed(1)}));
assert(punchAngle < 20, `roll recovery hid the jab (${punchAngle.toFixed(1)}° from the punch)`);
assert(rollAngle - punchAngle > 15, `jab upper body matched the plain roll recovery (${punchAngle.toFixed(1)}° vs ${rollAngle.toFixed(1)}°)`);

const latePunch = runCase('late roll then jab', 60, 1.4, t => {
  if (t < 0.62) return {state: 'ROLLING', velocity: v(0, 0, 4), recovery: Math.min(0.999, t / 0.7)};
  const jabT = t - 0.62;
  return {state: 'SPRINTING', velocity: v(0, 0, fast), stance: true, combat: jabT < 0.72 ? {id: 7, key: 'jab', time: jabT, duration: 0.72} : null};
});
assert(!latePunch.names.includes('jab'), `late roll swapped in a full jab: ${latePunch.names}`);
assert(latePunch.clips.find(item => item.clip === 'run').release < 0.2, 'late roll used the long release');

const anchors = [
  {hand: 'left', anchor: new THREE.Vector3(-4, 16, 6), length: 12},
  {hand: 'right', anchor: new THREE.Vector3(4, 15, 6), length: 12},
];
const swing = runCase('swing both webs', 60, 0.7, () => ({state: 'SWINGING', velocity: v(3, 1, 6), webs: anchors, anchor: anchors[0].anchor}));
assert.deepEqual(swing.names, ['swing']);
assert.equal(swing.slips.length, 0, 'swing planted a foot');

const trick = runCase('air trick', 60, 1.05, t => ({
  state: t < 0.5 ? 'JUMPING' : 'FALLING', velocity: v(0, t < 0.5 ? 6 : -8, 2),
  ...(t === 0 ? {air: true} : {}), contact: t < 0.5 ? 0.8 : 0.5,
}));
assert(trick.clips.filter(item => item.t < 0.8).every(item => item.clip === 'airTrick'), `air trick left early: ${trick.names}`);
assert(trick.clips.at(-1).clip === 'drop', `air trick ended on ${trick.clips.at(-1).clip}`);
assert(trick.clips.filter(item => item.t > 0.9).every(item => item.clip === 'drop'), 'air trick retriggered after it finished');

const wallNormal = new THREE.Vector3(0, 0, 1);
const wall = runCase('wall run', 60, 0.8, t => ({
  state: 'WALL_RUNNING', velocity: v(0, 3, 0), wallNormal, position: new THREE.Vector3(0, 1 + t * 3, 0.7),
}));
assert.deepEqual(wall.names, ['wall']);

const mantle = {normal: wallNormal.clone(), edge: new THREE.Vector3(0, 2, 0.7), start: new THREE.Vector3(0, 0.8, 0), end: new THREE.Vector3(0, 2.2, 1.1), elapsed: 0, duration: 0.8, gap: 0.7, height: 2};
const mantleRun = runCase('mantle', 60, 0.8, t => {
  mantle.elapsed = t;
  return {state: 'MANTLING', velocity: v(0, 1, 0.4), wallNormal, mantle, position: new THREE.Vector3(0, 1 + t, 0.4)};
});
assert(mantleRun.names.includes('wall') && mantleRun.names.includes('idle'), `mantle clips ${mantleRun.names}`);

const zip = runCase('web zip', 60, 0.5, () => ({state: 'WEB_ZIP', velocity: v(0, 8, 6), webs: anchors, anchor: anchors[0].anchor}));
assert.deepEqual(zip.names, ['zip']);

const land = runCase('landing', 60, 0.45, () => ({state: 'LANDING', velocity: v(0, 0, 2), landingSpeed: 8}));
assert.deepEqual(land.names, ['land']);
const slam = runCase('slam to landing', 60, 0.9, t => (
  t < 0.45
    ? {state: 'FALLING', velocity: v(0, -16, 1), stance: true, combat: {id: 8, key: 'slam', time: Math.min(t, 0.6), duration: 1}, contact: 0.4}
    : {state: 'LANDING', velocity: v(0, 0, 1), stance: true, combat: {id: 9, key: 'slamLand', time: t - 0.45, duration: 0.7}, landingSpeed: 22}
));
assert(slam.names.includes('slam') && slam.names.includes('slamLand'), `slam clips ${slam.names}`);

for (const turn of ['left', 'right']) {
  const result = runCase(`turn ${turn}`, 60, 0.35, () => ({state: 'TURNING', velocity: v(0, 0, 0.2), turn}));
  assert.deepEqual(result.names, [turn === 'left' ? 'turnLeft' : 'turnRight']);
}
const jump = runCase('jump', 60, 0.35, () => ({state: 'JUMPING', velocity: v(0, 8, 2), contact: 0.6}));
assert.deepEqual(jump.names, ['jump']);
const fall = runCase('fall', 60, 0.35, () => ({state: 'FALLING', velocity: v(0, -14, 2), contact: 0.8}));
assert.deepEqual(fall.names, ['fall']);
const drop = runCase('drop', 60, 0.35, () => ({state: 'FALLING', velocity: v(0, -6, 1), contact: 0.2}));
assert.deepEqual(drop.names, ['drop']);
const walk = runCase('walk', 60, 0.8, () => ({state: 'RUNNING', velocity: v(0, 0, 1.6)}));
assert.deepEqual(walk.names, ['walk']);
assert(walk.slip < 0.025, `walk slip ${(walk.slip * 1000).toFixed(1)}mm`);
const regular = runCase('regular run', 60, 0.8, () => ({state: 'RUNNING', velocity: v(0, 0, 4.8)}));
assert.deepEqual(regular.names, ['regularRun']);
assert(regular.slip < 0.025, `regular run slip ${(regular.slip * 1000).toFixed(1)}mm`);

reset();
for (let i = 0; i < 8; i++) c.update(1 / 60, 'SPRINTING', v(0, 0, speed));
c.combatStance = true;
c.combatAction = {id: 10, key: 'dodgeLeft', time: 0.12, duration: 0.38};
c.group.position.z += speed / 60;
c.update(1 / 60, 'SPRINTING', v(0, 0, speed));
const packet = capturePose({state: 'SPRINTING', velocity: v(0, 0, speed), webs: []}, c);
assert.equal(packet.animation.key, 'run', `sprint dodge replicated ${packet.animation?.key}`);
assert.equal(packet.combat.key, 'dodgeLeft');
const scene = new THREE.Scene();
const player = {id: 'dodge', x: 0, y: 0.1, z: 0, facing: 0};
const remote = new RemoteMotion(scene, c, player, {colliders: [], buildingMeshes: []});
try {
  remote.receive(player, packet, 0);
  remote.update(1 / 60, 0);
  const remoteClip = Object.entries(remote.character.actions).find(([, action]) => action === remote.character.activeAction)?.[0];
  assert.equal(remoteClip, 'run', `remote sprint dodge played ${remoteClip}`);
  assert(remote.character.movingGuardWeight > 0.2, 'remote dodge did not layer the upper body');
} finally { remote.dispose(); }

disposeRig(c);
console.log('PASS motion combinations: gait legs survive dodge, hit, strikes, and roll recovery; traversal clips stay finite');
