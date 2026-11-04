import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadMotionRig,joint,disposeRig} from './lib/motion-rig.mjs';
import {loadRuntimeSkin,useRuntimeSkin} from './lib/runtime-skin.mjs';
import {soleSamples} from '../src/CharacterPose.js';

const {actor}=await loadMotionRig(),speed=6.5;
for(const fps of [24,60,144])for(const mode of ['web','combat']){
  const c=actor();useRuntimeSkin(c,await loadRuntimeSkin(mode));
  const previous={},previousQ={};let minimum=Infinity,maxStep=0,maxJointRate=0;
  try{
    for(let frame=0;frame<Math.ceil(fps*1.2);frame++){
      c.group.position.z+=speed/fps;c.combatStance=true;
      c.combatAction={id:1,key:'special',time:frame/fps,duration:1.2};
      c.update(1/fps,'SPRINTING',new THREE.Vector3(0,0,speed));
      for(const {bone,rest,limit} of c.jointConstraints || [])assert(rest.angleTo(bone.quaternion)<=limit+1e-3,`${mode} ${fps} FPS: joint limit ${bone.name}`);
      for(const side of ['left','right']){
        const bone=joint(c,side+'foot'),position=bone.getWorldPosition(new THREE.Vector3());
        if(previousQ[side])maxJointRate=Math.max(maxJointRate,THREE.MathUtils.radToDeg(previousQ[side].angleTo(bone.quaternion))*fps);
        previousQ[side]=bone.quaternion.clone();
        if(previous[side])maxStep=Math.max(maxStep,position.distanceTo(previous[side]));
        previous[side]=position.clone();
        for(const {mesh,vertex} of soleSamples(c,side)){
          const point=mesh.localToWorld(mesh.applyBoneTransform(vertex,new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,vertex)));
          minimum=Math.min(minimum,point.y);
        }
      }
    }
    assert(minimum>=-.005,`${mode} ${fps} FPS: sole penetration ${minimum.toFixed(4)}m`);
    assert(maxStep<(speed+3)/fps+.03,`${mode} ${fps} FPS: foot step ${maxStep.toFixed(4)}m`);
    assert(maxJointRate<240.1,`${mode} ${fps} FPS: ankle rate ${maxJointRate.toFixed(1)}deg/s`);
    console.log(`PASS ${mode} ${fps} FPS: minimum sole ${minimum.toFixed(4)}m, max foot step ${maxStep.toFixed(4)}m`);
  }finally{disposeRig(c);}
}
