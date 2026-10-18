import * as THREE from 'three';
import {bindTransforms} from './WebHandPose.js';
import {boneId} from './MotionRetarget.js';

// Limits are relative to the mesh's bind axes, not the world or a sampled
// animation frame. An IK contact must never turn a wrist/ankle inside out.
export const JOINT_LIMITS = Object.freeze({hand:70,foot:35,toebase:15});
export function createJointConstraints(model,bones) {
  const bind=bindTransforms(model);
  return Object.values(bones || {}).flatMap(bone=>{
    const kind=boneId(bone.name).match(/^(?:left|right)(hand|foot|toebase)$/)?.[1];
    const rest=bind.get(bone)?.quaternion;
    return kind && rest?[{bone,kind,rest:rest.clone(),limit:THREE.MathUtils.degToRad(JOINT_LIMITS[kind])}]:[];
  });
}
export function constrainJoints(rig) {
  for(const {bone,rest,limit} of rig || []) {
    let angle=rest.angleTo(bone.quaternion);
    if(angle>limit && bone.parent?.isBone && kindSafe(bone)) {
      // Redistribute axial twist into the forearm/shin. Rolling around the
      // child offset preserves the contact point and its world orientation.
      const desired=bone.getWorldQuaternion(new THREE.Quaternion());
      const difference=bone.quaternion.clone().multiply(rest.clone().invert());
      const axis=bone.position.clone().normalize();
      const along=difference.x*axis.x+difference.y*axis.y+difference.z*axis.z;
      const twist=2*Math.atan2(along,difference.w);
      bone.parent.rotateOnAxis(axis,twist);bone.parent.updateMatrixWorld(true);
      bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(desired)).normalize();
      angle=rest.angleTo(bone.quaternion);
    }
    if(angle>limit)bone.quaternion.slerpQuaternions(rest,bone.quaternion.clone(),limit/angle).normalize();
    bone.updateMatrixWorld(true);
  }
}

function kindSafe(bone){return /(?:foot|hand)$/.test(boneId(bone.name));}
