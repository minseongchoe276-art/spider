// Technical motion audit. Visual judgments are not made here.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { MOTIONS } from '../../src/MotionCatalog.js';
import { loadMotionRig, point, disposeRig } from '../lib/motion-rig.mjs';

const outDir = 'docs/qa/quality-director-2026-10-28';
fs.mkdirSync(outDir, { recursive: true });
const claimed = 57;
const files = fs.readdirSync('public/motions').filter(name => name.endsWith('.json') && name !== 'manifest.json');
const manifest = JSON.parse(fs.readFileSync('public/motions/manifest.json', 'utf8'));
const { actor, clips } = await loadMotionRig();
const playable = clips.filter(clip => !clip.archived && clip.key !== 'default');

function flexion(character, hip, knee, ankle) {
  const a = point(character, hip);
  const b = point(character, knee);
  const c = point(character, ankle);
  const u = a.clone().sub(b).normalize();
  const v = c.clone().sub(b).normalize();
  const dot = THREE.MathUtils.clamp(u.dot(v), -1, 1);
  return THREE.MathUtils.radToDeg(Math.acos(dot));
}

const results = [];
for (const item of playable) {
  const character = actor();
  const phases = [];
  try {
    const missing = [];
    for (const id of ['hips', 'leftfoot', 'rightfoot', 'lefthand', 'righthand']) {
      try { point(character, id); } catch { missing.push(id); }
    }
    if (missing.length) throw new Error(`Missing bones: ${missing.join(', ')}`);
    character.fadeToAction(item.key, 0);
    const clip = character.activeAction.getClip();
    const frames = Math.max(2, Math.ceil(clip.duration * 30));
    const lengths = Object.values(character.bones).map(bone => bone.position.length());
    let maxSpeed = 0;
    let last = null;
    let peak = { speed: -1, phase: 0 };
    const samples = [];
    for (let frame = 0; frame <= frames; frame++) {
      const phase = frame / frames;
      character.activeAction.enabled = true;
      character.activeAction.paused = false;
      character.activeAction.time = Math.min(clip.duration * phase, Math.max(0, clip.duration - 1e-4));
      character.mixer.update(0);
      character.group.updateMatrixWorld(true);
      for (const [index, bone] of Object.values(character.bones).entries()) {
        if (!bone.position.toArray().every(Number.isFinite) || Math.abs(bone.quaternion.length() - 1) > 1e-3) {
          throw new Error(`Non-finite or non-unit bone ${bone.name} at ${phase.toFixed(2)}`);
        }
        if (!bone.name.toLowerCase().includes('hips') && Math.abs(bone.position.length() - lengths[index]) > 1e-3) {
          throw new Error(`Limb length changed on ${bone.name}`);
        }
      }
      const hips = point(character, 'hips');
      const leftFoot = point(character, 'leftfoot');
      const rightFoot = point(character, 'rightfoot');
      const marks = [hips, leftFoot, rightFoot, point(character, 'lefthand'), point(character, 'righthand')];
      let speed = 0;
      if (last) speed = Math.max(...marks.map((mark, index) => mark.distanceTo(last[index]) * frames / Math.max(clip.duration, 1e-4)));
      last = marks;
      maxSpeed = Math.max(maxSpeed, speed);
      if (speed > peak.speed) peak = { speed, phase };
      samples.push({
        phase: +phase.toFixed(3),
        hipsY: +hips.y.toFixed(3),
        leftFootY: +leftFoot.y.toFixed(3),
        rightFootY: +rightFoot.y.toFixed(3),
        leftKnee: +flexion(character, 'leftupleg', 'leftleg', 'leftfoot').toFixed(1),
        rightKnee: +flexion(character, 'rightupleg', 'rightleg', 'rightfoot').toFixed(1),
        extremitySpeed: +speed.toFixed(2),
      });
    }
    if (maxSpeed >= 30) throw new Error(`Extremity speed ${maxSpeed.toFixed(2)} m/s exceeds 30`);
    const wanted = [0, 0.15, 0.5, peak.phase, 0.82, 0.98];
    for (const phase of wanted) {
      phases.push(samples.reduce((best, sample) => Math.abs(sample.phase - phase) < Math.abs(best.phase - phase) ? sample : best));
    }
    const unmatched = (clip.tracks || []).filter(track => {
      const name = track.name.split('.')[0];
      return !Object.keys(character.bones).some(bone => bone === name || bone.endsWith(name));
    }).length;
    results.push({
      key: item.key,
      duration: +clip.duration.toFixed(3),
      frames: frames + 1,
      technical: 'TECHNICAL_PASS',
      visual: 'UNVERIFIED',
      maxExtremitySpeed: +maxSpeed.toFixed(2),
      peakPhase: +peak.phase.toFixed(3),
      unmatchedTracks: unmatched,
      phases,
    });
    console.log('TECHNICAL_PASS', item.key);
  } catch (error) {
    results.push({ key: item.key, technical: 'FAIL', visual: 'UNVERIFIED', error: error.message, phases });
    console.error('FAIL', item.key, error.message);
  } finally {
    disposeRig(character);
  }
}

const archived = clips.filter(clip => clip.archived).map(clip => clip.key);
const report = {
  claimedAnimationCount: claimed,
  manifestCount: manifest.count,
  motionCatalogCount: MOTIONS.length,
  compiledJsonCount: files.length,
  archivedNotInCatalog: archived,
  comparedWithClaimed57: {
    catalogMinus57: MOTIONS.length - claimed,
    note: 'The live catalog is the source of truth. 57 was not found in public/motions or MotionCatalog.',
  },
  technicalPass: results.filter(item => item.technical === 'TECHNICAL_PASS').length,
  technicalFail: results.filter(item => item.technical === 'FAIL').length,
  visualPass: 0,
  visualUnverified: results.length,
  results,
};
fs.writeFileSync(path.join(outDir, 'motion-technical.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  catalog: MOTIONS.length,
  json: files.length,
  manifest: manifest.count,
  pass: report.technicalPass,
  fail: report.technicalFail,
}, null, 2));
if (report.technicalFail) process.exitCode = 1;
