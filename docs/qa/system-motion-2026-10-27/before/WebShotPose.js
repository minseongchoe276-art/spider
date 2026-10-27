import * as THREE from 'three';
import {boneId} from './MotionRetarget.js';

// Apply the shot above the locomotion pose, before wrist aiming and foot IK.
// World-space axes keep the gesture consistent across mirrored rigs and yaw.
function turn(bone,axis,angle){
  if(!bone || Math.abs(angle)<1e-6)return;
  const local=axis.clone().applyQuaternion(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
  bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(local,angle)).normalize();
  bone.updateMatrixWorld(true);
}
export function poseWebShotBody(c,delta,state){
  const allowed=['IDLE','RUNNING','SPRINTING','JUMPING','FALLING','SWINGING','WEB_ZIP'].includes(state) && !c.combatStance && !c.combatAction?.duration && !c.airTrick && !c.isTricking;
  const body=c.webShotBody ||= {yaw:0,pitch:0,lead:0};
  if(!allowed){body.yaw=body.pitch=body.lead=0;return;}
  const targets=[];
  for(const side of ['left','right']){
    const shot=(c.webLaunchTimers?.[side] || 0)>0 || (c.currentHand===side && c.webShotTimer>0);
    const target=(shot && c.currentHand===side?c.webShotAnchor:null) || c.webAttachments?.find(web=>web.hand===side)?.anchor;
    if(target)targets.push({side,target,shot});
  }
  let yaw=0,pitch=0,lead=0;
  if(targets.length){
    const center=c.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,1.35,0));
    const direction=new THREE.Vector3();
    for(const item of targets){
      const aim=item.target.clone().sub(center).normalize();direction.add(aim);
      // The shooting shoulder leads; the opposite shoulder follows the chest.
      lead+=(item.side==='left'?1:-1)*(item.shot ? .16 : .055);
    }
    direction.normalize();
    const forward=new THREE.Vector3(0,0,1).applyQuaternion(c.model.getWorldQuaternion(new THREE.Quaternion()));
    yaw=Math.atan2(direction.x,direction.z)-Math.atan2(forward.x,forward.z);
    yaw=Math.atan2(Math.sin(yaw),Math.cos(yaw));
    yaw=THREE.MathUtils.clamp(yaw,-.42,.42)+lead;
    pitch=-THREE.MathUtils.clamp(direction.y,-.5,.8)*.16;
    if(targets.some(item=>item.shot))pitch-=.035;
  }
  const rate=targets.length?15:10,dt=Math.max(0,delta);
  body.yaw=THREE.MathUtils.damp(body.yaw,yaw,rate,dt);
  body.pitch=THREE.MathUtils.damp(body.pitch,pitch,rate,dt);
  body.lead=THREE.MathUtils.damp(body.lead,lead,rate,dt);
  const find=id=>Object.values(c.bones || {}).find(b=>boneId(b.name)===id);
  const right=new THREE.Vector3(1,0,0).applyQuaternion(c.model.getWorldQuaternion(new THREE.Quaternion()));
  for(const [id,share] of [['spine',.25],['spine1',.4],['spine2',.35]]){
    const bone=find(id);turn(bone,new THREE.Vector3(0,1,0),body.yaw*share);turn(bone,right,body.pitch*share);
  }
  for(const side of ['left','right'])turn(find(side+'shoulder'),new THREE.Vector3(0,1,0),body.lead*.35);
}
