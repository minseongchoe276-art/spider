import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadMotionRig, disposeRig} from './lib/motion-rig.mjs';
import {MOTIONS} from '../src/MotionCatalog.js';

const {actor} = await loadMotionRig(), c = actor();
const bones = Object.values(c.bones), keys = MOTIONS.map(m => m.key);
const folder = process.env.MOTION_STRESS_DIR || 'docs/qa/motion-adversarial-2026-10-25';
fs.mkdirSync(folder, {recursive:true});
const result = {cases:0, hardCuts:0, samples:0, maxWeightError:0, maxInstantPositionChange:0,
  maxInstantRotationChange:0, maxContributors:0, clockRebases:0, failures:[]};
const pose = () => bones.map(b => ({p:b.position.clone(), q:b.quaternion.clone()}));
function check(label) {
  const contributors = [...Object.values(c.actions), c.transitionPoseAction]
    .filter(a => a?.isScheduled() && a.getEffectiveWeight() > 1e-7);
  const weight = contributors.reduce((sum,a) => sum+a.getEffectiveWeight(),0);
  result.maxWeightError = Math.max(result.maxWeightError, Math.abs(1-weight));
  result.maxContributors = Math.max(result.maxContributors, contributors.length);
  assert(Math.abs(1-weight)<2e-5, `${label}: pose weights sum to ${weight}; bind pose leaks into the transition`);
  assert(contributors.length<=2, `${label}: ${contributors.length} overlapping poses`);
  for (const b of bones) {
    assert([...b.position, ...b.quaternion].every(Number.isFinite), `${label}: non-finite bone`);
    assert(Math.abs(b.quaternion.length()-1)<1e-4, `${label}: non-unit rotation`);
  }
  result.samples++;
}
function run(from, via, to, delay=.04, step=.07, clock=0) {
  const label = `${from} → ${via} → ${to} (${delay}/${step}, clock ${clock})`;
  c.stopAnimation();
  c.fadeToAction(from,0); c.mixer.update(.1);
  c.mixer.time=clock;
  c.fadeToAction(via,.18); c.mixer.update(delay);
  const before=pose();
  c.fadeToAction(to,.18); c.mixer.update(0);
  for(let i=0;i<bones.length;i++) {
    const gap=before[i].p.distanceTo(bones[i].position),angle=before[i].q.clone().normalize().angleTo(bones[i].quaternion.clone().normalize());
    result.maxInstantPositionChange=Math.max(result.maxInstantPositionChange,gap);
    result.maxInstantRotationChange=Math.max(result.maxInstantRotationChange,angle);
    assert(gap<1e-5 && angle<1e-5,`${label}: instantaneous pose jump ${gap}m / ${angle}rad`);
  }
  check(label);
  c.mixer.update(step); check(label);
  c.mixer.update(.25); check(label);
  assert.equal(c.activeAction,c.actions[to]);
  assert(c.actions[to].getEffectiveWeight()>.999,`${label}: destination never fully owns pose`);
  if(clock>60)result.clockRebases++;
  result.cases++;
}
try {
  // Every ordered triple with distinct neighboring actions, including A→B→A.
  for(const from of keys)for(const via of keys)if(from!==via)for(const to of keys)if(to!==via)
    run(from,via,to);
  // Early, late, jittered/slow render ticks, and a long-running mixer clock.
  for(const [delay,step,clock] of [[1/144,1/144,0],[1/24,1/24,0],[.15,1/30,0],[.01,.1,0],[.08,.037,7200]])
    for(const from of keys)for(const via of keys)if(from!==via)run(from,via,from,delay,step,clock);
  // Explicit zero-duration overrides must retire every older fade as well.
  for(const from of keys)for(const via of keys)if(from!==via)for(const to of keys)if(to!==via){
    c.stopAnimation();c.fadeToAction(from,0);c.mixer.update(.1);
    c.fadeToAction(via,.18);c.mixer.update(.04);
    c.fadeToAction(to,0);c.mixer.update(0);check(`hard cut ${from} → ${via} → ${to}`);
    assert.equal([...Object.values(c.actions),c.transitionPoseAction].filter(a=>a?.isScheduled()).length,1);
    result.hardCuts++;
  }
  console.log(`PASS ${result.cases} interrupted transitions + ${result.hardCuts} hard cuts / ${result.samples} samples; weight error ${result.maxWeightError}`);
} catch(error) {
  result.failures.push(error.message); process.exitCode=1; console.error(error);
} finally {
  fs.writeFileSync(folder+'/interruptions.json',JSON.stringify(result,null,2)+'\n'); disposeRig(c);
}
