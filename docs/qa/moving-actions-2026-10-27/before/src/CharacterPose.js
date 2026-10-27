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
      // A side-step punch keeps the chest on the aim and the stride on the
      // travel. The model forward is the aim, so using it as the knee pole
      // folds the trailing knee out past the hip.
      const hipYaw=c.strikeHipYaw || 0;
      let pole;
      if(constraint.kind==='foot' && Math.abs(hipYaw)>0.12){
        const knee=worldPosition(lower).sub(worldPosition(upper));
        const limb=anchor.clone().sub(worldPosition(upper));
        const off=knee.clone().addScaledVector(limb,-knee.dot(limb)/Math.max(limb.lengthSq(),1e-8));
        const yaw=(c.targetFacingAngle || 0)+hipYaw;
        pole=off.lengthSq()>0.0015?knee:new THREE.Vector3(Math.sin(yaw),0.45,Math.cos(yaw));
      }else if(constraint.kind==='foot'){
        pole=new THREE.Vector3(0,0,1).applyQuaternion(c.model.getWorldQuaternion(new THREE.Quaternion()));
      }else pole=anchor.clone().sub(end.position.clone().applyQuaternion(idealParent)).sub(worldPosition(upper));
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
  // The pelvis yaws toward a side step while the chest stays on the aim.
  // Toes follow that stride. Leaving them on the model heading twists the ankle
  // a quarter turn and the correction collapses the knee.
  if(Math.abs(c.strikeHipYaw || 0)>0.02)
    authored.premultiply(new THREE.Quaternion().setFromAxisAngle(up,c.strikeHipYaw));
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
  // The previous stair/ramp crouch must ease out in the air as well.
  // Dropping its render offset at takeoff snaps both feet above their reach.
  if(grounded || ['JUMPING','FALLING'].includes(c.poseState))c.model.position.y+=c.terrainPelvis;
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
  // At a straight reach into the wall, forearm pronation alone leaves the
  // palm exactly edge-on. A small wrist purchase keeps its contact side
  // facing the facade as the diagonal reach crosses that singularity.
  const currentWrist=worldPosition(hand),toward=normal.clone().negate();
  const currentPalm=new THREE.Vector3().crossVectors(worldPosition(index).sub(currentWrist),worldPosition(pinky).sub(currentWrist)).normalize().multiplyScalar(side==='left'?1:-1);
  const facing=currentPalm.dot(toward);
  if(facing<.035){
    const axis=new THREE.Vector3().crossVectors(currentPalm,toward).normalize();
    const purchase=Math.min(THREE.MathUtils.degToRad(3),Math.asin(.035)-Math.asin(THREE.MathUtils.clamp(facing,-1,1)));
    worldRotation(hand,new THREE.Quaternion().setFromAxisAngle(axis,purchase).multiply(hand.getWorldQuaternion(new THREE.Quaternion())));
  }
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
    // A changed tread must release through the same bounded path as toe-off.
    // Skipping this solve restored the far-away authored foot in one frame.
    const changedSupport=plant && supported && Math.abs(plant.position.y-surface-(plant.offset ?? .11))>.12;
    // A side-step turns the pelvis after the plant was taken. Holding that
    // old contact drags the foot across the new thigh and folds the knee back.
    const turned=plant && Math.abs(Math.atan2(Math.sin((c.strikeHipYaw || 0)-(plant.yaw || 0)), Math.cos((c.strikeHipYaw || 0)-(plant.yaw || 0))))>0.4;
    const stance=sample[side] && supported && action.getEffectiveWeight()>=0.8 && reachable && !changedSupport && !turned;
    const yaw=(c.targetFacingAngle || 0)+(c.strikeHipYaw || 0);
    const kneePole=Math.abs(c.strikeHipYaw || 0)>0.15
      ?new THREE.Vector3(Math.sin(yaw),0.2,Math.cos(yaw))
      :null;
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
      plant=c.movingPlants[side]={action,position:current.clone(),rotation:soleRotation(c,side,support.normal) || foot.getWorldQuaternion(new THREE.Quaternion()),age:0,normal:support.normal,offset:.11,yaw:c.strikeHipYaw || 0};
      // Shorten the imported rear stance with its heading correction. Turning
      // only the boot while keeping that long rear reach rolls its outer edge.
      if(side==='right' && ['combatIdle','jab','cross','rightHook','hook','heavy','special'].includes(clip.name)){
        const forward=new THREE.Vector3(0,0,1).applyQuaternion(c.model.getWorldQuaternion(new THREE.Quaternion())).projectOnPlane(support.normal).normalize();
        // Braking into a full-body punch needs a slightly shorter rear
        // support than a travelling guard, keeping the boot off its outer edge.
        const strike=!!c.combatAction?.duration && (c.groundMotionVelocity?.lengthSq() || 0)>.0025 && ['jab','cross','hook','heavy','special'].includes(c.combatAction.key);
        plant.position.addScaledVector(forward,strike ? .22 : .10);
      }
      plant.position.y=surface+0.11;
    }
    // Keep a stance anchored to the actual support, including a changed LOD.
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
    c.solveLimb(hip,knee,foot,target,0.995,kneePole);
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

// Keep the actual helmet, neck and torso surface outside the facade. Limb
// IK runs afterwards, so this body clearance never drags planted hands away.
function clearWallBody(c,normal,root) {
  prepareImpactBody(c);
  const mesh=c.model.getObjectByProperty('isSkinnedMesh',true);if(!mesh)return;
  if(c.wallBodyMesh!==mesh || c.wallBodyGeometry!==mesh.geometry){
    c.wallBodyMesh=mesh;c.wallBodyGeometry=mesh.geometry;
    const indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
    const body=mesh.skeleton.bones.map(b=>/^(head|neck|spine\d*)$/.test(boneId(b.name)));
    c.wallBodyVertices=c.impactVertices.filter(vertex=>{
      let weight=0;for(let k=0;k<4;k++)if(body[indices.getComponent(vertex,k)])weight+=weights.getComponent(vertex,k);
      return weight>.5;
    });
  }
  const plane=root.dot(normal)-(c.wallDistance ?? .7),point=new THREE.Vector3();let clearance=Infinity;
  for(const vertex of c.wallBodyVertices){
    mesh.localToWorld(mesh.applyBoneTransform(vertex,point.fromBufferAttribute(mesh.geometry.attributes.position,vertex)));
    clearance=Math.min(clearance,point.dot(normal)-plane);
  }
  const correction=Math.max(0,.06-clearance),hips=find(c,'hips');
  c.wallBodyClearance=clearance;c.wallBodyCorrection=correction;
  if(correction>0 && hips){
    hips.position.copy(hips.parent.worldToLocal(worldPosition(hips).addScaledVector(normal,correction)));
    c.group.updateMatrixWorld(true);
  }
}

export function poseWall(c,delta,velocity) {
  const normal=c.wallNormal.clone().normalize(),root=worldPosition(c.group);
  const right=new THREE.Vector3().crossVectors(up,normal.clone().negate()).normalize();
  const travel=velocity.clone().addScaledVector(normal,-velocity.dot(normal));
  const speed=travel.length(),moved=c.wallPoseRoot?root.distanceTo(c.wallPoseRoot):0;
  if(moved>.8){c.wallContacts=null;c.wallPhase=0;c.wallPoseWeight=0;c.wallTravelDirection=null;c.wallLiftWeight=0;c.wallPalmDirections=null;}
  c.wallPoseRoot=root.clone();c.wallPhase=((c.wallPhase || 0)+(moved>.8?0:moved)/crawlStride)%1;
  c.wallPhaseRate=delta>0&&moved<=.8?moved/(delta*crawlStride):0;
  if(Number.isFinite(c.networkWallPhase))c.wallPhase=c.networkWallPhase;
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
  if(spine)worldRotation(spine,new THREE.Quaternion().setFromAxisAngle(right,-.18*c.wallPoseWeight)
    .multiply(new THREE.Quaternion().setFromAxisAngle(up,-.065*transfer)).multiply(spine.getWorldQuaternion(new THREE.Quaternion())));
  const neck=find(c,'neck');
  if(neck)worldRotation(neck,new THREE.Quaternion().setFromAxisAngle(right,-.18*c.wallPoseWeight).multiply(neck.getWorldQuaternion(new THREE.Quaternion())));
  clearWallBody(c,normal,root);
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
    if(!hand){
      // Prepare the knee's roof-transfer plane while still climbing. Waiting
      // until MANTLING switched an otherwise planted leg in a single frame.
      const heights=Object.values(c.wallGripHeights || {}).filter(Number.isFinite);
      const probe=root.clone().addScaledVector(normal,-(c.wallDistance ?? .7)-.35);probe.y+=4.3;
      const ahead=c.surfaceProbe?.(probe,4.4);
      if(ahead?.normal.y>.85 && ahead.height>root.y+.9 && ahead.height<root.y+4.2)heights.push(ahead.height);
      if(heights.length){
        const roof=Math.max(...heights),transfer=THREE.MathUtils.smoothstep(root.y,roof-3.4,roof-1.8);
        const roofPole=up.clone().multiplyScalar(.8).addScaledVector(normal,-.35).addScaledVector(right,sign*.3);
        pole.lerp(roofPole,transfer);
      }
    }
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
  const hang = Math.sin((c.webVisualTime || 0) * 2.15);
  const sway = Math.sin((c.webVisualTime || 0) * 1.35 + 0.6);
  pitchModelX(c, find(c, 'spine'), 0.07 * hang);
  pitchModelX(c, find(c, 'spine1'), 0.04 * hang);
  rollModelZ(c, find(c, 'spine'), 0.05 * sway);
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

function yawWorld(bone, angle) {
  if (!bone || Math.abs(angle) < 1e-4) return;
  const world = bone.getWorldQuaternion(new THREE.Quaternion());
  world.premultiply(new THREE.Quaternion().setFromAxisAngle(up, angle));
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world)).normalize();
  bone.updateMatrixWorld(true);
}

function pitchModelX(c, bone, angle) {
  if (!bone || Math.abs(angle) < 1e-4) return;
  const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(c.model.getWorldQuaternion(new THREE.Quaternion())).normalize();
  const world = bone.getWorldQuaternion(new THREE.Quaternion());
  world.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world)).normalize();
  bone.updateMatrixWorld(true);
}

// Moving punches keep the chest on the aim. Side steps turn the pelvis toward
// the travel, then the spine brings the chest back. A retreat reverses the
// stride and leans the chest back instead of twisting it past a half turn.
export function alignStrikeFootwork(c, delta, active, offset, combat) {
  const strafe = active && Math.abs(offset) > 0.28 && Math.abs(offset) <= 2;
  const target = strafe ? offset : 0;
  c.strikeHipYaw = THREE.MathUtils.damp(c.strikeHipYaw || 0, target, active ? 11 : 14, delta);
  if (Math.abs(c.strikeHipYaw) > 0.012) {
    yawWorld(find(c, 'hips'), c.strikeHipYaw);
    // The whole twist comes back through the waist. Stopping it at the neck
    // left the shoulders turned toward a right step, because a jab already
    // cocks the chest that way and the leftover yaw sat on top of it.
    const back = -c.strikeHipYaw;
    yawWorld(find(c, 'spine'), back * 0.30);
    yawWorld(find(c, 'spine1'), back * 0.42);
    const spine2 = find(c, 'spine2');
    yawWorld(spine2, back * 0.28);
    const left = find(c, 'leftshoulder'), right = find(c, 'rightshoulder');
    if (left && right) {
      const across = right.getWorldPosition(new THREE.Vector3()).sub(left.getWorldPosition(new THREE.Vector3()));
      const facing = new THREE.Vector3().crossVectors(up, across);
      facing.y = 0;
      const aim = new THREE.Vector3(Math.sin(c.targetFacingAngle || 0), 0, Math.cos(c.targetFacingAngle || 0));
      if (facing.lengthSq() > 1e-6) {
        facing.normalize();
        const turn = Math.atan2(up.dot(new THREE.Vector3().crossVectors(facing, aim)), facing.dot(aim));
        yawWorld(spine2, THREE.MathUtils.clamp(turn, -0.45, 0.45));
      }
    }
  } else c.strikeHipYaw = 0;
  if (active && Math.abs(offset) > 2) {
    // Model +X pitch drops the facing +Z axis. Negative pitch leans the chest back.
    pitchModelX(c, find(c, 'spine'), -0.2);
    pitchModelX(c, find(c, 'spine1'), -0.12);
  }
  if (!(active && Math.abs(offset) < 0.45 && combat?.duration && ['jab', 'cross', 'hook', 'heavy', 'special'].includes(combat.key))) return;
  const phase = THREE.MathUtils.clamp(combat.time / combat.duration, 0, 1);
  const drive = Math.sin(Math.PI * THREE.MathUtils.clamp(phase / 0.48, 0, 1));
  const side = {jab: 0.02, cross: -0.028, hook: 0.018, heavy: -0.03, special: -0.02}[combat.key] || 0;
  const hips = find(c, 'hips');
  if (!hips?.parent) return;
  // Side shift is the punch. Negative forward settles the pelvis back over
  // the supporting stride instead of lunging it past the lead boot.
  const shift = new THREE.Vector3(side * drive, 0, -0.018 * drive).applyQuaternion(c.model.getWorldQuaternion(new THREE.Quaternion()));
  const parent = hips.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  shift.applyQuaternion(parent).divide(hips.parent.getWorldScale(new THREE.Vector3()));
  hips.position.add(shift);
  hips.updateMatrixWorld(true);
}

function smooth01(t) {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function rollModelZ(c, bone, angle) {
  if (!bone || Math.abs(angle) < 1e-4) return;
  // Model +Z is the facing axis. Positive roll lifts the character's left (+X).
  const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(c.model.getWorldQuaternion(new THREE.Quaternion())).normalize();
  const world = bone.getWorldQuaternion(new THREE.Quaternion());
  world.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world)).normalize();
  bone.updateMatrixWorld(true);
}

// A heavy shot stays in the chamber, then drives the hook through. The clip
// phase waits until the shoulders have loaded, and meets the hook at its impact.
export function heavyClipPhase(t) {
  const u = THREE.MathUtils.clamp(t, 0, 1);
  if (u < 0.40) return 0.18 * smooth01(u / 0.40);
  if (u < 0.70) return 0.18 + 0.54 * smooth01((u - 0.40) / 0.30);
  return 0.72 + 0.28 * smooth01((u - 0.70) / 0.30);
}

// Dodge, hit, guard and heavy read through the body. The sourced clips for
// those actions are a still stance, a tiny flinch, or the same hook.
export function poseCombatLife(c, combat) {
  const key = combat?.key;
  if (!key) return;
  const duration = combat.duration || 1;
  const t = THREE.MathUtils.clamp((combat.time || 0) / duration, 0, 1);
  if (key.startsWith('dodge')) {
    const envelope = Math.sin(Math.PI * t);
    if (key === 'dodgeLeft' || key === 'dodgeRight') {
      const sign = key === 'dodgeLeft' ? 1 : -1;
      rollModelZ(c, find(c, 'spine'), -0.34 * sign * envelope);
      rollModelZ(c, find(c, 'spine1'), -0.18 * sign * envelope);
      rollModelZ(c, find(c, 'head'), 0.16 * sign * envelope);
    } else if (key === 'dodgeBack') {
      pitchModelX(c, find(c, 'spine'), -0.28 * envelope);
      pitchModelX(c, find(c, 'spine1'), -0.14 * envelope);
    } else {
      pitchModelX(c, find(c, 'spine'), 0.36 * envelope);
      pitchModelX(c, find(c, 'spine1'), 0.16 * envelope);
    }
    return;
  }
  if (key === 'hit' || key === 'hitHead') {
    const snap = t < 0.2 ? smooth01(t / 0.2) : 1 - smooth01((t - 0.2) / 0.8);
    pitchModelX(c, find(c, 'spine'), -0.32 * snap);
    pitchModelX(c, find(c, 'spine1'), -0.16 * snap);
    pitchModelX(c, find(c, 'head'), -0.2 * snap);
    return;
  }
  if (key === 'guard') {
    const time = c.idleTime || 0;
    const breath = Math.sin(time * 2.2);
    const sway = Math.sin(time * 1.15);
    pitchModelX(c, find(c, 'spine'), 0.045 * breath);
    rollModelZ(c, find(c, 'spine1'), 0.04 * sway);
    return;
  }
  if (key === 'heavy') {
    const wind = t < 0.4 ? smooth01(t / 0.4) : 1 - smooth01((t - 0.4) / 0.18);
    const drive = t < 0.4 ? 0 : smooth01((t - 0.4) / 0.28) * (1 - smooth01(THREE.MathUtils.clamp((t - 0.78) / 0.22, 0, 1)));
    // The hook clip is already turning by this fraction. Heavy squares the
    // chest and leans back through the chamber, then drives into the same hit.
    yawWorld(find(c, 'spine'), 0.34 * wind);
    yawWorld(find(c, 'spine1'), 0.18 * wind);
    pitchModelX(c, find(c, 'spine'), 0.22 * drive - 0.24 * wind);
    pitchModelX(c, find(c, 'spine1'), 0.1 * drive - 0.12 * wind);
  }
}

function strikeDrive(combat) {
  const phase = THREE.MathUtils.clamp((combat.time || 0) / (combat.duration || 1), 0, 1);
  const visual = combat.key === 'heavy' ? heavyClipPhase(phase) : phase;
  const impact = {jab: 0.28, cross: 0.57, hook: 0.43, heavy: 0.43, special: 0.56}[combat.key] ?? 0.45;
  if (visual <= impact) return smooth01(visual / Math.max(impact, 0.05));
  return 1 - smooth01((visual - impact) / Math.max(1 - impact, 0.05));
}

function punchSide(combat) {
  // Jab, and the boxing-hook take shared by hook and heavy, extend the lead hand.
  // Cross and the rear power shot extend the right.
  return combat.key === 'cross' || combat.key === 'special' ? 'right' : 'left';
}

function shiftBone(bone, worldDelta) {
  if (!bone?.parent || worldDelta.lengthSq() < 1e-8) return;
  const local = worldDelta.applyQuaternion(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert())
    .divide(bone.parent.getWorldScale(new THREE.Vector3()));
  bone.position.add(local);
  bone.updateMatrixWorld(true);
}

// The imported punches turn the chest off the aim and collapse the elbow
// across the ribs. Put the chest back on the camera, drop the elbow under
// a straight shot (outside on a hook), and sit a standing pelvis over the
// boots. Moving punches leave the stride's pelvis alone.
//
// The lead arm is 57cm and the shoulder sits 21cm off the camera line.
// A fist parked in front of that shoulder misses the aim by more than the
// hit allows, and it cannot also reach the centre line. Land it part way
// in, on a point the arm can actually hold.
export function settleStrikeBalance(c, combat, moving) {
  const key = combat?.key;
  if (!combat?.duration || !['jab', 'cross', 'hook', 'heavy', 'special'].includes(key)) return;
  const drive = strikeDrive(combat);
  if (drive < 0.02) return;
  const aim = new THREE.Vector3(Math.sin(c.targetFacingAngle || 0), 0, Math.cos(c.targetFacingAngle || 0));
  if (aim.lengthSq() < 1e-6) return;
  const hooking = key === 'hook' || key === 'heavy';
  const left = find(c, 'leftshoulder'), right = find(c, 'rightshoulder');
  if (left && right) {
    const across = worldPosition(right).sub(worldPosition(left));
    const facing = new THREE.Vector3().crossVectors(up, across);
    facing.y = 0;
    if (facing.lengthSq() > 1e-6) {
      facing.normalize();
      const turn = Math.atan2(up.dot(new THREE.Vector3().crossVectors(facing, aim)), facing.dot(aim));
      const keep = hooking ? THREE.MathUtils.clamp(turn, -0.5, 0.5) : 0;
      const fix = (turn - keep) * drive;
      if (Math.abs(fix) > 0.012) {
        yawWorld(find(c, 'spine'), fix * 0.34);
        yawWorld(find(c, 'spine1'), fix * 0.40);
        yawWorld(find(c, 'spine2'), fix * 0.26);
      }
    }
  }
  const side = punchSide(combat);
  const arm = find(c, side + 'arm'), forearm = find(c, side + 'forearm'), hand = find(c, side + 'hand');
  // aim (0,0,1) × up (0,1,0) = (-1,0,0), the character's right when facing +Z.
  const characterRight = new THREE.Vector3().crossVectors(aim, up).normalize();
  if (!moving && drive >= 0.15) {
    const hips = find(c, 'hips'), leftFoot = find(c, 'leftfoot'), rightFoot = find(c, 'rightfoot');
    if (hips?.parent && leftFoot && rightFoot && arm) {
      const group = c.group.getWorldPosition(new THREE.Vector3());
      const shoulderFwd = worldPosition(arm).sub(group).dot(aim);
      const mid = worldPosition(leftFoot).add(worldPosition(rightFoot)).multiplyScalar(0.5);
      const com = worldPosition(hips).sub(mid);
      com.y = 0;
      const forward = com.dot(aim);
      const lateral = com.dot(characterRight);
      // Keep the striking shoulder in front of the capsule. A deeper sit
      // drops a straight punch short of the aim.
      const back = Math.min(Math.max(0, forward - 0.045), 0.07, Math.max(0, shoulderFwd - 0.02)) * drive;
      const across = THREE.MathUtils.clamp(lateral, -0.05, 0.05) * drive;
      if (back + Math.abs(across) >= 0.004) {
        shiftBone(hips, aim.clone().multiplyScalar(-back).addScaledVector(characterRight, -across));
      }
    }
  }
  if (!(arm && forearm && hand)) return;
  const group = c.group.getWorldPosition(new THREE.Vector3());
  let shoulder = worldPosition(arm);
  const retreat = Math.abs(c.strikeMoveOffset || 0) > 2;
  if (!hooking && !retreat) {
    const ahead = shoulder.clone().sub(group).dot(aim);
    const lean = Math.min(0.06, Math.max(0, 0.045 - ahead)) * drive;
    const spine = find(c, 'spine');
    if (lean > 0.001 && spine) shiftBone(spine, aim.clone().multiplyScalar(lean));
    // A frozen transition may already contain the previous punch's lean.
    // Bound the total offset, rather than adding another full drive to it.
    const rest=c.restBonePose?.find(sample=>sample.bone===spine)?.p;
    if(spine && rest){
      const scale=spine.parent.getWorldScale(new THREE.Vector3());
      const offset=spine.position.clone().sub(rest).multiply(scale).clampLength(0,.06);
      spine.position.copy(rest).add(offset.divide(scale));spine.updateMatrixWorld(true);
    }
    shoulder = worldPosition(arm);
  }
  const wrist = worldPosition(hand);
  const upperLen = shoulder.distanceTo(worldPosition(forearm));
  const lowerLen = worldPosition(forearm).distanceTo(wrist);
  const off = shoulder.clone().sub(group);
  const shoulderFwd = off.dot(aim);
  const shoulderLat = off.dot(characterRight);
  const outward = characterRight.clone().multiplyScalar(side === 'right' ? 1 : -1);
  let goal, pole;
  if (hooking) {
    const flat = wrist.clone().sub(shoulder);
    flat.y = 0;
    const sideOff = flat.dot(characterRight);
    const goalReach = THREE.MathUtils.clamp(Math.max(flat.dot(aim), 0.36), 0.2, 0.72);
    const goalSide = THREE.MathUtils.clamp(sideOff, -0.34, 0.42);
    goal = shoulder.clone().addScaledVector(aim, goalReach).addScaledVector(characterRight, goalSide);
    goal.y = wrist.y;
    pole = outward.addScaledVector(up, -0.28);
  } else {
    // 40% of the shoulder offset stays, so the fist leads inside the
    // shoulder instead of beside the head. 96% of the arm length leaves
    // the elbow under that line.
    const targetLat = shoulderLat * 0.40;
    const span = (upperLen + lowerLen) * 0.96;
    const drop = 0.025;
    const latDelta = targetLat - shoulderLat;
    const horiz = Math.sqrt(Math.max(0.04, span * span - drop * drop));
    const fwdDelta = Math.sqrt(Math.max(0.04, horiz * horiz - latDelta * latDelta));
    goal = group.clone().addScaledVector(aim, shoulderFwd + fwdDelta).addScaledVector(characterRight, targetLat);
    goal.y = shoulder.y - drop;
    pole = up.clone().multiplyScalar(-1).addScaledVector(outward, 0.42);
  }
  const upper = arm.quaternion.clone(), lower = forearm.quaternion.clone(), fist = hand.quaternion.clone();
  c.solveLimb(arm, forearm, hand, goal, 0.97, pole);
  arm.quaternion.slerpQuaternions(upper, arm.quaternion.clone(), drive);
  forearm.quaternion.slerpQuaternions(lower, forearm.quaternion.clone(), drive);
  hand.quaternion.copy(fist);
  arm.updateMatrixWorld(true);
}

function signedKneeLead(hip, knee, foot, forward) {
  const hipP = hip.getWorldPosition(new THREE.Vector3());
  const kneeP = knee.getWorldPosition(new THREE.Vector3());
  const footP = foot.getWorldPosition(new THREE.Vector3());
  const span = footP.clone().sub(hipP);
  const thigh = kneeP.clone().sub(hipP);
  const shin = footP.clone().sub(kneeP);
  if (span.lengthSq() < 0.04) return null;
  const along = THREE.MathUtils.clamp(thigh.dot(span) / span.lengthSq(), 0, 1);
  const lead = kneeP.clone().sub(hipP.clone().addScaledVector(span, along));
  return {signed: lead.dot(forward), thigh, shin, flex: thigh.angleTo(shin), hipP, kneeP, footP};
}

// A trailing leg on a swing or a trick exit can sit just behind the hip-foot
// chord. One push lands short of the chord, so repeat it. Aim only the shin
// afterwards. A two-bone solve puts the knee back on the limb pole.
export function leadAirborneKnees(c) {
  const hips = find(c, 'hips');
  if (!hips) return;
  const upright = new THREE.Vector3(0, 1, 0).applyQuaternion(hips.getWorldQuaternion(new THREE.Quaternion()));
  if (upright.y < 0.55) return;
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(c.model.getWorldQuaternion(new THREE.Quaternion()));
  forward.y = 0;
  if (forward.lengthSq() < 1e-8) return;
  forward.normalize();
  for (const side of ['left', 'right']) {
    const hip = find(c, side + 'upleg'), knee = find(c, side + 'leg'), foot = find(c, side + 'foot');
    if (!hip || !knee || !foot) continue;
    const home = foot.getWorldPosition(new THREE.Vector3());
    const sole = foot.getWorldQuaternion(new THREE.Quaternion());
    let spent = 0;
    for (let pass = 0; pass < 3 && spent < 0.8; pass++) {
      const sample = signedKneeLead(hip, knee, foot, forward);
      if (!sample || sample.flex < 0.1 || sample.signed >= 0.03) break;
      let axis = new THREE.Vector3().crossVectors(sample.thigh, forward);
      if (axis.lengthSq() < 1e-8) axis = new THREE.Vector3().crossVectors(sample.thigh, up);
      if (axis.lengthSq() < 1e-8) break;
      axis.normalize();
      if (new THREE.Vector3().crossVectors(axis, sample.thigh).dot(forward) < 0) axis.negate();
      const turn = THREE.MathUtils.clamp((0.045 - sample.signed) / Math.max(0.12, sample.thigh.length()), 0.015, 0.45);
      spent += turn;
      const world = new THREE.Quaternion().setFromAxisAngle(axis, turn).multiply(hip.getWorldQuaternion(new THREE.Quaternion()));
      hip.quaternion.copy(hip.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world)).normalize();
      hip.updateMatrixWorld(true);
      const kneeNow = knee.getWorldPosition(new THREE.Vector3());
      const from = foot.getWorldPosition(new THREE.Vector3()).sub(kneeNow);
      const to = home.clone().sub(kneeNow);
      if (from.lengthSq() > 1e-8 && to.lengthSq() > 1e-8) {
        const shinWorld = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize()).multiply(knee.getWorldQuaternion(new THREE.Quaternion()));
        knee.quaternion.copy(knee.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(shinWorld)).normalize();
        knee.updateMatrixWorld(true);
      }
      const after = signedKneeLead(hip, knee, foot, forward);
      if (!after || after.signed < sample.signed + 0.003) break;
    }
    foot.quaternion.copy(foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(sole)).normalize();
    foot.updateMatrixWorld(true);
  }
}

// A held stride is one frozen frame. A running frame can leave a foot at
// knee height for the whole dodge. Ease that foot down into the lean, and
// keep the planted leg in the pose the next clip blends from.
export function settleHeldStance(c, delta) {
  const combat = c.combatAction;
  const key = combat?.key;
  const dodge = !!key?.startsWith('dodge');
  const hit = key === 'hit' || key === 'hitHead';
  if (!dodge && !hit) { c.reactSettle = 0; c.reactSettleId = null; return; }
  if ((c.activeAction?.getEffectiveTimeScale?.() ?? 1) > 0.02) { c.reactSettle = 0; return; }
  const stride = c.activeAction?.getClip()?.name;
  if (!['walk', 'regularRun', 'run'].includes(stride)) return;
  if (c.reactSettleId !== combat.id) { c.reactSettleId = combat.id; c.reactSettle = 0; }
  c.reactSettle = Math.min(1, (c.reactSettle || 0) + delta / 0.16);
  const weight = smooth01(c.reactSettle);
  if (weight < 0.02) return;
  const moved = [];
  for (const side of ['left', 'right']) {
    const hip = find(c, side + 'upleg'), knee = find(c, side + 'leg'), foot = find(c, side + 'foot');
    if (!hip || !knee || !foot) continue;
    const current = foot.getWorldPosition(new THREE.Vector3());
    const support = footSupport(c, current);
    const goal = current.clone();
    // The floor probe plus 11cm is the collision sole. This rig's ankle bone
    // stands about 9cm above the group once the grounded model drops 10cm,
    // so the probe target alone sinks that bone through the other boot.
    const ankle = c.group.position.y + 0.09;
    goal.y = Math.max(support ? support.height + 0.11 : c.group.position.y + 0.11, ankle);
    if (current.y < goal.y + 0.02) continue;
    const hipP = hip.getWorldPosition(new THREE.Vector3());
    const reach = (hipP.distanceTo(knee.getWorldPosition(new THREE.Vector3())) + knee.getWorldPosition(new THREE.Vector3()).distanceTo(current)) * 0.92;
    const vertical = Math.abs(goal.y - hipP.y);
    if (vertical < reach) {
      const flatReach = Math.sqrt(reach * reach - vertical * vertical);
      const dx = goal.x - hipP.x, dz = goal.z - hipP.z;
      const flat = Math.hypot(dx, dz);
      if (flat > flatReach && flat > 1e-4) {
        const scale = flatReach / flat;
        goal.x = hipP.x + dx * scale;
        goal.z = hipP.z + dz * scale;
      }
    }
    const target = current.clone().lerp(goal, weight);
    // Keep the knee on the plane it already has. A forward pole threw it
    // past the foot on the way down.
    c.solveLimb(hip, knee, foot, target, 0.995, null);
    const rotation = support ? soleRotation(c, side, support.normal) : null;
    if (rotation) {
      foot.quaternion.copy(foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation)).normalize();
      foot.updateMatrixWorld(true);
    }
    moved.push(hip, knee, foot);
  }
  if (!moved.length || !c.animationPose) return;
  for (const sample of c.animationPose) {
    if (!moved.includes(sample.bone)) continue;
    sample.p.copy(sample.bone.position);
    sample.q.copy(sample.bone.quaternion);
  }
}
