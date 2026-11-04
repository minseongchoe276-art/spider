import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadMotionRig, point, disposeRig} from './lib/motion-rig.mjs';

const {actor}=await loadMotionRig();
for(const fps of [60,144]) for(const state of ['JUMPING','ROLLING']) {
  const c=actor();
  try {
    c.gunModel=new THREE.Group();
    c.rightHand.add(c.gunModel);
    c.gunVisible=true;
    c.combatStance=true;
    for(let i=0;i<fps;i++) {
      c.combatAction={key:'gunIdle'};
      c.update(1/fps,'IDLE',new THREE.Vector3(),null);
    }
    let previous=point(c,'righthand').sub(point(c,'hips')), maxStep=0;
    c.combatAction=null;
    for(let i=0;i<Math.ceil(fps*.3);i++) {
      c.update(1/fps,state,new THREE.Vector3(0,3,0),null);
      const current=point(c,'righthand').sub(point(c,'hips'));
      maxStep=Math.max(maxStep,current.distanceTo(previous));
      previous=current;
      for(const {bone,rest,limit} of c.jointConstraints || [])
        assert(rest.angleTo(bone.quaternion)<=limit+1e-3,`${state}: joint limit ${bone.name}`);
    }
    // This caught the one-frame loss of the aiming IK at 144 FPS.
    if(fps===144 && state==='JUMPING') assert(maxStep<.06,`aim release hand jump ${maxStep}m`);
    assert(c.pistolAimWeight<.01,`${state}: aiming correction did not release`);
    console.log(`PASS ${fps} FPS ${state}: maximum hand step ${(maxStep*100).toFixed(1)} cm`);
  } finally { disposeRig(c); }
}
