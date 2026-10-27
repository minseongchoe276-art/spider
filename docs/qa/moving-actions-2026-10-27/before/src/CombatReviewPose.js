import * as THREE from 'three';
import {ATTACKS} from './Combat.js';
import {heavyClipPhase} from './CharacterPose.js';

// The slider measures gameplay time. The default sample instead targets the
// source clip's contact pose, including heavy's deliberately delayed wind-up.
export function combatReviewPhase(key, clip, phase) {
  if (phase != null) return THREE.MathUtils.clamp(phase, 0, 1);
  const impact = clip.userData?.impactPhase ?? .45;
  if (key !== 'heavy') return impact;
  let low = 0, high = 1;
  for (let i = 0; i < 32; i++) {
    const mid = (low + high) / 2;
    if (heavyClipPhase(mid) < impact) low = mid; else high = mid;
  }
  return (low + high) / 2;
}

export function sampleCombatReviewPose(character, {key, phase, speed = 0, id}) {
  character.stopAnimation();
  character.fadeToAction(key, 0);
  const clip = character.actions[key].getClip();
  const fraction = combatReviewPhase(key, clip, phase);
  const duration = ATTACKS[key]?.duration || clip.duration;
  const airborne = key === 'slam', landing = key === 'slamLand';
  if (airborne || landing) speed = 0;
  const velocity = new THREE.Vector3(0, 0, -speed);
  const state = airborne ? 'FALLING' : landing ? 'LANDING'
    : speed > 5 ? 'SPRINTING' : speed ? 'RUNNING' : 'IDLE';
  character.targetFacingAngle = character.visualYaw = Math.PI;
  character.combatStance = true;
  // Keep legacy review-only clips under their own key. Aliasing rightHook to
  // cross here made Character.update silently replace the selected animation.
  character.combatAction = {id, key, duration, time: fraction * duration};
  for (let i = 0; i < (speed ? 45 : 1); i++) {
    character.group.position.addScaledVector(velocity, 1 / 60);
    character.update(speed ? 1 / 60 : 0, state, velocity);
  }
  return {key, fraction, state, active: character.activeAction?.getClip().name};
}
