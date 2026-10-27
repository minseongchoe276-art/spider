import fs from 'node:fs';
import assert from 'node:assert/strict';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
globalThis.ProgressEvent ||= class {constructor(type,data){Object.assign(this,data);}};
const results=[];
for(const file of ['shadow-pulse-rig.glb','appearance-web.glb','appearance-combat.glb']){
 const bytes=fs.readFileSync('public/models/'+file),size=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+size));
 json.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(28+size).toString('base64');
 delete json.images;delete json.textures;json.materials=[];for(const mesh of json.meshes)for(const part of mesh.primitives)delete part.material;
 const gltf=await new GLTFLoader().parseAsync(JSON.stringify(json),'');
 let bones=0,meshes=0,vertices=0,maxWeightError=0;
 gltf.scene.updateMatrixWorld(true);
 gltf.scene.traverse(node=>{
  if(node.isBone){bones++;assert(node.position.toArray().every(Number.isFinite));assert(node.scale.toArray().every(v=>Number.isFinite(v)&&v>0));assert(Math.abs(node.quaternion.length()-1)<1e-4);assert(node.matrixWorld.elements.every(Number.isFinite));}
  if(!node.isSkinnedMesh)return;
  meshes++;const {skeleton,geometry}=node;
  assert.equal(skeleton.bones.length,skeleton.boneInverses.length);
  assert.equal(new Set(skeleton.bones.map(b=>b.name)).size,skeleton.bones.length);
  for(const inv of skeleton.boneInverses){assert(inv.elements.every(Number.isFinite));assert(Math.abs(inv.determinant())>1e-10);}
  const weights=geometry.attributes.skinWeight,joints=geometry.attributes.skinIndex;assert.equal(weights.count,joints.count);
  vertices+=weights.count;
  for(let i=0;i<weights.count;i++){
   let sum=0;for(let k=0;k<4;k++){const w=weights.getComponent(i,k),joint=joints.getComponent(i,k);assert(Number.isFinite(w)&&w>=0&&w<=1);assert(Number.isInteger(joint)&&joint>=0&&joint<skeleton.bones.length);sum+=w;}
   maxWeightError=Math.max(maxWeightError,Math.abs(sum-1));
  }
 });
 assert(meshes>0&&bones>0);assert(maxWeightError<1e-4);
 results.push({file,status:'PASS',bones,meshes,vertices,maxWeightError});
 console.log(`PASS ${file}: ${bones} bones, ${vertices} skin vertices, finite transforms, valid bind matrices and normalized weights`);
}
fs.writeFileSync('docs/qa/mode-controls-2026-10-27/rig.json',JSON.stringify(results,null,2));
