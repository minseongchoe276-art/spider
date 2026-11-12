import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadMotionRig, disposeRig} from './lib/motion-rig.mjs';

const {actor} = await loadMotionRig();
for (const fps of [24, 60, 144]) {
  for (const type of ['baseball-bat', 'metal-pipe', 'sniper-rifle']) {
    const c = actor(), rifle = type === 'sniper-rifle';
    try {
      c.extraWeapon = type;
      c.extraWeaponVisible = true;
      c.extraWeapons = {[type]: new THREE.Group()};
      c.rightHand.add(c.extraWeapons[type]);
      c.gunVisible = rifle;
      c.combatStance = true;
      c.combatAction = {key: rifle ? 'gunIdle' : 'combatIdle'};
      for (let i = 0; i < fps; i++) c.update(1 / fps, 'IDLE', new THREE.Vector3());
      if (rifle) assert.equal(c.activeAction, c.actions.rifleIdle, 'rifle should use its own aim take');
      else assert.equal(c.movingStrikeToken, 'meleeHold', 'melee weapon should use its own ready pose');
      const key = rifle ? 'gunFire' : 'heavy';
      const duration = rifle ? .42 : 1.05;
      for (let i = 0; i < Math.ceil(duration * fps); i++) {
        c.combatAction = {id: 1, key, time: i / fps, duration};
        c.update(1 / fps, 'IDLE', new THREE.Vector3());
        assert.equal(c.activeAction, c.actions[rifle ? 'rifleFire' : 'weaponSwing']);
        for (const bone of Object.values(c.bones)) assert(bone.quaternion.toArray().every(Number.isFinite));
      }
      c.combatAction = {id: 2, key, time: .1, duration, travel: true};
      c.update(1 / fps, 'RUNNING', new THREE.Vector3(0, 0, 4));
      assert.equal(c.movingStrikeToken, 2, 'moving attack should layer over the stride');
      if (!rifle) {
        c.combatAction = null;
        c.update(1 / fps, 'JUMPING', new THREE.Vector3(0, 4, 2));
        assert.equal(c.activeAction, c.actions.jump, 'jump should keep its own motion');
        assert.equal(c.airGuardWeight, 0, 'melee swing pose must not overwrite the airborne motion');
        c.extraWeaponVisible = false;
        c.combatAction = {id: 3, key: 'heavy', time: .1, duration};
        c.update(1 / fps, 'IDLE', new THREE.Vector3());
        assert.equal(c.activeAction, c.actions.heavy, 'unarmed heavy attack should not select the weapon swing');
      }
    } finally { disposeRig(c); }
  }
  console.log(`PASS ${fps} FPS weapon-specific idle, attack and moving attack`);
}
