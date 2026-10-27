import * as THREE from 'three';
import {bindTransforms} from './WebHandPose.js';
import {boneId} from './MotionRetarget.js';

// Limits are relative to the mesh's bind axes, not the world or a sampled
// animation frame. An IK contact must never turn a wrist/ankle inside out.
export const JOINT_LIMITS = Object.freeze({hand:12,foot:18,toebase:5});
export const JOINT_SPEEDS = Object.freeze({hand:180,foot:240,toebase:90});
export function createJointConstraints(model,bones) {
  const bind=bindTransforms(model);
  return Object.values(bones || {}).flatMap(bone=>{
    const kind=boneId(bone.name).match(/^(?:left|right)(hand|foot|toebase)$/)?.[1];
    let rest=bind.get(bone)?.quaternion.clone();
    if(kind==='hand' && rest){
      // The imported bind hand is already bent by 13–18 degrees. Center the
      // limit on a straight forearm/knuckle line, not that bent source pose.
      const middle=bone.children.find(child=>boneId(child.name).endsWith('handmiddle1'));
      const finger=middle && bind.get(middle)?.position.clone().normalize().applyQuaternion(rest);
      if(finger)rest.premultiply(new THREE.Quaternion().setFromUnitVectors(finger,bone.position.clone().normalize())).normalize();
    }
    return kind && rest?[{bone,kind,rest:rest.clone(),limit:THREE.MathUtils.degToRad(JOINT_LIMITS[kind])}]:[];
  });
}
export function constrainJoints(rig) {
  for(const {bone,rest,limit} of rig || []) {
    const angle=rest.angleTo(bone.quaternion);
    if(angle>limit)bone.quaternion.slerpQuaternions(rest,bone.quaternion.clone(),limit/angle).normalize();
    bone.updateMatrixWorld(true);
  }
}

// Run after every IK/contact/gesture pass. A limit before those passes does
// not constrain what the renderer actually receives. Never transfer excess
// wrist/ankle rotation into a forearm/shin: that produced visible skin twists.
export function stabilizeEndJoints(character,delta) {
  let changedSoles=false;
  if(character.endJointModel!==character.model){
    character.endJointModel=character.model;character.endJointPose=new Map();
  }
  for(const {bone,kind,rest,limit} of character.jointConstraints || []){
    const before=bone.quaternion.clone();
    bone.quaternion.normalize();
    const angle=rest.angleTo(bone.quaternion);
    if(angle>limit)bone.quaternion.slerpQuaternions(rest,bone.quaternion.clone(),limit/angle).normalize();
    const previous=character.endJointPose.get(bone);
    if(previous && delta>0)bone.quaternion.copy(previous.clone().rotateTowards(bone.quaternion,THREE.MathUtils.degToRad(JOINT_SPEEDS[kind])*delta)).normalize();
    character.endJointPose.set(bone,bone.quaternion.clone());bone.updateMatrixWorld(true);
    if(kind!=='hand' && before.angleTo(bone.quaternion)>1e-5)changedSoles=true;
  }
  return changedSoles;
}
