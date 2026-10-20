import * as THREE from 'three';
import { boneId } from './MotionRetarget.js';
import {constrainJoints} from './JointConstraints.js';

const up=new THREE.Vector3(0,1,0);
const worldPosition=n=>n.getWorldPosition(new THREE.Vector3());
const find=(c,id)=>Object.values(c.bones || {}).find(b=>boneId(b.name)===id);
function worldRotation(bone,q) {
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q)).normalize();
  bone.updateMatrixWorld(true);
}

// A closed fist should continue the forearm's line. Imported wrist rotations
// can be valid for an open hand but fold the knuckles when fingers close.
export function alignCombatWrists(c,weight=1) {
  if(weight<=0)return;
  for(const side of ['left','right']){
    const lower=find(c,side+'forearm'),hand=find(c,side+'hand'),middle=find(c,side+'handmiddle1');
    if(!lower || !hand || !middle)continue;
    const wrist=worldPosition(hand),forearm=wrist.clone().sub(worldPosition(lower)).normalize();
    const knuckles=worldPosition(middle).sub(wrist).normalize();
    const bend=knuckles.angleTo(forearm),limit=THREE.MathUtils.degToRad(12);
    if(bend<=limit)continue;
    const correction=new THREE.Quaternion().setFromUnitVectors(knuckles,forearm);
    correction.slerpQuaternions(new THREE.Quaternion(),correction.clone(),(1-limit/bend)*weight);
    worldRotation(hand,correction.multiply(hand.getWorldQuaternion(new THREE.Quaternion())));
  }
}

function orientGroundFoot(c,side,foot,rotation,delta) {
  c.groundFootRotations ||= {};
  const previous=c.groundFootRotations[side];
  // Contact acquisition/release changes the IK chain, not the ankle's
  // authored world orientation. Bound the remaining contact tilt in time.
  const next=previous?previous.clone().rotateTowards(rotation,Math.PI*4*delta):rotation.clone();
  fitGroundAnkle(c,side,foot,next);c.groundFootRotations[side]=next;
}

export function fitGroundAnkle(c,side,foot,rotation) {
  fitEndRotation(c,find(c,side+'upleg'),find(c,side+'leg'),foot,rotation);
}
function fitEndRotation(c,upper,lower,end,rotation) {
  const constraint=c.jointConstraints?.find(item=>item.bone===end);
  if(constraint){
    const local=end.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation);
    if(constraint.rest.angleTo(local)>constraint.limit){
      const anchor=worldPosition(end);
      const idealParent=rotation.clone().multiply(constraint.rest.clone().invert());
      const pole=anchor.clone().sub(end.position.clone().applyQuaternion(idealParent)).sub(worldPosition(upper));
      c.solveLimb(upper,lower,end,anchor,.995,pole);
    }
  }
  worldRotation(end,rotation);
}

export function soleSamples(c,side) {
  const mesh=c.model?.getObjectByProperty('isSkinnedMesh',true);
  const geometry=mesh?.geometry;
  if(c.soleSampleModel!==c.model || c.soleSampleGeometry!==geometry){
    c.soleSampleModel=c.model;c.soleSampleGeometry=geometry;c.soleSamples={};
  }
  if(c.soleSamples[side])return c.soleSamples[side];
  const candidates=[];
  c.model.traverse(mesh=>{
    if(!mesh.isSkinnedMesh)return;
    const w=mesh.geometry.attributes.skinWeight,j=mesh.geometry.attributes.skinIndex;
    const selected=mesh.skeleton.bones.map(b=>[side+'foot',side+'toebase'].some(id=>boneId(b.name).startsWith(id)));
    for(let v=0;v<w.count;v++){
      let weight=0;for(let k=0;k<4;k++)if(selected[j.getComponent(v,k)])weight+=w.getComponent(v,k);
      if(weight<=.5)continue;
      candidates.push({mesh,vertex:v});
    }
  });
  // Skin only the foot-dominant vertices; retain the curved heel and toe
  // outline rather than approximating the boot with its ankle marker.
  return c.soleSamples[side]=candidates;
}

export function clearGroundSoles(c) {
  for(const side of ['left','right']){
    const hip=find(c,side+'upleg'),knee=find(c,side+'leg'),foot=find(c,side+'foot');if(!hip||!knee||!foot)continue;
    const samples=soleSamples(c,side);if(!samples.length)continue;
    const rotation=foot.getWorldQuaternion(new THREE.Quaternion());
    for(let pass=0;pass<4;pass++){
      const ankle=worldPosition(foot);
      const points=samples.map(({mesh,vertex})=>mesh.localToWorld(mesh.applyBoneTransform(vertex,new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,vertex))));
      const toe=find(c,side+'toebase');if(toe)points.push(worldPosition(toe));
      const probes=[];
      const probe=point=>{const support=footSupport(c,point);if(support)probes.push({point,support});};
      probe(ankle);
      // At a step's side edge the ankle may have no support while the toe
      // already overlaps a higher tread. Do not skip the whole boot there.
      if(toe)probe(worldPosition(toe));
      for(const [axis,sign] of [['x',1],['x',-1],['z',1],['z',-1]])
        probe(points.reduce((a,b)=>a[axis]*sign>b[axis]*sign?a:b));
      if(!probes.length)break;
      const {point:basePoint,support:base}=probes[0];
      let lift=0;
      // Raise a swinging boot before its outline crosses a discrete riser.
      // Continuous ramps are handled by their plane and receive no extra lift.
      const advance=c.groundMotionVelocity?.clone().multiplyScalar(.15).clampLength(0,.7);
      if(pass===0 && advance && advance.lengthSq()>.0001)for(const {point,support} of probes){
        for(const fraction of [.125,.25,.375,.5,.625,.75,.875,1]){
          const ahead=point.clone().addScaledVector(advance,fraction),next=footSupport(c,ahead);
          if(!next)continue;
          const plane=support.height-(support.normal.x*(ahead.x-point.x)+support.normal.z*(ahead.z-point.z))/support.normal.y;
          const rise=next.height-plane;
          if(rise>.08 && rise<.65){
            const anticipate=rise*(1-fraction)**2;
            lift=Math.max(lift,support.height+.003+anticipate-point.y);
            delete c.movingPlants?.[side];
          }
        }
      }
      for(const point of points){
        const probe=probes.reduce((a,b)=>Math.hypot(point.x-a.point.x,point.z-a.point.z)<Math.hypot(point.x-b.point.x,point.z-b.point.z)?a:b);
        const {height,normal}=probe.support;
        const surface=height-(normal.x*(point.x-probe.point.x)+normal.z*(point.z-probe.point.z))/normal.y;
        lift=Math.max(lift,surface+.003-point.y);
        const expected=base.height-(base.normal.x*(probe.point.x-basePoint.x)+base.normal.z*(probe.point.z-basePoint.z))/base.normal.y;
        if(height-expected>.08)delete c.movingPlants?.[side];
      }
      if(lift<.0001)break;
      c.solveLimb(hip,knee,foot,ankle.addScaledVector(up,lift),.995);fitGroundAnkle(c,side,foot,rotation);
      constrainJoints(c.jointConstraints?.filter(item=>item.bone===foot));
    }
    const actual=worldPosition(foot),plant=c.movingPlants?.[side];
    // A boot can span two support heights at a ramp/step exit. Sole clearance
    // takes priority; once it moves the ankle off its anchor, release that
    // contact instead of reporting a planted foot and pulling it down again.
    if(plant && plant.age>.08 && Math.abs(actual.y-plant.position.y)>.03){
      delete c.movingPlants[side];
      if(c.movingReleases)delete c.movingReleases[side];
    }
    if(c.plantLastFeet)c.plantLastFeet[side]=actual;
  }
}

export function footSupport(c,position,anticipateStep=false) {
  const root=worldPosition(c.group),probe=new THREE.Vector3(position.x,root.y+0.45,position.z);
  const sample=c.surfaceProbe?c.surfaceProbe(probe,1.1):null;
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

// A source's first frame can already lift a heel. It is a heading reference,
// not a flat sole calibration. Use the neutral rig for the sole's local up.
export function groundSoleNormal(c,side,rotation) {
  const raw=c.actions.wall?.getClip().userData?.soleRotations?.[side];
  if(!raw)return null;
  const localUp=up.clone().applyQuaternion(new THREE.Quaternion().fromArray(raw).invert());
  return localUp.applyQuaternion(rotation).normalize();
}

export function soleRotation(c,side,normal,authoredRotation) {
  const raw=c.activeAction?.getClip().userData?.soleRotations?.[side] ||
    c.actions.wall?.getClip().userData?.soleRotations?.[side];
  if(!raw)return null;
  const authored=authoredRotation?.clone() || c.model.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().fromArray(raw));
  const sole=groundSoleNormal(c,side,authored);
  if(!sole)return authored;
  // Remove pitch and roll while retaining the authored toe heading/pivot.
  return new THREE.Quaternion().setFromUnitVectors(sole,normal).multiply(authored);
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
  if (!contacts?.length) { c.movingPlants=null;c.movingReleases=null;c.plantLastFeet=null;c.groundFootRotations=null;return; }
  const root=worldPosition(c.group);
  if(c.plantRoot && c.plantRoot.distanceTo(root)>0.8) {c.movingPlants=null;c.movingReleases=null;c.plantLastFeet=null;c.groundFootRotations=null;}
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
    const authored=foot.getWorldQuaternion(new THREE.Quaternion());
    let support=footSupport(c,c.movingPlants[side]?.position || current);
    const surface=support?.height,supported=!!support;
    let plant=c.movingPlants[side];
    const length=worldPosition(hip).distanceTo(worldPosition(knee))+worldPosition(knee).distanceTo(current);
    // Test a new floor anchor as well as an existing one. Acquiring an
    // unreachable anchor on one frame and releasing it on the next made
    // almost-straight boxing legs alternate between two ankle poses.
    const candidate=plant?.position || current.clone().setY((surface ?? current.y)+.11);
    const reachable=worldPosition(hip).distanceTo(candidate)<=length*0.995;
    const stance=sample[side] && supported && action.getEffectiveWeight()>=0.8 && reachable;
    if(!stance) {
      support=footSupport(c,current,true) || support;
      const swingSurface=support?.height;
      if(plant && c.plantLastFeet[side]) c.movingReleases[side]={
        offset:c.plantLastFeet[side].clone().sub(current),rotation:c.groundFootRotations?.[side]?.clone() || authored.clone(),action,age:0};
      delete c.movingPlants[side];
      const release=c.movingReleases[side];
      if(release) {
        release.age+=delta;
        // Ease out the IK correction; snapping straight back to the authored
        // swing pose displaced an ankle by up to 75cm in a single frame.
        const weight=Math.exp(-release.age/0.075);
        const target=current.clone().addScaledVector(release.offset,weight);
        if(supported)target.y=Math.max(swingSurface+0.11,target.y);
        c.solveLimb(hip,knee,foot,bounded(side,target),0.995);
        if(weight<0.01)delete c.movingReleases[side];
      } else {
        delete c.movingReleases[side];
        const target=current.clone();if(supported)target.y=Math.max(swingSurface+0.11,target.y);
        c.solveLimb(hip,knee,foot,bounded(side,target),0.995);
      }
      const rotation=release && supported?authored.slerp(release.rotation,Math.exp(-release.age/0.075)):authored;
      orientGroundFoot(c,side,foot,rotation,delta);
      c.plantLastFeet[side]=worldPosition(foot);
      continue;
    }
    if(!plant || plant.action!==action) {
      plant=c.movingPlants[side]={action,position:current.clone(),rotation:soleRotation(c,side,support.normal,authored) || foot.getWorldQuaternion(new THREE.Quaternion()),age:0,normal:support.normal};
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
    // Fade the horizontal plant, but never fade up from below a ramp.
    target.y=Math.max(target.y,surface+.11);
    const rotation=foot.getWorldQuaternion(new THREE.Quaternion()).slerp(plant.rotation,weight);
    c.solveLimb(hip,knee,foot,target,0.995);
    orientGroundFoot(c,side,foot,rotation,delta);
    c.plantLastFeet[side]=worldPosition(foot);
  }
}

function authoredWallContact(c,id,target,normal,plane,phase,delta,speed) {
  const windows={lefthand:[.22,.78],righthand:[.86,.64],leftfoot:[.87,.63],rightfoot:[.42,.08]};
  const [start,end]=windows[id],cycle=(phase-start+1)%1,span=(end-start+1)%1,wanted=cycle<span;
  c.wallContacts ||= {};let contact=c.wallContacts[id];
  if(!contact)contact=c.wallContacts[id]={wanted:false,last:target.clone(),age:0};
  const side=id.startsWith('left')?'left':'right',hand=id.endsWith('hand');
  const upper=find(c,side+(hand?'arm':'upleg')),lower=find(c,side+(hand?'forearm':'leg')),endBone=find(c,id);
  const reach=worldPosition(upper).distanceTo(worldPosition(lower))+worldPosition(lower).distanceTo(worldPosition(endBone));
  if(wanted && !contact.wanted){
    const origin=worldPosition(upper),offset=target.clone().sub(origin),depth=offset.dot(normal),tangent=offset.addScaledVector(normal,-depth);
    const maxTangent=Math.sqrt(Math.max(0,(reach*.965)**2-depth**2));
    if(tangent.length()>maxTangent)tangent.setLength(maxTangent);
    contact.position=origin.addScaledVector(normal,depth).add(tangent);contact.stance=true;contact.released=false;contact.age=0;
  }
  contact.wanted=wanted;contact.swing=wanted?0:(cycle-span)/(1-span);
  if(contact.stance && (!wanted || worldPosition(upper).distanceTo(contact.position)>reach*.98)){
    contact.stance=false;contact.released=true;contact.release=contact.last.clone().sub(target);contact.releaseAge=0;
  }
  if(contact.stance){
    contact.position.addScaledVector(normal,-contact.position.clone().sub(plane).dot(normal));
    target.copy(contact.position);contact.age+=delta;
  }else{
    if(contact.release){contact.releaseAge+=delta;target.addScaledVector(contact.release,Math.exp(-contact.releaseAge/.075));if(contact.releaseAge>.4)contact.release=null;}
    target.addScaledVector(normal,Math.sin(Math.PI*contact.swing)*(hand?.04:.025));
  }
  const move=target.clone().sub(contact.last),limit=(6+speed)*delta;
  if(delta>0 && move.length()>limit)target.copy(contact.last).add(move.setLength(limit));
  // Reaching a new hold is not yet a planted support frame.
  if(contact.stance && target.distanceTo(contact.position)>.005)contact.age=0;
  contact.last.copy(target);return contact;
}

// An alternating diagonal contact gait in the facade plane. Stance anchors
// stay in world coordinates while the root travels upward/sideways.
export function poseWall(c,delta,velocity) {
  const normal=c.wallNormal.clone().normalize();
  if(c.actions.wall?.getClip().userData.authoredMixamo) {
    // Keep the authored torso and reach timing, and lock the support part
    // of each limb to the facade rather than dragging it with the root.
    const root=worldPosition(c.group),speed=velocity.length();
    if(c.wallPoseRoot && root.distanceTo(c.wallPoseRoot)>.8)c.wallContacts=null;
    c.wallPoseRoot=root.clone();
    const clip=c.actions.wall.getClip();c.wallPhase=(c.actions.wall.time/clip.duration)%1;
    const right=new THREE.Vector3().crossVectors(up,normal.clone().negate()).normalize();
    for(const side of ['left','right'])for(const limb of ['hand','foot']) {
      const upper=find(c,side+(limb==='hand'?'arm':'upleg'));
      const lower=find(c,side+(limb==='hand'?'forearm':'leg')),end=find(c,side+limb);
      if(!upper || !lower || !end)continue;
      const plane=root.clone().addScaledVector(normal,-(c.wallDistance ?? .7)+(limb==='hand'?.075:.13));
      const authored=end.getWorldQuaternion(new THREE.Quaternion());
      const target=worldPosition(end);target.addScaledVector(normal,-target.clone().sub(plane).dot(normal));
      const contact=authoredWallContact(c,side+limb,target,normal,plane,c.wallPhase,delta,speed);
      let grip=0;
      if(limb==='hand'){
        c.wallGripHeights ||= {};c.wallGripTargets ||= {};
        const probe=target.clone().addScaledVector(normal,-.3);probe.y=root.y+1.8;
        let sample=c.surfaceProbe?.(probe);
        const cached=c.wallGripHeights[side];
        if(!sample && Number.isFinite(cached)){probe.y=cached+.4;sample=c.surfaceProbe?.(probe);}
        const ledge=sample && sample.normal.y>.85 && sample.height>=root.y-.2 && sample.height<=root.y+1.8;
        c.wallGripWeights ||= {};
        grip=c.wallGripWeights[side]=THREE.MathUtils.damp(c.wallGripWeights[side] || 0,ledge?1:0,18,delta);
        if(ledge)c.wallGripHeights[side]=sample.height;
        const height=c.wallGripHeights[side];
        if(Number.isFinite(height) && grip>.001){
          const roofGrip=target.clone().addScaledVector(normal,-.24);roofGrip.y=height+.06;
          c.wallGripTargets[side] ||= target.clone();c.wallGripTargets[side].lerp(roofGrip,1-Math.exp(-8*delta));
          target.lerp(c.wallGripTargets[side],grip);
        }
      }
      const pole=normal.clone().multiplyScalar(limb==='foot'?1:.35).addScaledVector(right,(side==='left'?1:-1)*(limb==='foot'?.25:.55));
      c.solveLimb(upper,lower,end,target,.995,pole);
      if(limb==='hand'){
        const palmNormal=normal.clone().lerp(up,grip).normalize();
        const reach=worldPosition(end).sub(worldPosition(upper));
        const tangent=reach.addScaledVector(palmNormal,-reach.dot(palmNormal)).normalize();
        if(tangent.lengthSq()<.01)tangent.copy(up);
        alignPalm(c,side,end,palmNormal,tangent);
      }
      else{
        contact.soleWeight=THREE.MathUtils.damp(contact.soleWeight || 0,1,18,delta);
        const flat=c.wallSoleRotations?.[side];
        const wallRotation=flat?new THREE.Quaternion().setFromAxisAngle(right,-.12*Math.sin(Math.PI*contact.swing)).multiply(new THREE.Quaternion().setFromUnitVectors(up,normal)).multiply(flat):authored;
        const rotation=authored.slerp(wallRotation,contact.soleWeight);
        if(contact.rotation)rotation.copy(contact.rotation.clone().rotateTowards(rotation,12*delta));
        worldRotation(end,rotation);contact.rotation=rotation.clone();
      }
      fitEndRotation(c,upper,lower,end,end.getWorldQuaternion(new THREE.Quaternion()));
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
  const steppingDown=plan.end.y<plan.height;
  c.mantleHandTargets={};
  for(const side of ['left','right']) {
    const sign=side==='left'?1:-1;
    const release=steppingDown?(side==='left'?[.46,.62]:[.44,.60]):[.52,.75];
    const handWeight=(1-Math.exp(-plan.elapsed*(steppingDown?18:28)))*(1-ease(...release));
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
    const lift=steppingDown?ease(side==='left'?.16:.30,side==='left'?.40:.54):ease(side==='left'?.2:.43,side==='left'?.5:.65);
    const target=worldPosition(foot);
    const roofFoot=plan.edge.clone().addScaledVector(plan.normal,-0.35).addScaledVector(right,sign*0.22);
    roofFoot.y=plan.height+0.11;
    if(steppingDown){
      const transfer=ease(side==='left'?.55:.60,side==='left'?.84:.89);
      roofFoot.x=THREE.MathUtils.lerp(roofFoot.x,plan.end.x+right.x*sign*.22,transfer);
      roofFoot.z=THREE.MathUtils.lerp(roofFoot.z,plan.end.z+right.z*sign*.22,transfer);
      roofFoot.y=THREE.MathUtils.lerp(plan.height+.11,plan.end.y+.01,ease(.78,1));
    }else if(t>0.65)roofFoot.lerp(plan.end.clone().addScaledVector(right,sign*0.22).addScaledVector(up,0.01),ease(0.65,1));
    target.lerp(roofFoot,lift);
    if(steppingDown){
      const plant=ease(side==='left'?.40:.54,side==='left'?.48:.62);
      const facadeFoot=plan.edge.clone().addScaledVector(plan.normal,.09).addScaledVector(right,sign*.22);
      const initial=c.mantleStartFeet?.[side];
      if(initial){
        facadeFoot.x=THREE.MathUtils.lerp(initial.x,facadeFoot.x,ease(0,.2));
        facadeFoot.z=THREE.MathUtils.lerp(initial.z,facadeFoot.z,ease(0,.2));
        target.y=THREE.MathUtils.lerp(initial.y,roofFoot.y,lift);
      }
      target.x=THREE.MathUtils.lerp(facadeFoot.x,roofFoot.x,plant);
      target.z=THREE.MathUtils.lerp(facadeFoot.z,roofFoot.z,plant);
    }
    const brace=steppingDown?1-ease(.45,.70):0;
    // Brace knees to each side of the facade rather than folding both legs
    // straight backwards; draw them forward once the feet clear the lip.
    const kneePole=up.clone().multiplyScalar(.8-.2*brace)
      .addScaledVector(plan.normal,-.35+.6*brace).addScaledVector(right,sign*(.3+.6*brace));
    const authoredSole=foot.getWorldQuaternion(new THREE.Quaternion());
    c.solveLimb(hip,knee,foot,target,0.995,kneePole);
    const flat=soleRotation(c,side,up);
    worldRotation(foot,flat?authoredSole.slerp(flat,lift):authoredSole);
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
