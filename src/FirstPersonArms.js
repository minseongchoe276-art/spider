import * as THREE from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {boneId} from './MotionRetarget.js';
import {bindTransforms,createHandPoseRig,applyHandPose} from './WebHandPose.js';

const fingers=['thumb','index','middle','ring','pinky'];
function viewHandOrientation(side){
  const forward=new THREE.Vector3(side==='left'?-.02:.02,.85,-.526).normalize();
  const palm=new THREE.Vector3(0,-.526,-.85);palm.addScaledVector(forward,-palm.dot(forward)).normalize();
  return new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(forward,palm).normalize(),forward,palm);
}

function extendViewUpperArm(mesh,side){
  const upper=mesh.skeleton.bones.find(b=>boneId(b.name)===side+'arm');
  const elbow=mesh.skeleton.bones.find(b=>boneId(b.name)===side+'forearm');
  if(!upper || !elbow)return;
  const start=mesh.worldToLocal(elbow.getWorldPosition(new THREE.Vector3()));
  const axis=mesh.worldToLocal(upper.getWorldPosition(new THREE.Vector3())).sub(start),lengthSq=axis.lengthSq();
  if(lengthSq<1e-8)return;
  const unit=axis.clone().normalize(),geometry=mesh.geometry,p=geometry.attributes.position,n=geometry.attributes.normal;
  const joints=geometry.attributes.skinIndex,weights=geometry.attributes.skinWeight,index=mesh.skeleton.bones.indexOf(upper);
  // Continue the hidden upper sleeve beyond the camera's lower edge, even
  // with a 95-degree FOV and an extended punch. Wrist/forearm vertices stay
  // exactly authored; only the proximal upper arm receives this adaptation.
  for(const vertex of new Set(geometry.index.array)){
    let weight=0;for(let k=0;k<4;k++)if(joints.getComponent(vertex,k)===index)weight+=weights.getComponent(vertex,k);
    if(weight<.1)continue;
    const point=mesh.applyBoneTransform(vertex,new THREE.Vector3().fromBufferAttribute(p,vertex));
    const t=point.clone().sub(start).dot(axis)/lengthSq;
    const blend=THREE.MathUtils.smoothstep(t,.3,1.1);if(!blend)continue;
    // GLB positions and the imported bone frame use different bind units.
    // Convert the skin-space adjustment back through this vertex's bind map.
    const skin=new THREE.Matrix4();skin.elements.fill(0);
    for(let k=0;k<4;k++){
      const id=joints.getComponent(vertex,k),w=weights.getComponent(vertex,k);
      if(!w)continue;
      const matrix=new THREE.Matrix4().multiplyMatrices(mesh.skeleton.bones[id].matrixWorld,mesh.skeleton.boneInverses[id]);
      for(let i=0;i<16;i++)skin.elements[i]+=matrix.elements[i]*w;
    }
    skin.premultiply(mesh.bindMatrixInverse).multiply(mesh.bindMatrix);
    point.addScaledVector(axis,2.5*blend).applyMatrix4(skin.clone().invert());p.setXYZ(vertex,point.x,point.y,point.z);
    const u=THREE.MathUtils.clamp((t-.3)/.8,0,1),stretch=1+2.5*6*u*(1-u)/.8;
    const normal=new THREE.Vector3().fromBufferAttribute(n,vertex).applyMatrix3(new THREE.Matrix3().getNormalMatrix(skin));
    normal.addScaledVector(unit,normal.dot(unit)*(1/stretch-1)).applyMatrix3(new THREE.Matrix3().setFromMatrix4(skin).transpose()).normalize();n.setXYZ(vertex,normal.x,normal.y,normal.z);
  }
}

function skinHand(source,side) {
  if(!source?.getObjectByProperty('isSkinnedMesh',true))return null;
  const model=clone(source);model.visible=true;model.position.set(0,0,0);model.rotation.set(0,0,0);
  const bind=bindTransforms(model),bones={};
  model.traverse(n=>{if(n.isBone){bones[n.name]=n;const rest=bind.get(n);if(rest){n.position.copy(rest.position);n.quaternion.copy(rest.quaternion);n.scale.copy(rest.scale);}}});
  const hand=Object.values(bones).find(b=>boneId(b.name)===side+'hand');
  if(!hand)return null;
  model.updateMatrixWorld(true);
  const meshes=[];model.traverse(n=>{if(n.isMesh)meshes.push(n);});let count=0;
  for(const mesh of meshes){
    if(!mesh.isSkinnedMesh){mesh.removeFromParent();continue;}
    const geometry=mesh.geometry,indices=geometry.index,weights=geometry.attributes.skinWeight,joints=geometry.attributes.skinIndex;
    // Keep the authored wrist and forearm in the same skinned surface as the
    // hand. A separate cylindrical cuff cut across the glove's taper and UVs.
    const selected=mesh.skeleton.bones.map(b=>['arm','forearm','hand'].some(part=>boneId(b.name).startsWith(side+part)));
    const member=vertex=>{let weight=0;for(let k=0;k<4;k++)if(selected[joints.getComponent(vertex,k)])weight+=weights.getComponent(vertex,k);return weight>.35;};
    const kept=[];
    for(let i=0;i<(indices?.count || geometry.attributes.position.count);i+=3){
      const triangle=[0,1,2].map(k=>indices?indices.getX(i+k):i+k);
      if(triangle.every(member))kept.push(...triangle);
    }
    if(!kept.length){mesh.removeFromParent();continue;}
    mesh.geometry=geometry.clone();mesh.geometry.clearGroups();mesh.geometry.setIndex(kept);
    extendViewUpperArm(mesh,side);
    mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();
    mesh.userData.ownViewMaterial=true;
    mesh.frustumCulled=false;mesh.castShadow=false;count+=kept.length/3;
    // View hands should remain readable even when a wall is close to the camera.
    mesh.renderOrder=2;
  }
  if(!count)return null;
  model.updateMatrixWorld(true);
  const alignment=new THREE.Group();alignment.add(model);
  const orientation=viewHandOrientation(side);
  // Preserve the import's unit conversion while aligning the rigid wrist.
  // Inverting its scale would enlarge both the skin and digit lengths.
  const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
  hand.matrixWorld.decompose(position,rotation,scale);
  const wristFrame=new THREE.Matrix4().compose(position,rotation,new THREE.Vector3(1,1,1));
  const transform=orientation.multiply(wristFrame.invert());
  transform.decompose(alignment.position,alignment.quaternion,alignment.scale);
  return {object:alignment,rig:createHandPoseRig(model,bones),bones,triangles:count,model};
}

function fallbackHand(side,material) {
  const object=new THREE.Group(),bones={};
  const palm=new THREE.Mesh(new THREE.SphereGeometry(.047,12,10),material);palm.position.y=.045;palm.scale.set(1,1.2,.48);object.add(palm);
  for(const [i,finger] of fingers.entries()){
    let parent=object;const sign=side==='left'?1:-1;
    for(let joint=1;joint<=4;joint++){
      const bone=new THREE.Bone();bone.name=side+'hand'+finger+joint;
      bone.position.set(joint===1?sign*(i-2)*.02:0,joint===1?(i===0?.025:.083):(i===0?.024:.027),0);parent.add(bone);bones[bone.name]=bone;
      if(joint<4){const part=new THREE.Mesh(new THREE.CapsuleGeometry(.008,.017,3,6),material);part.position.y=.013;bone.add(part);}
      parent=bone;
    }
  }
  object.quaternion.setFromRotationMatrix(viewHandOrientation(side));
  return {object,rig:createHandPoseRig(object,bones),bones,triangles:0,model:object};
}

export function createFirstPersonArm(side,source) {
  const sign=side==='left'?-1:1,arm=new THREE.Group();
  const elbow=new THREE.Vector3(sign*.39,-.47,-.15),wrist=new THREE.Vector3(sign*.21,-.18,-.64),axis=wrist.clone().sub(elbow);
  const glove=new THREE.Group();glove.name=side+'Glove';glove.position.copy(wrist);arm.add(glove);
  let hand=skinHand(source,side);
  if(!hand){
    const sleeveMaterial=new THREE.MeshStandardMaterial({color:0xb51e32,roughness:.65});
    const sleeve=new THREE.Mesh(new THREE.CylinderGeometry(.031,.049,axis.length(),24),sleeveMaterial);
    sleeve.position.copy(elbow).add(wrist).multiplyScalar(.5);sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis.clone().normalize());arm.add(sleeve);
    hand=fallbackHand(side,new THREE.MeshStandardMaterial({color:0xb51e32,roughness:.55}));
  }
  glove.add(hand.object);
  const anchor=new THREE.Object3D();anchor.name=side+'WebShooter';anchor.position.copy(wrist);arm.add(anchor);
  arm.userData.hand=hand;arm.userData.side=side;
  arm.traverse(node=>{if(node.isMesh)node.renderOrder=2;});
  return {arm,anchor,glove};
}

export function poseFirstPersonFingers(arm,shoot,grip,combat,wallWeight=0) {
  const hand=arm.userData.hand,side=arm.userData.side;
  const fighting=!!combat && !['slam','slamLand','hit','hitHead'].includes(combat.key);
  const firing=fighting?0:shoot,closed=fighting?1:grip,relaxed=Math.max(0,1-firing-closed);
  applyHandPose(hand.rig,side,firing,closed,{absolute:true,relaxed});
  if(wallWeight>0){
    const items=hand.rig[side],previous=items.map(item=>item.bone.quaternion.clone());
    applyHandPose(hand.rig,side,0,0,{absolute:true,relaxed:.12});
    items.forEach((item,i)=>item.bone.quaternion.slerpQuaternions(previous[i],item.bone.quaternion.clone(),wallWeight));
  }
}

export function prepareFirstPersonDepth(rig){
  let frame=-1;rig.renderOrder=100;
  rig.traverse(node=>{if(node.isMesh){node.renderOrder=100;node.frustumCulled=false;
    // Render the viewmodel after world geometry, retaining depth tests between
    // its own fingers. Disabling material.depthTest makes folded digits draw
    // through each other and disabling it on a shared suit affects opponents.
    node.onBeforeRender=renderer=>{if(frame!==renderer.info.render.frame){frame=renderer.info.render.frame;renderer.clearDepth();}};
  }});
}

export function disposeFirstPersonRig(rig) {
  const geometries=new Set(),materials=new Set(),skeletons=new Set();
  rig?.traverse(node=>{
    if(node.isSkinnedMesh){geometries.add(node.geometry);skeletons.add(node.skeleton);
      if(node.userData.ownViewMaterial)for(const m of Array.isArray(node.material)?node.material:[node.material])materials.add(m);}
    else if(node.isMesh){geometries.add(node.geometry);for(const m of Array.isArray(node.material)?node.material:[node.material])materials.add(m);}
  });
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());skeletons.forEach(s=>s.dispose());rig?.removeFromParent();
}
