// Transfer the game's animation rig onto the user's static, textured GLBs.
// Original uploads remain untouched. Output keeps their UVs, indices and images.
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {boneId} from '../src/MotionRetarget.js';
import {bindTransforms} from '../src/WebHandPose.js';
import {armSurfaceRegions,smoothSurfaceWeights} from './lib/skin-regions.mjs';
globalThis.ProgressEvent ||= class {constructor(type,v){Object.assign(this,v);}};
function read(path){const raw=fs.readFileSync(path),len=raw.readUInt32LE(12);return {raw,json:JSON.parse(raw.subarray(20,20+len)),bin:raw.subarray(28+len)};}
async function parse(asset){const j=structuredClone(asset.json);j.buffers[0].uri='data:application/octet-stream;base64,'+asset.bin.toString('base64');delete j.images;delete j.textures;j.materials=[];for(const m of j.meshes)for(const p of m.primitives)delete p.material;return new GLTFLoader().parseAsync(JSON.stringify(j),'');}
const reference=read('public/models/shadow-pulse-rig.glb');
const gltf=await parse(reference);let mesh;gltf.scene.traverse(n=>{if(n.isSkinnedMesh)mesh=n;});
for(const [bone,t] of bindTransforms(gltf.scene)){bone.position.copy(t.position);bone.quaternion.copy(t.quaternion);bone.scale.copy(t.scale);}
gltf.scene.updateMatrixWorld(true);
const byId=Object.fromEntries(mesh.skeleton.bones.map(b=>[boneId(b.name),b]));
// Match the uploads' relaxed A pose before transferring surface weights.
function aim(id,child,target){const b=byId[id],c=byId[child];gltf.scene.updateMatrixWorld(true);const from=c.getWorldPosition(new T.Vector3()).sub(b.getWorldPosition(new T.Vector3())).normalize();const rotation=new T.Quaternion().setFromUnitVectors(from,target.clone().normalize());const world=b.getWorldQuaternion(new T.Quaternion()).premultiply(rotation);b.quaternion.copy(b.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(world));}
for(const [side,sign] of [['left',1],['right',-1]]){aim(side+'arm',side+'forearm',new T.Vector3(sign*.085,-.35,-.01));aim(side+'forearm',side+'hand',new T.Vector3(sign*.06,-.30,.06));aim(side+'hand',side+'handmiddle1',new T.Vector3(sign*.02,-.14,0));}
gltf.scene.updateMatrixWorld(true);mesh.skeleton.update();
const transferPose=mesh.skeleton.bones.map(b=>({b,q:b.quaternion.clone()}));
const refPos=mesh.geometry.attributes.position,refJ=mesh.geometry.attributes.skinIndex,refW=mesh.geometry.attributes.skinWeight;
const refArm=Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>{let arm=0;for(let k=0;k<4;k++){const id=boneId(mesh.skeleton.bones[mesh.geometry.attributes.skinIndex.getComponent(i,k)].name);if(/^(left|right)(arm|forearm|hand)/.test(id))arm+=mesh.geometry.attributes.skinWeight.getComponent(i,k);}return arm>.5;});
const cell=.08,key=(x,y,z)=>`${x},${y},${z}`;
const report=[];
// The uploaded filenames were semantically reversed: 변신모습.glb renders as
// the civilian human, while 사람모습.glb renders as the transformed suit.
// Keep the in-game mode appearance aligned with what the player sees.
for(const [mode,name] of [['combat','변신모습'],['web','사람모습']]){
 const asset=read(`artifacts/${name}.glb`),original=await parse(asset);let source;original.scene.traverse(n=>{if(n.isMesh)source=n;});const g=source.geometry,p=g.attributes.position,n=g.attributes.normal;g.computeBoundingBox();const bounds=g.boundingBox,scale=2.0527/(bounds.max.y-bounds.min.y);
 // Fit each upload's cuff before transferring finger weights. A 3cm wrist
 // offset previously assigned almost every finger to the reference ring
 // finger, leaving a hanging claw when the gameplay pose made a fist.
 transferPose.forEach(({b,q})=>b.quaternion.copy(q));gltf.scene.updateMatrixWorld(true);
 for(const [side,sign] of [['left',1],['right',-1]]){
  const cuff=new T.Vector3();let count=0;
  for(let i=0;i<p.count;i++){
   const point=new T.Vector3(p.getX(i)*scale,(p.getY(i)-bounds.min.y)*scale-.008427,p.getZ(i)*scale);
   if(point.x*sign>.31 && point.y>1.07 && point.y<1.12){cuff.add(point);count++;}
  }
  if(count){cuff.divideScalar(count);cuff.y=1.09;aim(side+'forearm',side+'hand',cuff.sub(byId[side+'forearm'].getWorldPosition(new T.Vector3())));}
  aim(side+'hand',side+'handmiddle1',new T.Vector3(sign*.02,-.14,0));
 }
 gltf.scene.updateMatrixWorld(true);mesh.skeleton.update();
 const matrices=mesh.skeleton.bones.map((b,i)=>new T.Matrix4().multiplyMatrices(b.matrixWorld,mesh.skeleton.boneInverses[i]));
 const grid=new Map(),samples=[];
 for(let i=0;i<refPos.count;i++){const point=mesh.applyBoneTransform(i,new T.Vector3().fromBufferAttribute(refPos,i)).applyMatrix4(mesh.matrixWorld);samples.push(point);const k=key(Math.floor(point.x/cell),Math.floor(point.y/cell),Math.floor(point.z/cell));if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i);}
 const armRegions=armSurfaceRegions(g,scale,bounds.min.y);
 const positions=new Float32Array(p.count*3),normals=new Float32Array(p.count*3),joints=new Uint16Array(p.count*4),weights=new Float32Array(p.count*4);let maxDistance=0,maxReconstruction=0;
 for(let i=0;i<p.count;i++){
  const point=new T.Vector3(p.getX(i)*scale,(p.getY(i)-bounds.min.y)*scale-.008427,p.getZ(i)*scale),cx=Math.floor(point.x/cell),cy=Math.floor(point.y/cell),cz=Math.floor(point.z/cell);let nearest=[];
  for(let r=0;r<=5;r++){for(let x=-r;x<=r;x++)for(let y=-r;y<=r;y++)for(let z=-r;z<=r;z++){if(Math.max(Math.abs(x),Math.abs(y),Math.abs(z))!==r)continue;for(const idx of grid.get(key(cx+x,cy+y,cz+z)) || []){const q=samples[idx];if(Math.abs(point.x)>.06 && point.x*q.x<0)continue;
const armPoint=!!armRegions[i];
if(armPoint && !refArm[idx])continue;
if(!armPoint && point.y<1.45 && refArm[idx])continue;
nearest.push({idx,d:q.distanceToSquared(point)});}}if(nearest.length>=8&&r>=1)break;}
  if(!nearest.length)throw new Error('Unmapped vertex '+i);nearest.sort((a,b)=>a.d-b.d);nearest=nearest.slice(0,4);maxDistance=Math.max(maxDistance,Math.sqrt(nearest[0].d));
  const totals=new Map();for(const {idx,d} of nearest){const influence=1/(d+1e-6);for(let k=0;k<4;k++){const id=refJ.getComponent(idx,k),w=refW.getComponent(idx,k);totals.set(id,(totals.get(id)||0)+w*influence);}}
  const best=[...totals].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=best.reduce((s,v)=>s+v[1],0),skin=new T.Matrix4();skin.elements.fill(0);
  for(let k=0;k<best.length;k++){const [id,total]=best[k],w=total/sum;joints[i*4+k]=id;weights[i*4+k]=w;for(let m=0;m<16;m++)skin.elements[m]+=matrices[id].elements[m]*w;}
  const rest=point.clone().applyMatrix4(skin.clone().invert());rest.toArray(positions,i*3);
  new T.Vector3().fromBufferAttribute(n,i).applyMatrix3(new T.Matrix3().setFromMatrix4(skin).transpose()).normalize().toArray(normals,i*3);
  maxReconstruction=Math.max(maxReconstruction,rest.clone().applyMatrix4(skin).distanceTo(point));
 }
 // Blend neighboring influences along the actual mesh, including UV seams.
 // Reconstruct bind positions after smoothing so the uploaded A pose stays exact.
 smoothSurfaceWeights(g,joints,weights);
 for(let i=0;i<p.count;i++){
  const skin=new T.Matrix4();skin.elements.fill(0);
  for(let k=0;k<4;k++)for(let m=0;m<16;m++)skin.elements[m]+=matrices[joints[i*4+k]].elements[m]*weights[i*4+k];
  const point=new T.Vector3(p.getX(i)*scale,(p.getY(i)-bounds.min.y)*scale-.008427,p.getZ(i)*scale);
  point.clone().applyMatrix4(skin.clone().invert()).toArray(positions,i*3);
  new T.Vector3().fromBufferAttribute(n,i).applyMatrix3(new T.Matrix3().setFromMatrix4(skin).transpose()).normalize().toArray(normals,i*3);
 }
 const json=structuredClone(asset.json),chunks=[asset.bin];let offset=asset.bin.length;
 function append(array,type,componentType){const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}const bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength),view=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length});chunks.push(bytes);offset+=bytes.length;const id=json.accessors.length;json.accessors.push({bufferView:view,componentType,count:array.length/({VEC3:3,VEC4:4,MAT4:16}[type]),type});return id;}
 const pos=append(positions,'VEC3',5126),norm=append(normals,'VEC3',5126),ji=append(joints,'VEC4',5123),we=append(weights,'VEC4',5126);
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<positions.length;i++) {const k=i%3;lo[k]=Math.min(lo[k],positions[i]);hi[k]=Math.max(hi[k],positions[i]);}Object.assign(json.accessors[pos],{min:lo,max:hi});
 for(const primitive of json.meshes[0].primitives)Object.assign(primitive.attributes,{POSITION:pos,NORMAL:norm,JOINTS_0:ji,WEIGHTS_0:we});
 const inverse=new Float32Array(mesh.skeleton.bones.length*16);mesh.skeleton.boneInverses.forEach((m,i)=>m.toArray(inverse,i*16));const inv=append(inverse,'MAT4',5126);
 json.nodes=structuredClone(reference.json.nodes);json.scenes=structuredClone(reference.json.scenes);json.scene=reference.json.scene || 0;json.skins=structuredClone(reference.json.skins);json.skins[0].inverseBindMatrices=inv;delete json.animations;
 json.asset.extras={source:name,sourceSha256:crypto.createHash('sha256').update(asset.raw).digest('hex'),rig:'shared Mixamo 65-bone surface transfer'};
 const endPad=(4-offset%4)%4;if(endPad){chunks.push(Buffer.alloc(endPad));offset+=endPad;}json.buffers=[{byteLength:offset}];let jb=Buffer.from(JSON.stringify(json));jb=Buffer.concat([jb,Buffer.alloc((4-jb.length%4)%4,32)]);const bin=Buffer.concat(chunks),header=Buffer.alloc(20),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jb.length+bin.length,8);header.writeUInt32LE(jb.length,12);header.writeUInt32LE(0x4e4f534a,16);bh.writeUInt32LE(bin.length,0);bh.writeUInt32LE(0x004e4942,4);fs.writeFileSync(`public/models/appearance-${mode}.glb`,Buffer.concat([header,jb,bh,bin]));
 report.push({mode,source:name,vertices:p.count,bones:65,maxNearestSurfaceDistance:maxDistance,maxAPoseReconstructionError:maxReconstruction});console.log(report.at(-1));
}
fs.mkdirSync('docs/qa/appearances-2026-10-19',{recursive:true});fs.writeFileSync('docs/qa/appearances-2026-10-19/rig-transfer.json',JSON.stringify(report,null,2)+'\n');
