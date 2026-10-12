import * as THREE from 'three';
import { boneId } from './MotionRetarget.js';

const up=new THREE.Vector3(0,1,0);
const worldPosition=n=>n.getWorldPosition(new THREE.Vector3());
const find=(c,id)=>Object.values(c.bones || {}).find(b=>boneId(b.name)===id);
function worldRotation(bone,q) {
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));
  bone.updateMatrixWorld(true);
}

export function footSupport(c,position,anticipateStep=false) {
  const root=worldPosition(c.group),probe=new THREE.Vector3(position.x,root.y+0.45,position.z);
  const sample=c.surfaceProbe?c.surfaceProbe(probe):null;
  let height=c.surfaceProbe?sample?.height:c.groundProbe?.(probe);
  if(height===null || height===undefined || !Number.isFinite(height) || Math.abs(height-root.y)>0.65)return null;
  const normal=sample?.normal?.clone().normalize() || up.clone();
  if(!normal.toArray().every(Number.isFinite) || normal.y<Math.cos(Math.PI/4))return null;
  if(anticipateStep && c.surfaceProbe) {
    const forward=new THREE.Vector3(0,0,1).applyQuaternion(c.model.getWorldQuaternion(new THREE.Quaternion()));
    forward.y=0;forward.normalize();
    const ahead=c.surfaceProbe(probe.clone().addScaledVector(forward,0.22));
    const predicted=height-(normal.x*forward.x+normal.z*forward.z)*0.22/normal.y;
    if(ahead && ahead.normal.y>0.7 && ahead.height-predicted>0.08 && ahead.height-height<0.31)
      height=ahead.height; // Raise a swinging toe before it crosses a riser.
  }
  return {height,normal};
}

export function soleRotation(c,side,normal) {
  const raw=c.activeAction?.getClip().userData?.soleRotations?.[side] ||
    c.actions.wall?.getClip().userData?.soleRotations?.[side];
  if(!raw)return null;
  const neutral=c.model.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().fromArray(raw));
  // The Mixamo foot bone's local Y runs toward the toes, not out of the sole.
  // The captured flat-foot pose is already correct on level ground; only tilt
  // that pose by the difference between world up and the support normal.
  return new THREE.Quaternion().setFromUnitVectors(up,normal).multiply(neutral);
}

export function adaptPelvisToTerrain(c,delta,grounded) {
  let target=0;
  if(grounded) {
    const root=worldPosition(c.group),heights=[];
    for(const side of ['left','right']) {
      const foot=find(c,side+'foot');if(!foot)continue;
      const sample=footSupport(c,worldPosition(foot));
      if(sample)heights.push(sample.height-(root.y-0.1));
    }
    if(heights.length)target=THREE.MathUtils.clamp(Math.min(0,...heights),-0.22,0);
  }
  c.terrainPelvis=THREE.MathUtils.damp(c.terrainPelvis || 0,target,14,delta);
  if(grounded)c.model.position.y+=c.terrainPelvis;
  c.group.updateMatrixWorld(true);
}

function alignPalm(c,side,end,normal,tangent) {
  const middle=find(c,side+'handmiddle1'),index=find(c,side+'handindex1'),pinky=find(c,side+'handpinky1');
  if(!middle || !index || !pinky)return;
  const wrist=worldPosition(end),finger=worldPosition(middle).sub(wrist).normalize();
  const palm=new THREE.Vector3().crossVectors(worldPosition(index).sub(wrist),worldPosition(pinky).sub(wrist)).normalize().multiplyScalar(side==='left'?1:-1);
  const align=new THREE.Quaternion().setFromUnitVectors(palm,normal.clone().negate());
  const projected=finger.applyQuaternion(align).addScaledVector(normal,-finger.dot(normal)).normalize();
  const angle=Math.atan2(normal.dot(new THREE.Vector3().crossVectors(projected,tangent)),projected.dot(tangent));
  worldRotation(end,new THREE.Quaternion().setFromAxisAngle(normal,angle).multiply(align).multiply(end.getWorldQuaternion(new THREE.Quaternion())));
}

// Only the authored stance window is planted. Swinging feet and unsupported
// ledges must remain free; an unreachable plant is released, never stretched.
export function plantMovingFeet(c,delta) {
  const action=c.activeAction,clip=action?.getClip(),contacts=clip?.userData?.footContacts;
  if (!contacts?.length) { c.movingPlants=null;c.movingReleases=null;c.plantLastFeet=null;return; }
  const root=worldPosition(c.group);
  if(c.plantRoot && c.plantRoot.distanceTo(root)>0.8) {c.movingPlants=null;c.movingReleases=null;c.plantLastFeet=null;}
  c.plantRoot=root.clone();c.movingPlants ||= {};
  c.movingReleases ||= {};c.plantLastFeet ||= {};
  const time=action.time%clip.duration;
  const sample=contacts[Math.min(contacts.length-1,Math.round(time/clip.duration*(contacts.length-1)))];
  const speed=c.plantVelocityRoot?root.distanceTo(c.plantVelocityRoot)/Math.max(delta,1e-5):0;
  c.plantVelocityRoot=root.clone();
  const bounded=(side,target)=>{
    const previous=c.plantLastFeet[side],limit=(10+2*speed)*delta;
    if(previous && previous.distanceTo(target)>limit)
      target.copy(previous.clone().add(target.clone().sub(previous).setLength(limit)));
    return target;
  };
  for(const side of ['left','right']) {
    const hip=find(c,side+'upleg'),knee=find(c,side+'leg'),foot=find(c,side+'foot');
    if(!hip || !knee || !foot) continue;
    const current=worldPosition(foot);
    let support=footSupport(c,c.movingPlants[side]?.position || current);
    const surface=support?.height,supported=!!support;
    let plant=c.movingPlants[side];
    const length=worldPosition(hip).distanceTo(worldPosition(knee))+worldPosition(knee).distanceTo(current);
    const reachable=!plant || worldPosition(hip).distanceTo(plant.position)<=length*0.995;
    const stance=sample[side] && supported && action.getEffectiveWeight()>=0.8 && reachable;
    if(!stance) {
      support=footSupport(c,current,true) || support;
      const swingSurface=support?.height;
      if(plant && c.plantLastFeet[side]) c.movingReleases[side]={
        offset:c.plantLastFeet[side].clone().sub(current),action,age:0};
      delete c.movingPlants[side];
      const release=c.movingReleases[side];
      if(release && supported) {
        release.age+=delta;
        // Ease out the IK correction; snapping straight back to the authored
        // swing pose displaced an ankle by up to 75cm in a single frame.
        const weight=Math.exp(-release.age/0.075);
        const target=current.clone().addScaledVector(release.offset,weight);
        target.y=Math.max(swingSurface+0.11,target.y);
        c.solveLimb(hip,knee,foot,bounded(side,target),0.995);
        if(weight<0.01)delete c.movingReleases[side];
      } else {
        delete c.movingReleases[side];
        if(supported) {
          const target=current.clone();target.y=Math.max(swingSurface+0.11,target.y);
          c.solveLimb(hip,knee,foot,bounded(side,target),0.995);
        }
      }
      if(supported) {
        const authored=foot.getWorldQuaternion(new THREE.Quaternion()),flat=soleRotation(c,side,support.normal);
        if(flat && release)worldRotation(foot,authored.slerp(flat,Math.exp(-release.age/0.075)));
      }
      c.plantLastFeet[side]=worldPosition(foot);
      continue;
    }
    if(!plant || plant.action!==action) {
      plant=c.movingPlants[side]={action,position:current.clone(),rotation:soleRotation(c,side,support.normal) || foot.getWorldQuaternion(new THREE.Quaternion()),age:0,normal:support.normal};
      plant.position.y=surface+0.11;
    }
    // Keep a stance anchored to the actual support, including a changed LOD.
    if(Math.abs(plant.position.y-surface-0.11)>0.12) {
      delete c.movingPlants[side];delete c.movingReleases[side];continue;
    }
    plant.position.y=THREE.MathUtils.damp(plant.position.y,surface+0.11,20,delta);
    if(plant.normal.dot(support.normal)<0.9999) {
      const nextNormal=plant.normal.clone().lerp(support.normal,1-Math.exp(-16*delta)).normalize();
      plant.rotation.premultiply(new THREE.Quaternion().setFromUnitVectors(plant.normal,nextNormal));
      plant.normal=nextNormal;
    }
    delete c.movingReleases[side];
    plant.age+=delta;
    const weight=Math.min(1,plant.age/0.065);
    const target=bounded(side,current.clone().lerp(plant.position,weight));
    const rotation=foot.getWorldQuaternion(new THREE.Quaternion()).slerp(plant.rotation,weight);
    c.solveLimb(hip,knee,foot,target,0.995);
    worldRotation(foot,rotation);
    c.plantLastFeet[side]=worldPosition(foot);
  }
}

// An alternating diagonal contact gait in the facade plane. Stance anchors
// stay in world coordinates while the root travels upward/sideways.
export function poseWall(c,delta,velocity) {
  const normal=c.wallNormal.clone().normalize();
  if(c.actions.wall?.getClip().userData.authoredMixamo) {
    // Preserve the downloaded gait in the facade plane. Only correct depth
    // to the physical wall; never replace it with an unrelated contact cycle.
    const root=worldPosition(c.group);
    const plane=root.clone().addScaledVector(normal,-(c.wallDistance ?? .7)+.09);
    for(const side of ['left','right'])for(const limb of ['hand','foot']) {
      const upper=find(c,side+(limb==='hand'?'arm':'upleg'));
      const lower=find(c,side+(limb==='hand'?'forearm':'leg')),end=find(c,side+limb);
      if(!upper || !lower || !end)continue;
      const target=worldPosition(end);target.addScaledVector(normal,-target.clone().sub(plane).dot(normal));
      const pole=worldPosition(lower).sub(worldPosition(upper)).normalize();
      c.solveLimb(upper,lower,end,target,.995,pole);
      if(limb==='hand')alignPalm(c,side,end,normal,up);
    }
    return;
  }
  const root=worldPosition(c.group),right=new THREE.Vector3().crossVectors(up,normal.clone().negate()).normalize();
  const travel=velocity.clone().addScaledVector(normal,-velocity.dot(normal));
  const speed=travel.length();const direction=speed>0.01?travel.normalize():up.clone();
  const moved=c.wallPoseRoot?root.distanceTo(c.wallPoseRoot):0;
  if(moved>0.8) {c.wallContacts=null;c.wallPhase=0;}
  c.wallPoseRoot=root.clone();c.wallPhase=(c.wallPhase || 0)+Math.min(moved,0.8)/1.25;
  c.wallContacts ||= {};
  c.wallPoseWeight=THREE.MathUtils.damp(c.wallPoseWeight || 0,1,16,delta);
  for(const side of ['left','right']) for(const limb of ['hand','foot']) {
    const sign=side==='left'?1:-1;
    const id=side+limb,upper=find(c,side+(limb==='hand'?'arm':'upleg'));
    const lower=find(c,side+(limb==='hand'?'forearm':'leg')),end=find(c,id);
    if(!upper || !lower || !end) continue;
    const phase=(c.wallPhase+(side==='left'?0:0.5)+(limb==='foot'?0.5:0))%1;
    const stance=phase<0.48;
    const base=root.clone().addScaledVector(normal,-(c.wallDistance ?? 0.7)+0.09)
      .addScaledVector(up,limb==='hand'?1.48:0.51).addScaledVector(right,sign*(limb==='hand'?0.3:0.22));
    let contact=c.wallContacts[id];
    if(stance) {
      if(!contact?.stance) contact=c.wallContacts[id]={stance:true,target:base.clone().addScaledVector(direction,limb==='hand'?0.22:0.3)};
    } else {
      const t=(phase-0.48)/0.52;
      const goal=base.clone().addScaledVector(direction,THREE.MathUtils.lerp(-0.3,0.3,t))
        .addScaledVector(normal,Math.sin(t*Math.PI)*0.22);
      contact=c.wallContacts[id]={stance:false,target:goal};
    }
    // Release a plant when the imported torso animation or root movement
    // makes it unreachable; do not stretch the arm or drag its planted hand.
    const reach=worldPosition(upper).distanceTo(worldPosition(lower))+worldPosition(lower).distanceTo(worldPosition(end));
    if(contact.stance && worldPosition(upper).distanceTo(contact.target)>reach*0.99)contact.stance=false;
    const target=worldPosition(end).lerp(contact.target,c.wallPoseWeight);
    // Knees point away from the facade, elbows out to each side.
    const pole=normal.clone().multiplyScalar(limb==='foot'?1:0.35).addScaledVector(right,sign*0.55);
    c.solveLimb(upper,lower,end,target,0.995,pole);
    if(limb==='hand')alignPalm(c,side,end,normal,up);
    if(limb==='foot') {
      // A standing sole's +Y normal becomes the wall normal.
      const q=c.wallSoleRotations?.[side];
      if(q) worldRotation(end,new THREE.Quaternion().setFromUnitVectors(up,normal).multiply(q));
    }
  }
}

export function poseMantle(c,delta) {
  const plan=c.mantle;if(!plan)return;
  const t=THREE.MathUtils.clamp(plan.elapsed/plan.duration,0,1);
  const right=new THREE.Vector3().crossVectors(up,plan.normal.clone().negate()).normalize();
  const ease=(a,b)=>{const p=THREE.MathUtils.clamp((t-a)/(b-a),0,1);return p*p*(3-2*p);};
  const handWeight=(1-Math.exp(-plan.elapsed*28))*(1-ease(0.52,0.75));
  c.mantleHandTargets={};
  for(const side of ['left','right']) {
    const sign=side==='left'?1:-1;
    const arm=find(c,side+'arm'),forearm=find(c,side+'forearm'),hand=find(c,side+'hand');
    if(arm && forearm && hand) {
      const goal=plan.edge.clone().addScaledVector(right,sign*0.3).addScaledVector(plan.normal,-0.15);
      c.mantleHandTargets[side]=goal;
      const a=arm.quaternion.clone(),b=forearm.quaternion.clone(),q=hand.getWorldQuaternion(new THREE.Quaternion());
      c.solveLimb(arm,forearm,hand,goal,0.995,plan.normal.clone().addScaledVector(right,sign*0.65));
      arm.quaternion.slerpQuaternions(a,arm.quaternion.clone(),handWeight);
      forearm.quaternion.slerpQuaternions(b,forearm.quaternion.clone(),handWeight);arm.updateMatrixWorld(true);
      alignPalm(c,side,hand,up,plan.normal.clone().negate());
      worldRotation(hand,q.slerp(hand.getWorldQuaternion(new THREE.Quaternion()),handWeight));
    }
    const hip=find(c,side+'upleg'),knee=find(c,side+'leg'),foot=find(c,side+'foot');
    if(!hip || !knee || !foot)continue;
    const lift=ease(side==='left'?0.2:0.43,side==='left'?0.5:0.65);
    const target=worldPosition(foot);
    const roofFoot=plan.edge.clone().addScaledVector(plan.normal,-0.35).addScaledVector(right,sign*0.22);
    roofFoot.y=plan.height+0.11;
    if(t>0.65)roofFoot.lerp(plan.end.clone().addScaledVector(right,sign*0.22).addScaledVector(up,0.01),ease(0.65,1));
    target.lerp(roofFoot,lift);
    c.solveLimb(hip,knee,foot,target,0.995,up.clone().multiplyScalar(0.8).addScaledVector(plan.normal,-0.35).addScaledVector(right,sign*0.3));
    const flat=soleRotation(c,side,up);
    if(flat)worldRotation(foot,foot.getWorldQuaternion(new THREE.Quaternion()).slerp(flat,lift));
  }
}

export function poseZipLegs(c,delta) {
  c.zipPoseWeight=THREE.MathUtils.damp(c.zipPoseWeight || 0,1,14,delta);
  for(const side of ['left','right']) {
    const hip=find(c,side+'upleg'),knee=find(c,side+'leg'),foot=find(c,side+'foot');
    if(!hip || !knee || !foot)continue;
    const sign=side==='left'?1:-1;
    const local=new THREE.Vector3(sign*0.2,side==='left'?0.38:0.24,-0.35);
    const goal=c.model.localToWorld(local);
    const pole=new THREE.Vector3(sign*0.12,0,1).applyQuaternion(c.model.quaternion);
    c.solveLimb(hip,knee,foot,worldPosition(foot).lerp(goal,c.zipPoseWeight),0.97,pole);
  }
}
