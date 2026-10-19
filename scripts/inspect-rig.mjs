import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js';
import {retargetMotion,prepareMotion,boneId} from '../src/MotionRetarget.js';
globalThis.ProgressEvent=class{};
globalThis.document={createElementNS:()=>({addEventListener(){},removeEventListener(){},set src(v){}})};
globalThis.window={URL:globalThis.URL};
const d=fs.readFileSync('public/models/shadow-pulse-rig.glb'),len=d.readUInt32LE(12);
const j=JSON.parse(d.subarray(20,20+len));
j.buffers[0].uri=`data:application/octet-stream;base64,${d.subarray(28+len).toString('base64')}`;
delete j.images;delete j.textures;j.materials=[];j.meshes.forEach(m=>m.primitives.forEach(p=>delete p.material));
const gltf=await new GLTFLoader().parseAsync(JSON.stringify(j),'');
const target=gltf.scene,bones={};let mesh;
target.traverse(n=>{if(n.isBone)bones[n.name]=n;if(n.isSkinnedMesh)mesh=n;});target.updateMatrixWorld(true);
const hips=Object.values(bones).find(n=>boneId(n.name)==='hips');
const targetRest=hips.getWorldQuaternion(new THREE.Quaternion());
const buf=fs.readFileSync('public/models/Idle.fbx');
const source=new FBXLoader().parse(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'');
const sb={};source.traverse(n=>{if(n.isBone)sb[boneId(n.name)]=n;});source.updateMatrixWorld(true);
const align=targetRest.clone().multiply(sb.hips.getWorldQuaternion(new THREE.Quaternion()).invert());
const original=source.animations.find(c=>c.duration>0&&c.tracks.length);
const clip=prepareMotion(retargetMotion(target,source,original),'idle',bones);
const sm=new THREE.AnimationMixer(source);sm.clipAction(original).play();
const tm=new THREE.AnimationMixer(target);tm.clipAction(clip).play();sm.setTime(2);tm.setTime(2);
source.updateMatrixWorld(true);target.updateMatrixWorld(true);mesh.skeleton.update();
const tb=Object.fromEntries(Object.values(bones).map(n=>[boneId(n.name),n]));
for(const [a,b] of [['leftupleg','leftleg'],['leftleg','leftfoot'],['rightupleg','rightleg'],['rightleg','rightfoot']]) {
 const dir=(map)=>map[b].getWorldPosition(new THREE.Vector3()).sub(map[a].getWorldPosition(new THREE.Vector3())).normalize();
 console.log(a,b,'direction error deg',THREE.MathUtils.radToDeg(dir(sb).applyQuaternion(align).angleTo(dir(tb))).toFixed(2));
}
for(const id of ['leftfoot','rightfoot']) {
 const bone=tb[id], index=mesh.skeleton.bones.indexOf(bone);
 console.log(id,'joint',bone.getWorldPosition(new THREE.Vector3()).toArray(),'inverse-bind origin',new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[index].clone().invert()).toArray());
 const pos=mesh.geometry.attributes.position,idx=mesh.geometry.attributes.skinIndex,w=mesh.geometry.attributes.skinWeight;
 const points=[];
 for(let i=0;i<pos.count;i++) {let weight=0;for(let k=0;k<4;k++)if(idx.getComponent(i,k)===index)weight+=w.getComponent(i,k);
  if(weight>.7)points.push(mesh.applyBoneTransform(i,new THREE.Vector3().fromBufferAttribute(pos,i)).applyMatrix4(mesh.matrixWorld));
 }
 console.log(id,'skin bounds',new THREE.Box3().setFromPoints(points).min.toArray(),new THREE.Box3().setFromPoints(points).max.toArray());
}
