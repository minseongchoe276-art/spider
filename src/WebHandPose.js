import * as THREE from 'three';
import {boneId} from './MotionRetarget.js';
import {GROUNDED} from './MotionCatalog.js';

const fingers=['thumb','index','middle','ring','pinky'];
const axis=new THREE.Vector3(1,0,0);

// Use inverse bind matrices, never whichever animated pose happens to be
// visible when a remote character is created.
export function bindTransforms(model) {
  const world=new Map(),local=new Map();
  model?.traverse(node=>{if(node.isSkinnedMesh)node.skeleton.bones.forEach((bone,i)=>{
    if(!world.has(bone))world.set(bone,node.skeleton.boneInverses[i].clone().invert());
  });});
  for(const [bone,matrix] of world){
    const parent=world.get(bone.parent),relative=parent?parent.clone().invert().multiply(matrix):bone.matrix.clone();
    const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();relative.decompose(p,q,s);
    local.set(bone,{position:p,quaternion:q.normalize(),scale:s});
  }
  return local;
}

export function createHandPoseRig(model,bones) {
  const bind=bindTransforms(model),rig={left:[],right:[]};
  for(const side of ['left','right'])for(const finger of fingers)for(let joint=1;joint<=3;joint++){
    const bone=Object.values(bones || {}).find(b=>boneId(b.name)===side+'hand'+finger+joint);
    if(bone)rig[side].push({bone,finger,joint,rest:(bind.get(bone)?.quaternion || bone.quaternion).clone()});
  }
  return rig;
}

function targetRotation(item,shoot,grip,relaxed) {
  const {rest,finger,joint}=item;
  // The Mixamo digit chains run along +Y and flex toward the palm at +Z.
  // Both mirrored hands use the same flexion sign in their own local frame.
  const folded=[1.22,1.62,.82],loose=[.22,.28,.12];
  const thwip=finger==='middle' || finger==='ring';
  let angle=(thwip?folded[joint-1]:0)*shoot+folded[joint-1]*grip+loose[joint-1]*relaxed;
  if(finger==='thumb')angle=[.12,.32,.18][joint-1]*shoot+[.3,.65,.45][joint-1]*grip+.12*relaxed;
  const base=joint===1?rest.clone():new THREE.Quaternion();
  return base.multiply(new THREE.Quaternion().setFromAxisAngle(axis,angle)).normalize();
}

export function restoreHandPose(rig) {
  if(!rig)return;
  for(const side of ['left','right'])for(const item of rig[side])if(item.authored){
    item.bone.quaternion.copy(item.authored);item.authored=null;
  }
}

export function applyHandPose(rig,side,shoot=0,grip=0,{absolute=false,relaxed=0}={}) {
  const weight=THREE.MathUtils.clamp(shoot+grip,0,1);
  for(const item of rig?.[side] || []){
    if(!absolute && weight<1e-5)continue;
    if(!absolute)item.authored=item.bone.quaternion.clone();
    const target=targetRotation(item,shoot,grip,relaxed);
    if(absolute)item.bone.quaternion.copy(target);
    else item.bone.quaternion.slerp(target,weight);
  }
}

export function updateWebHandPose(c,delta,state) {
  c.webFingerRig ||= createHandPoseRig(c.model,c.bones);
  c.webGestures ||= {};
  const combatKey=c.combatAction?.key || (c.combatStance && GROUNDED.includes(state)?'combatIdle':null);
  const blocked=['WALL_RUNNING','MANTLING'].includes(state) || !!combatKey;
  for(const side of ['left','right']){
    const attached=c.webAttachments?.some(web=>web.hand===side);
    const shooting=!blocked && ((c.webLaunchTimers?.[side] || 0)>0 || (c.currentHand===side && c.webShotTimer>0));
    const gripping=!blocked && attached && !shooting;
    const pose=c.webGestures[side] ||= {shoot:0,grip:0};
    pose.shoot=THREE.MathUtils.damp(pose.shoot,shooting?1:0,40,Math.max(0,delta));
    pose.grip=THREE.MathUtils.damp(pose.grip,gripping?1:0,24,Math.max(0,delta));
    const total=pose.shoot+pose.grip;
    if(total>1){pose.shoot/=total;pose.grip/=total;}
    if(!blocked)applyHandPose(c.webFingerRig,side,pose.shoot,pose.grip);
    else if(['WALL_RUNNING','MANTLING'].includes(state))applyHandPose(c.webFingerRig,side,0,0,{absolute:true,relaxed:.12});
    else if(['jab','cross','hook','heavy','special','guard','combatIdle'].includes(combatKey))applyHandPose(c.webFingerRig,side,0,1,{absolute:true});
  }
}
