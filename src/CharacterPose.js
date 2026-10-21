import * as THREE from 'three';
import { boneId } from './MotionRetarget.js';
import {constrainJoints} from './JointConstraints.js';
import {bindTransforms} from './WebHandPose.js';

const up=new THREE.Vector3(0,1,0);
export const GROUND_SOLE_SPEED=240;
const worldPosition=n=>n.getWorldPosition(new THREE.Vector3());
const find=(c,id)=>Object.values(c.bones || {}).find(b=>boneId(b.name)===id);

// Impact poses can support their weight on a hand, knee or shoulder. Soles
// alone cannot keep a rolling hand or a three-point landing knee above ground.
// Cache directional skin extrema in each dominant bone's bind frame, then
// skin only that surface envelope during these short impact actions.
const impactEnvelopes=new WeakMap();
export function prepareImpactBody(c) {
  const mesh=c.model.getObjectByProperty('isSkinnedMesh',true),geometry=mesh?.geometry;
  if(!geometry)return;
  if(c.impactGeometry!==geometry){
    c.impactGeometry=geometry;
    if(impactEnvelopes.has(geometry)){c.impactVertices=impactEnvelopes.get(geometry);return;}
    const directions=[];
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)
      if(x||y||z)directions.push(new THREE.Vector3(x,y,z).normalize());
    const groups=new Map(),position=geometry.attributes.position,weights=geometry.attributes.skinWeight,indices=geometry.attributes.skinIndex;
    const p=new THREE.Vector3();
    for(let vertex=0;vertex<position.count;vertex++){
      let slot=0;for(let k=1;k<4;k++)if(weights.getComponent(vertex,k)>weights.getComponent(vertex,slot))slot=k;
      const bone=indices.getComponent(vertex,slot);
      if(!groups.has(bone))groups.set(bone,directions.map(()=>({value:-Infinity,vertex:0})));
      p.fromBufferAttribute(position,vertex).applyMatrix4(mesh.bindMatrix).applyMatrix4(mesh.skeleton.boneInverses[bone]);
      const extrema=groups.get(bone);
      for(let k=0;k<directions.length;k++){const value=p.dot(directions[k]);if(value>extrema[k].value)extrema[k]={value,vertex};}
    }
    c.impactVertices=[...new Set([...groups.values()].flatMap(extrema=>extrema.map(p=>p.vertex)))];
    impactEnvelopes.set(geometry,c.impactVertices);
  }
}
export function clearImpactBody(c,delta,active=true) {
  prepareImpactBody(c);
  const mesh=c.model.getObjectByProperty('isSkinnedMesh',true),geometry=mesh?.geometry;
  if(!geometry)return;
  const root=worldPosition(c.group),support=footSupport(c,root);
  if(!support)return;
  const p=new THREE.Vector3();let lift=0;
  for(const vertex of c.impactVertices){
    mesh.localToWorld(mesh.applyBoneTransform(vertex,p.fromBufferAttribute(geometry.attributes.position,vertex)));
    const height=support.height-(support.normal.x*(p.x-root.x)+support.normal.z*(p.z-root.z))/support.normal.y;
    // A small envelope margin covers the gaps between sampled directions.
    lift=Math.max(lift,height+(active?(c.poseState==='ROLLING'?.04:.012):0)-p.y);
  }
  // An interrupted roll still crossfades out of its low pose. Release its
  // support offset with that pose instead of dropping the skin in one frame.
  lift=Math.max(lift,Math.max(0,(c.impactLift || 0)-2*Math.max(0,delta)));
  c.impactLift=lift<.0001?0:lift;
  if(lift>0){c.model.position.y+=lift;c.group.updateMatrixWorld(true);}
}

export function reuseHeldGroundPose(c,delta,grounded) {
  const eligible=grounded && c.poseState==='IDLE' && (c.groundMotionVelocity?.lengthSq() || 0)<.0025 && !(c.mantleFootRelease>0);
  if(!eligible){c.groundPoseInput=null;c.groundPoseStillTime=0;return false;}
  const geometry=c.model.getObjectByProperty('isSkinnedMesh',true)?.geometry;
  if(c.groundPoseModel!==c.model || c.groundPoseGeometry!==geometry){
    c.groundPoseModel=c.model;c.groundPoseGeometry=geometry;c.groundPoseInput=null;c.solvedGroundPose=null;
    c.groundPoseBones=Object.values(c.bones).filter(b=>/^(hips|(?:left|right)(?:upleg|leg|foot|toebase))$/.test(boneId(b.name)));
  }
  const input=[...c.group.position.toArray(),...c.model.position.toArray(),...c.model.quaternion.toArray()];
  for(const b of c.groundPoseBones)input.push(...b.position.toArray(),...b.quaternion.toArray());
  for(const side of ['left','right']){
    const foot=find(c,side+'foot'),sample=foot && footSupport(c,worldPosition(foot));
    input.push(sample?.height ?? null,...(sample?.normal.toArray() || [null,null,null]));
  }
  const same=c.groundPoseInput?.length===input.length && input.every((v,i)=>v===null?c.groundPoseInput[i]===null:Math.abs(v-c.groundPoseInput[i])<1e-8);
  c.groundPoseInput=input;c.groundPoseStillTime=same?(c.groundPoseStillTime || 0)+delta:0;
  if(!same || !c.solvedGroundPose || Object.values(c.groundSoleSettling || {}).some(Boolean) || (delta>0 && c.groundPoseStillTime<.3))return false;
  // An unchanged authored sample, root and support have one solved pose.
  // Re-running a stateful contact solve must not make a held boot creep.
  for(const {bone,p,q} of c.solvedGroundPose){bone.position.copy(p);bone.quaternion.copy(q);}
  c.group.updateMatrixWorld(true);return true;
}

export function cacheGroundPose(c,grounded) {
  c.solvedGroundPose=grounded && c.poseState==='IDLE' && c.groundPoseBones
    ?c.groundPoseBones.map(bone=>({bone,p:bone.position.clone(),q:bone.quaternion.clone()})):null;
}
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
  // A planted foot keeps its world heading while the torso turns. Releasing
  // that plant must not instantly rotate the shin to the new body heading.
  // Filter the requested support frame, never the constrained rendered boot:
  // feeding the latter back into IK made frozen poses drift.
  if(c.groundSoleTargetModel!==c.model){
    c.groundSoleTargetModel=c.model;c.groundSoleTargets=null;c.groundSoleSettling=null;
  }
  c.groundSoleTargets ||= {};c.groundSoleSettling ||= {};
  const desired=rotation.clone().normalize();
  const previous=c.groundSoleTargets[side];
  const target=previous && delta>0
    ?previous.clone().rotateTowards(desired,THREE.MathUtils.degToRad(GROUND_SOLE_SPEED)*delta).normalize()
    :desired.clone();
  c.groundSoleTargets[side]=target;
  c.groundSoleSettling[side]=target.angleTo(desired)>1e-5;
  fitGroundAnkle(c,side,foot,target);c.groundFootRotations[side]=target.clone();
}

export function fitGroundAnkle(c,side,foot,rotation) {
  fitEndRotation(c,find(c,side+'upleg'),find(c,side+'leg'),foot,rotation);
}
function fitEndRotation(c,upper,lower,end,rotation) {
  const constraint=c.jointConstraints?.find(item=>item.bone===end);
  if(constraint){
    const local=end.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation);
    if(constraint.kind==='foot' || constraint.rest.angleTo(local)>constraint.limit){
      const anchor=worldPosition(end);
      const idealParent=rotation.clone().multiply(constraint.rest.clone().invert());
      const pole=constraint.kind==='foot'
        ?new THREE.Vector3(0,0,1).applyQuaternion(c.model.getWorldQuaternion(new THREE.Quaternion()))
        :anchor.clone().sub(end.position.clone().applyQuaternion(idealParent)).sub(worldPosition(upper));
      c.solveLimb(upper,lower,end,anchor,constraint.kind==='foot'?.985:.995,pole);
      // The position solve leaves the shin/forearm's axial roll arbitrary.
      // Fit that roll to the requested end orientation without moving its
      // endpoint. Repeatedly adding twist after IK caused held poses to drift.
      const desiredAxis=end.position.clone().normalize().applyQuaternion(idealParent);
      const actualAxis=worldPosition(end).sub(worldPosition(lower)).normalize();
      worldRotation(lower,new THREE.Quaternion().setFromUnitVectors(desiredAxis,actualAxis).multiply(idealParent));
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

export function clearGroundSoles(c,{preserveLocal=false}={}) {
  for(const side of ['left','right']){
    const hip=find(c,side+'upleg'),knee=find(c,side+'leg'),foot=find(c,side+'foot');if(!hip||!knee||!foot)continue;
    const samples=soleSamples(c,side);if(!samples.length)continue;
    const rotation=foot.getWorldQuaternion(new THREE.Quaternion());
    const local=foot.quaternion.clone();
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
      c.solveLimb(hip,knee,foot,ankle.addScaledVector(up,lift),.98);
      if(preserveLocal){foot.quaternion.copy(local);foot.updateMatrixWorld(true);}
      else fitGroundAnkle(c,side,foot,rotation);
      constrainJoints(c.jointConstraints?.filter(item=>item.bone===foot));
    }
    const actual=worldPosition(foot),plant=c.movingPlants?.[side];
    if(plant){
      const support=footSupport(c,actual);
      if(support){
        let clearance=Infinity;
        for(const {mesh,vertex} of samples){
          const p=mesh.localToWorld(mesh.applyBoneTransform(vertex,new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,vertex)));
          const height=support.height-(support.normal.x*(p.x-actual.x)+support.normal.z*(p.z-actual.z))/support.normal.y;
          clearance=Math.min(clearance,p.y-height);
        }
        if(clearance>=-.005 && clearance<.06){
          plant.offset=actual.y-support.height+THREE.MathUtils.clamp(.003-clearance,-.012,.012);
          plant.position.y=support.height+plant.offset;
        }
      }
    }
    // A boot can span two support heights at a ramp/step exit. Sole clearance
    // takes priority; once it moves the ankle off its anchor, release that
    // contact instead of reporting a planted foot and pulling it down again.
    if(plant && plant.age>.08 && actual.distanceTo(plant.position)>.03){
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
  const rotation=new THREE.Quaternion().setFromUnitVectors(sole,normal).multiply(authored);
  // Imported boxing stances can turn the rear boot past perpendicular to the
  // opponent. Keep its support heading in the stance, without adding ankle bend.
  if(['combatIdle','jab','cross','rightHook','hook','heavy','special'].includes(c.activeAction?.getClip().name)){
    const toe=find(c,side+'toebase');
    if(toe){
      const heading=toe.position.clone().applyQuaternion(rotation).projectOnPlane(normal).normalize();
      const forward=new THREE.Vector3(0,0,1).applyQuaternion(c.model.getWorldQuaternion(new THREE.Quaternion())).projectOnPlane(normal).normalize();
      const yaw=Math.atan2(normal.dot(forward.clone().cross(heading)),forward.dot(heading));
      const limit=THREE.MathUtils.degToRad(45);
      rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(normal,THREE.MathUtils.clamp(yaw,-limit,limit)-yaw));
    }
  }
  return rotation;
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

function alignStraightPalm(c,side,hand,normal,previousPalm,delta) {
  const constraint=c.jointConstraints?.find(item=>item.bone===hand);
  if(constraint)hand.quaternion.copy(constraint.rest);
  hand.updateMatrixWorld(true);
  const wrist=worldPosition(hand),index=find(c,side+'handindex1'),pinky=find(c,side+'handpinky1');
  if(!index || !pinky)return;
  const axis=wrist.clone().sub(worldPosition(hand.parent)).normalize();
  const palm=new THREE.Vector3().crossVectors(worldPosition(index).sub(wrist),worldPosition(pinky).sub(wrist)).normalize().multiplyScalar(side==='left'?1:-1);
  const from=palm.addScaledVector(axis,-palm.dot(axis));
  const to=normal.clone().negate();to.addScaledVector(axis,-to.dot(axis));
  // Near a straight reach into the facade, the projected wall normal has
  // no stable direction. Normalizing it first turned numerical noise into
  // a 180-degree pronation flip. Keep the last palm in that singular region.
  const previous=previousPalm?.clone().addScaledVector(axis,-previousPalm.dot(axis));
  if(from.lengthSq()<.0001)return;from.normalize();
  if(previous && previous.lengthSq()>.0001){
    previous.normalize();
    const strength=palmAlignmentWeight(to.length());
    if(to.lengthSq()>.0001){
      to.normalize();
      const turn=Math.atan2(axis.dot(new THREE.Vector3().crossVectors(previous,to)),previous.dot(to));
      to.copy(previous).applyAxisAngle(axis,THREE.MathUtils.clamp(turn*strength,-Math.PI*2*delta,Math.PI*2*delta));
    }else to.copy(previous);
  }else {if(to.lengthSq()<.01)return;to.normalize();}
  const angle=Math.atan2(axis.dot(new THREE.Vector3().crossVectors(from,to)),from.dot(to));
  // Aim the palm by pronating the forearm, keeping the wrist straight.
  hand.parent.rotateOnAxis(hand.position.clone().normalize(),angle);hand.parent.updateMatrixWorld(true);
}

function palmAlignmentWeight(projection){return THREE.MathUtils.smoothstep(projection,.12,.4);}

// Only the authored stance window is planted. Swinging feet and unsupported
// ledges must remain free; an unreachable plant is released, never stretched.
export function plantMovingFeet(c,delta) {
  const action=c.activeAction,clip=action?.getClip(),contacts=clip?.userData?.footContacts;
  if (!contacts?.length) {
    c.movingPlants=null;c.movingReleases=null;c.plantLastFeet=null;c.groundFootRotations=null;
    // Idle has no authored contact windows. Keep resolving the same support
    // frame through its crossfade: dropping it here instantly restored the
    // animated shin roll on the first frame after a turn or a running stop.
    if(c.groundSoleTargets)for(const side of ['left','right']){
      const foot=find(c,side+'foot'),support=foot && footSupport(c,worldPosition(foot));
      const rotation=support && soleRotation(c,side,support.normal);
      if(rotation)orientGroundFoot(c,side,foot,rotation,delta);
    }
    return;
  }
  const root=worldPosition(c.group);
  if(c.plantRoot && c.plantRoot.distanceTo(root)>0.8) {c.movingPlants=null;c.movingReleases=null;c.plantLastFeet=null;c.groundFootRotations=null;c.groundSoleTargets=null;c.groundSoleSettling=null;}
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
    const reachable=worldPosition(hip).distanceTo(candidate)<=length*0.975;
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
      const neutral=supported?soleRotation(c,side,support.normal):null;
      const rotation=neutral || (release && supported?authored.slerp(release.rotation,Math.exp(-release.age/0.075)):authored);
      orientGroundFoot(c,side,foot,rotation,delta);
      c.plantLastFeet[side]=worldPosition(foot);
      continue;
    }
    if(!plant || plant.action!==action) {
      plant=c.movingPlants[side]={action,position:current.clone(),rotation:soleRotation(c,side,support.normal) || foot.getWorldQuaternion(new THREE.Quaternion()),age:0,normal:support.normal,offset:.11};
      // Shorten the imported rear stance with its heading correction. Turning
      // only the boot while keeping that long rear reach rolls its outer edge.
      if(side==='right' && ['combatIdle','jab','cross','rightHook','hook','heavy','special'].includes(clip.name)){
        const forward=new THREE.Vector3(0,0,1).applyQuaternion(c.model.getWorldQuaternion(new THREE.Quaternion())).projectOnPlane(support.normal).normalize();
        plant.position.addScaledVector(forward,.10);
      }
      plant.position.y=surface+0.11;
    }
    // Keep a stance anchored to the actual support, including a changed LOD.
    if(Math.abs(plant.position.y-surface-(plant.offset ?? .11))>0.12) {
      delete c.movingPlants[side];delete c.movingReleases[side];continue;
    }
    plant.position.y=THREE.MathUtils.damp(plant.position.y,surface+(plant.offset ?? .11),20,delta);
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
    // Keep one support frame while acquiring the plant. Blending the raw
    // imported boot orientation here changed the shin's axial frame every
    // time reachability reacquired a contact, producing a visible calf snap.
    // The final local ankle stage already owns temporal easing.
    const rotation=plant.rotation;
    c.solveLimb(hip,knee,foot,target,0.995);
    orientGroundFoot(c,side,foot,rotation,delta);
    c.plantLastFeet[side]=worldPosition(foot);
  }
}

// Distance, rather than the source take's clock, owns the crawl. Diagonal
// supports overlap; a released limb follows an arc with zero endpoint speed.
const crawlStride=1.05;
const smooth=t=>t*t*(3-2*t);
function crawlBootDepth(c,side,normal,right) {
  const geometry=c.model.getObjectByProperty('isSkinnedMesh',true)?.geometry;
  if(c.wallBootGeometry!==geometry){c.wallBootGeometry=geometry;c.wallBootDepth={};}
  if(c.wallBootDepth?.[side])return c.wallBootDepth[side];
  const foot=find(c,side+'foot'),flat=c.wallSoleRotations?.[side];
  if(!foot || !flat)return .23;
  const scale=foot.getWorldScale(new THREE.Vector3());let depth=.18;
  // Measure the real boot in bind coordinates; the two appearances have
  // different toe/sole thicknesses even though they share the same bones.
  for(const {mesh,vertex} of soleSamples(c,side)){
    const index=mesh.skeleton.bones.indexOf(foot);if(index<0)continue;
    const local=new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,vertex)
      .applyMatrix4(mesh.bindMatrix).applyMatrix4(mesh.skeleton.boneInverses[index]).multiply(scale);
    for(const pitch of [-.8,-.9]){
      const rotation=new THREE.Quaternion().setFromAxisAngle(right,pitch)
        .multiply(flat);
      depth=Math.max(depth,-local.clone().applyQuaternion(rotation).dot(normal)+.045);
    }
  }
  c.wallBootDepth ||= {};return c.wallBootDepth[side]=depth;
}
function crawlContact(c,id,base,normal,direction,phase,delta,speed) {
  const crawlStance=id.endsWith('hand')?.64:.62;
  let contact=c.wallContacts[id];
  const stance=phase<crawlStance;
  if(!contact)contact=c.wallContacts[id]={stance,age:0,last:base.clone(),
    position:base.clone().addScaledVector(direction,(crawlStance/2-phase)*crawlStride)};
  if(stance && !contact.stance){
    contact.position=base.clone().addScaledVector(direction,(crawlStance/2-phase)*crawlStride);
    contact.age=0;contact.from=null;contact.to=null;
  }
  if(!stance && (contact.stance || !contact.from)){
    contact.from=contact.last.clone();contact.age=0;
  }
  contact.stance=stance;
  let target;
  if(stance){target=contact.position.clone();contact.age+=delta;contact.swing=0;}
  else{
    const t=(phase-crawlStance)/(1-crawlStance);contact.swing=t;
    // Predict the next hold in world space. Recompute it when steering so
    // reversing direction never sends a hand through the opposite arm.
    const destination=base.clone().addScaledVector(direction,(1-phase+crawlStance/2)*crawlStride);
    contact.to=destination;
    target=contact.from.clone().lerp(destination,smooth(t));
    target.addScaledVector(normal,Math.sin(Math.PI*t)**2*(id.endsWith('hand')?.085:.11)*c.wallLiftWeight);
  }
  // Acquisition and steering use a time-based bound at every frame rate.
  const move=target.clone().sub(contact.last),limit=(7+2*speed)*delta;
  if(delta>0 && move.length()>limit)target.copy(contact.last).add(move.setLength(limit));
  if(stance && target.distanceTo(contact.position)>.005)contact.age=0;
  contact.last.copy(target);return {contact,target};
}

export function poseWall(c,delta,velocity) {
  const normal=c.wallNormal.clone().normalize(),root=worldPosition(c.group);
  const right=new THREE.Vector3().crossVectors(up,normal.clone().negate()).normalize();
  const travel=velocity.clone().addScaledVector(normal,-velocity.dot(normal));
  const speed=travel.length(),moved=c.wallPoseRoot?root.distanceTo(c.wallPoseRoot):0;
  if(moved>.8){c.wallContacts=null;c.wallPhase=0;c.wallPoseWeight=0;c.wallTravelDirection=null;c.wallLiftWeight=0;c.wallPalmDirections=null;}
  c.wallPoseRoot=root.clone();c.wallPhase=((c.wallPhase || 0)+(moved>.8?0:moved)/crawlStride)%1;
  c.wallContacts ||= {};
  c.wallLiftWeight=THREE.MathUtils.damp(c.wallLiftWeight ?? 0,Math.min(1,speed/.3),18,delta);
  c.wallPoseWeight=THREE.MathUtils.damp(c.wallPoseWeight || 0,1,18,delta);
  if(speed>.01){
    const desired=travel.normalize();
    c.wallTravelDirection ||= desired.clone();
    const turn=Math.atan2(normal.dot(c.wallTravelDirection.clone().cross(desired)),
      c.wallTravelDirection.dot(desired));
    c.wallTravelDirection.applyAxisAngle(normal,turn*(1-Math.exp(-8*delta))).normalize();
  }
  const direction=c.wallTravelDirection || up;
  if(c.wallBindModel!==c.model){c.wallBindModel=c.model;c.wallBind=bindTransforms(c.model);c.wallPalmDirections=null;}
  c.wallPalmDirections ||= {};
  // Replace the exaggerated source pelvis/limbs, including the outward knee
  // kicks, with a quiet spine and deliberate reaches on this rig's bind axes.
  for(const [bone,rest] of c.wallBind){
    if(/^(hips|spine\d*|neck|head|(?:left|right)(?:shoulder|arm|forearm|hand|upleg|leg|foot|toebase))$/.test(boneId(bone.name))){
      bone.quaternion.slerp(rest.quaternion,c.wallPoseWeight);
      if(boneId(bone.name)==='hips')bone.position.lerp(rest.position,c.wallPoseWeight);
    }
  }
  c.group.updateMatrixWorld(true);
  const hips=find(c,'hips'),spine=find(c,'spine');
  const transfer=Math.sin(c.wallPhase*Math.PI*2)*c.wallPoseWeight;
  if(hips){
    hips.position.copy(hips.parent.worldToLocal(worldPosition(hips).addScaledVector(right,.032*transfer).addScaledVector(normal,.20*c.wallPoseWeight)));
    worldRotation(hips,new THREE.Quaternion().setFromAxisAngle(right,.32*c.wallPoseWeight)
      .multiply(new THREE.Quaternion().setFromAxisAngle(up,.045*transfer)).multiply(hips.getWorldQuaternion(new THREE.Quaternion())));
  }
  if(spine)worldRotation(spine,new THREE.Quaternion().setFromAxisAngle(up,-.065*transfer).multiply(spine.getWorldQuaternion(new THREE.Quaternion())));
  for(const side of ['left','right'])for(const limb of ['hand','foot']){
    const hand=limb==='hand',sign=side==='left'?1:-1,id=side+limb;
    const upper=find(c,side+(hand?'arm':'upleg')),lower=find(c,side+(hand?'forearm':'leg')),end=find(c,id);
    if(!upper || !lower || !end)continue;
    // Cross-crawl: the reaching hand travels with the opposite foot.
    // Overlapping stance intervals keep a diagonal support pair planted.
    const phase=(c.wallPhase+(side==='left'?0:.5)+(hand?.04:.5))%1;
    const base=root.clone().addScaledVector(normal,-(c.wallDistance ?? .7)+(hand?.03:crawlBootDepth(c,side,normal,right)))
      .addScaledVector(up,hand?1.73:.38).addScaledVector(right,sign*(hand?.28:.235));
    const {contact,target}=crawlContact(c,id,base,normal,direction,phase,delta,speed);
    const effector=hand?(find(c,side+'handmiddle4') || end):end;
    contact.effectorId=boneId(effector.name);
    if(hand){const constraint=c.jointConstraints?.find(item=>item.bone===end);if(constraint){end.quaternion.copy(constraint.rest);end.updateMatrixWorld(true);}}
    let grip=0;
    if(hand){
      c.wallGripHeights ||= {};c.wallGripTargets ||= {};c.wallGripWeights ||= {};
      const probe=target.clone().addScaledVector(normal,-.3);probe.y=root.y+1.8;
      let sample=c.surfaceProbe?.(probe);const cached=c.wallGripHeights[side];
      if(!sample && Number.isFinite(cached)){probe.y=cached+.4;sample=c.surfaceProbe?.(probe);}
      const ledge=sample && sample.normal.y>.85 && sample.height>=root.y-.2 && sample.height<=root.y+1.8;
      grip=c.wallGripWeights[side]=THREE.MathUtils.damp(c.wallGripWeights[side] || 0,ledge?1:0,18,delta);
      if(ledge)c.wallGripHeights[side]=sample.height;
      const height=c.wallGripHeights[side];
      if(Number.isFinite(height) && grip>.001){
        const roofGrip=target.clone().addScaledVector(normal,-.24);roofGrip.y=height+.06;
        c.wallGripTargets[side] ||= target.clone();c.wallGripTargets[side].lerp(roofGrip,1-Math.exp(-8*delta));
        target.lerp(c.wallGripTargets[side],grip);
      }
    }
    const start=worldPosition(effector),pole=normal.clone().multiplyScalar(hand?.4:-1)
      .addScaledVector(right,sign*(hand?.5:.18)).addScaledVector(up,hand?-.45:0);
    const goal=start.lerp(target,c.wallPoseWeight);
    c.solveLimb(upper,lower,effector,goal,.985,pole);
    if(hand){
      const palmNormal=normal.clone().lerp(up,grip).normalize();
      const previousPalm=c.wallPalmDirections[side];
      alignStraightPalm(c,side,end,palmNormal,previousPalm,delta);
      // The open middle fingertip is the effector. Its rigid extension of
      // the forearm permits a stable wall contact with a straight wrist.
      // Pronation can move the slightly relaxed tip by a few millimetres.
      for(let pass=0;pass<2;pass++){
        c.solveLimb(upper,lower,effector,goal,.985,pole);
        alignStraightPalm(c,side,end,palmNormal,previousPalm,delta);
      }
      const wrist=worldPosition(end),index=find(c,side+'handindex1'),pinky=find(c,side+'handpinky1');
      c.wallPalmDirections[side]=new THREE.Vector3().crossVectors(worldPosition(index).sub(wrist),worldPosition(pinky).sub(wrist)).normalize().multiplyScalar(side==='left'?1:-1);
    }else{
      const flat=c.wallSoleRotations?.[side];
      if(flat){
        // Forefoot purchase with a raised heel avoids forcing the ankle into
        // a flat 90-degree wall bend. The shin participates in this rotation.
        const rotation=new THREE.Quaternion().setFromAxisAngle(right,-.8-.1*Math.sin(Math.PI*contact.swing)**2)
          .multiply(flat);
        worldRotation(end,rotation);
      }
    }
    // Preserve the forward knee pole. Re-solving a leg from the desired
    // sole orientation can put its knee on the opposite side of the hip.
    // Report a support only when the final chain can actually reach its hold.
    if(contact.stance && worldPosition(effector).distanceTo(contact.position)>.025)contact.age=0;
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
    if(c.mantleStartFeet?.[side])target.lerpVectors(c.mantleStartFeet[side],target,ease(.12,.4));
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

// Read the anatomical forward axis from the skin bind pose rather than
// assuming that a Mixamo head's local +Z points through the face.
export function alignCombatGaze(c,delta,active) {
  c.combatGazeWeight=THREE.MathUtils.damp(c.combatGazeWeight||0,active?1:0,14,delta);
  if(c.combatGazeWeight<.001)return;
  const head=find(c,'head'),neck=find(c,'neck');if(!head)return;
  if(c.combatGazeModel!==c.model){
    const mesh=c.model.getObjectByProperty('isSkinnedMesh',true),index=mesh?.skeleton.bones.indexOf(head);
    if(!(index>=0))return;
    const bind=new THREE.Quaternion();mesh.skeleton.boneInverses[index].clone().invert().decompose(new THREE.Vector3(),bind,new THREE.Vector3());
    c.combatGazeForward=new THREE.Vector3(0,0,1).applyQuaternion(bind.invert());
    c.combatGazeUp=new THREE.Vector3(0,1,0).applyQuaternion(bind);c.combatGazeModel=c.model;
  }
  c.group.updateMatrixWorld(true);
  const from=c.combatGazeForward.clone().applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion())).normalize();
  const to=new THREE.Vector3(0,-.08,1).normalize().applyQuaternion(c.model.getWorldQuaternion(new THREE.Quaternion()));
  const correction=new THREE.Quaternion().setFromUnitVectors(from,to);
  // Facing correction alone leaves the imported guard's sideways head roll.
  // Keep a small natural lean while leveling the eyes above the moving torso.
  const predictedUp=c.combatGazeUp.clone().applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()))
    .applyQuaternion(correction).projectOnPlane(to).normalize();
  const desiredUp=new THREE.Vector3(0,1,0).applyQuaternion(c.model.getWorldQuaternion(new THREE.Quaternion()))
    .projectOnPlane(to).normalize();
  const roll=Math.atan2(to.dot(predictedUp.clone().cross(desiredUp)),predictedUp.dot(desiredUp));
  const limit=THREE.MathUtils.degToRad(8);
  correction.premultiply(new THREE.Quaternion().setFromAxisAngle(to,roll-THREE.MathUtils.clamp(roll,-limit,limit)));
  for(const [bone,share]of [[neck,.55],[head,neck ? .45 : 1]]){
    if(!bone)continue;
    const turn=new THREE.Quaternion().slerp(correction,share*c.combatGazeWeight);
    const world=turn.multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world)).normalize();bone.updateMatrixWorld(true);
  }
}
