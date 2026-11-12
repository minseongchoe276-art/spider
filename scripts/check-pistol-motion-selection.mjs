import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadMotionRig, point, disposeRig} from './lib/motion-rig.mjs';

const {actor}=await loadMotionRig();
for(const fps of [24,60,144]) {
  const c=actor();
  try {
    c.gunModel=new THREE.Group(); c.rightHand.add(c.gunModel);
    c.gunVisible=true; c.combatStance=true;
    for(let i=0;i<fps;i++) {
      c.combatAction={key:'gunIdle'};
      c.update(1/fps,'IDLE',new THREE.Vector3(),null);
    }
    assert.equal(c.activeAction,c.actions.gunIdle,'Standing gun must use the imported take');
    assert(point(c,'lefthand').distanceTo(point(c,'righthand'))<.12,'Support hand is too far from the pistol hand');
    const before=c.activeAction.time;
    c.combatAction={key:'gunFire',id:1,time:.1,duration:.42};
    c.update(1/fps,'IDLE',new THREE.Vector3(),null);
    assert.equal(c.activeAction,c.actions.gunIdle,'Firing must retain the aiming take');
    assert(c.activeAction.time>before,'Firing must not restart the aiming loop');
    assert.notEqual(c.activeAction.time,c.actions.gunIdle.getClip().duration*.1/.42,'Shot must not scrub the idle clip');
    assert(Number.isFinite(before));
    c.combatAction={key:'gunIdle'};
    for(let i=0;i<Math.ceil(fps*.4);i++)c.update(1/fps,'RUNNING',new THREE.Vector3(0,0,4),null);
    assert(c.strikeLayers?.has(c.actions.gunIdle.getClip()),'Moving gun must layer the imported take');
    assert(point(c,'lefthand').distanceTo(point(c,'righthand'))<.12,'Moving support hand is too far from the pistol hand');
    c.combatAction=null;c.update(1/fps,'JUMPING',new THREE.Vector3(0,3,0),null);
    assert.equal(c.airGuardClip,c.actions.gunIdle.getClip(),'Airborne gun must use the imported arms');
    console.log(`PASS ${fps} FPS: pistol idle, fire, running layer and airborne guard`);
  } finally {disposeRig(c);}
}
