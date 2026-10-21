import * as T from 'three';
import {bindTransforms} from './WebHandPose.js';
import {boneId} from './MotionRetarget.js';
import {prepareImpactBody,footSupport} from './CharacterPose.js';

// Falling To Roll is an asymmetric shoulder roll. Keep its contact/recovery
// timing, but use a sagittal forward rotation and paired tucked legs.
export function poseForwardRoll(c) {
  const action=c.actions.roll;if(c.activeAction!==action)return;
  const t=T.MathUtils.clamp(action.time/action.getClip().duration,0,1);
  const ease=(a,b)=>T.MathUtils.smoothstep(t,a,b);
  const tuck=ease(.02,.14)*(1-ease(.48,.86));
  if(c.forwardRollModel!==c.model){c.forwardRollModel=c.model;c.forwardRollBind=bindTransforms(c.model);}
  const find=id=>Object.values(c.bones).find(b=>boneId(b.name)===id);
  const hips=find('hips');if(!hips)return;
  const bind=c.forwardRollBind.get(hips);if(!bind)return;
  c.group.updateMatrixWorld(true);
  const modelRotation=c.model.getWorldQuaternion(new T.Quaternion());
  const right=new T.Vector3(1,0,0).applyQuaternion(modelRotation);
  const spin=new T.Quaternion().setFromAxisAngle(right,Math.PI*2*ease(.02,.55));
  const frame=spin.clone().multiply(modelRotation);
  const parent=hips.parent.getWorldQuaternion(new T.Quaternion());
  hips.quaternion.copy(parent.clone().invert().multiply(spin).multiply(parent).multiply(bind.quaternion));
  hips.updateMatrixWorld(true);
  const center=hips.getWorldPosition(new T.Vector3());
  // The shoulder-roll source lowers the pelvis to a sideways support. A
  // forward tuck needs its center above the back, then rises onto both feet.
  center.y=c.group.getWorldPosition(new T.Vector3()).y+.985-.35*tuck;
  hips.position.copy(hips.parent.worldToLocal(center.clone()));
  hips.updateMatrixWorld(true);
  for(const [side,sign] of [['left',1],['right',-1]]){
    const thigh=find(side+'upleg'),shin=find(side+'leg'),foot=find(side+'foot');
    if(!thigh || !shin || !foot)continue;
    // Discard source axial leg twists before solving a symmetric knee bend.
    for(const bone of [thigh,shin,foot,find(side+'toebase')]){
      const rest=c.forwardRollBind.get(bone);if(rest)bone.quaternion.copy(rest.quaternion);
    }
    c.group.updateMatrixWorld(true);
    const rest=foot.getWorldPosition(new T.Vector3());
    const target=center.clone().add(new T.Vector3(sign*.17,-.30,.28).applyQuaternion(frame));
    target.lerp(rest,1-tuck);
    c.solveLimb(thigh,shin,foot,target,.985,new T.Vector3(sign*.08,0,1).applyQuaternion(frame));
  }
  c.group.updateMatrixWorld(true);
  // Keep the shoulder/back on the support plane throughout the rotation,
  // rather than floating above the source clip's sideways contact height.
  const root=c.group.getWorldPosition(new T.Vector3()),support=footSupport(c,root);
  if(support){
    prepareImpactBody(c);
    const mesh=c.model.getObjectByProperty('isSkinnedMesh',true),point=new T.Vector3();
    let clearance=Infinity;
    for(const vertex of c.impactVertices || []){
      mesh.localToWorld(mesh.applyBoneTransform(vertex,point.fromBufferAttribute(mesh.geometry.attributes.position,vertex)));
      const height=support.height-(support.normal.x*(point.x-root.x)+support.normal.z*(point.z-root.z))/support.normal.y;
      clearance=Math.min(clearance,point.y-height);
    }
    if(Number.isFinite(clearance)){
      const contact=hips.getWorldPosition(new T.Vector3());contact.y+=.012-clearance;
      hips.position.copy(hips.parent.worldToLocal(contact));c.impactLift=0;
      c.group.updateMatrixWorld(true);
    }
  }
}
