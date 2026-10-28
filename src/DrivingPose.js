import * as T from 'three';
import {applyHandPose,createHandPoseRig} from './WebHandPose.js';
import {boneId} from './MotionRetarget.js';
const joint=(c,id)=>Object.values(c.bones||{}).find(b=>boneId(b.name)===id);
export function poseDriver(c,asset,steering=0,blend=1,standing=null,standingFacing=0){
 if(!c.model)return;
 c.rememberRestPose?.();
 for(const {bone,p,q,s} of c.drivingBasePose||c.restBonePose||[]){bone.position.copy(p);bone.quaternion.copy(q);bone.scale.copy(s);}
 c.model.position.set(0,0,0);c.model.rotation.set(0,0,0);const drivingRotation=asset.visual.getWorldQuaternion(new T.Quaternion());c.group.quaternion.copy(drivingRotation);if(standing)c.group.quaternion.slerpQuaternions(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),standingFacing),drivingRotation,blend);
 c.group.updateMatrixWorld(true);const hips=joint(c,'hips');if(!hips)return;
 const seat=asset.visual.localToWorld(asset.seat.clone()),hip=hips.getWorldPosition(new T.Vector3());
 const root=c.group.position.clone().add(seat.sub(hip));if(standing)root.lerp(standing,1-blend);c.group.position.copy(root);c.group.updateMatrixWorld(true);
 const spine=joint(c,'spine');if(spine)spine.rotateX(.06*blend);
 c.group.updateMatrixWorld(true);
 const forward=new T.Vector3(0,0,1).applyQuaternion(c.group.quaternion),outward=new T.Vector3(1,0,0).applyQuaternion(c.group.quaternion);
 for(const [i,side] of ['left','right'].entries()){
  const upper=joint(c,side+'upleg'),lower=joint(c,side+'leg'),foot=joint(c,side+'foot');
  if(upper&&lower&&foot){const footRotation=foot.getWorldQuaternion(new T.Quaternion());const target=asset.visual.localToWorld(asset.pedals[i].clone());target.lerp(foot.getWorldPosition(new T.Vector3()),1-blend);c.solveLimb?.(upper,lower,foot,target,.995,forward);foot.quaternion.copy(foot.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(footRotation));foot.updateMatrixWorld(true);}
  const arm=joint(c,side+'arm'),elbow=joint(c,side+'forearm'),hand=joint(c,side+'hand');
  if(arm&&elbow&&hand){const sign=i===0?1:-1,a=steering*.65;const offset=new T.Vector3(sign*.15*Math.cos(a),sign*.15*Math.sin(a),0);const target=asset.visual.localToWorld(asset.wheel.clone().add(offset));target.lerp(hand.getWorldPosition(new T.Vector3()),1-blend);c.solveLimb?.(arm,elbow,hand,target,.99,outward.clone().multiplyScalar(sign));}
 }
 c.webFingerRig ||= createHandPoseRig(c.model,c.bones);for(const side of ['left','right'])applyHandPose(c.webFingerRig,side,0,.6*blend,{absolute:true});
 c.group.updateMatrixWorld(true);c.model.traverse(n=>n.skeleton?.update());
}

export function prepareDriver(c){
 c.stopAnimation?.();c.combatStance=false;const idle=c.actions?.idle;
 if(idle){idle.reset().setEffectiveWeight(1).play();c.mixer?.update(0);c.drivingBasePose=Object.values(c.bones||{}).map(bone=>({bone,p:bone.position.clone(),q:bone.quaternion.clone(),s:bone.scale.clone()}));c.mixer?.stopAllAction();}
}
export function releaseDriver(c,yaw=0){delete c.drivingBasePose;c.stopAnimation?.();c.group.quaternion.identity();if(c.model)c.model.rotation.y=yaw;c.targetFacingAngle=c.visualYaw=yaw;}
