import * as T from 'three';
import {constrainJoints} from './JointConstraints.js';
import {boneId} from './MotionRetarget.js';
import {clearImpactBody,fitGroundAnkle} from './CharacterPose.js';

const joint=(c,id)=>Object.values(c.bones).find(b=>boneId(b.name)===id);
const point=b=>b.getWorldPosition(new T.Vector3());
function shift(b,world){
  b.position.add(world.applyQuaternion(b.parent.getWorldQuaternion(new T.Quaternion()).invert())
    .divide(b.parent.getWorldScale(new T.Vector3())));
  b.updateMatrixWorld(true);
}

// Applied to a fresh animation sample, after ordinary locomotion contacts.
// Keep the upright collision volume: a low pose never grants tunnel access.
export function poseLowStance(c,delta,state){
  const grounded=['IDLE','RUNNING','SPRINTING'].includes(state);
  const eligible=grounded && !(c.combatAction?.duration>0);
  const crouch=eligible && c.lowStance==='crouch';
  const approach=(value,target,duration)=>T.MathUtils.clamp(value+Math.sign(target-value)*Math.min(Math.abs(target-value),Math.max(0,delta)/duration),0,1);
  c.crouchBlend=approach(c.crouchBlend || 0,crouch?1:0,.45);
  c.crouchWeight=T.MathUtils.smoothstep(c.crouchBlend,0,1);
  if(!grounded){c.crouchBlend=0;c.crouchWeight=0;c.lowStanceLift=0;return;}
  if(c.crouchWeight<.001){c.lowStanceLift=0;return;}
  const hips=joint(c,'hips');if(!hips)return;
  c.lowStancePhase=(c.lowStancePhase || 0)+Math.max(0,delta)*Math.min(1.5,c.viewMoveSpeed || 0)*5;
  const gait=Math.min(1,(c.viewMoveSpeed || 0)/.7),phase=c.lowStancePhase;
  const feet=Object.fromEntries(['left','right'].map(side=>{
    const foot=joint(c,side+'foot');return [side,foot?{p:point(foot),q:foot.getWorldQuaternion(new T.Quaternion())}:null];
  }));
  const floor=c.groundProbe?.(c.group.position) ?? c.group.position.y-.1;
  const right=new T.Vector3(1,0,0).applyAxisAngle(new T.Vector3(0,1,0),c.visualYaw || 0);
  const forward=new T.Vector3(0,0,1).applyAxisAngle(new T.Vector3(0,1,0),c.visualYaw || 0);
  const travel=c.groundMotionVelocity?.lengthSq()>1e-6?c.groundMotionVelocity.clone().normalize():forward;
  shift(hips,new T.Vector3(0,-.49*c.crouchWeight,0));
  const spine=joint(c,'spine');if(spine)spine.rotateX(.16*c.crouchWeight);
  for(const [side,sign] of [['left',1],['right',-1]]){
    const upper=joint(c,side+'upleg'),lower=joint(c,side+'leg'),foot=joint(c,side+'foot');
    if(!(upper && lower && foot && feet[side]))continue;
    const step=Math.sin(phase+ (sign<0?Math.PI:0));
    const stanceFoot=c.group.position.clone().addScaledVector(right,sign*.2).addScaledVector(forward,.08).addScaledVector(travel,step*.13*gait);
    stanceFoot.y=(c.groundProbe?.(stanceFoot) ?? floor)+.11+Math.max(0,step)*.055*gait;
    const target=feet[side].p.clone().lerp(stanceFoot,c.crouchWeight);
    c.solveLimb(upper,lower,foot,target,.995,forward);
    fitGroundAnkle(c,side,foot,feet[side].q);
  }
  constrainJoints(c.jointConstraints);
  c.group.updateMatrixWorld(true);
  // Keep support offsets separate from roll/landing clearance. Sharing the
  // cache makes two clearance passes feed the same lift into one another.
  const impact=c.impactLift;
  c.impactLift=c.lowStanceLift || 0;
  clearImpactBody(c,delta,true);
  c.lowStanceLift=c.impactLift;
  c.impactLift=impact;
}
