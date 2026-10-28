// Offline Mixamo FBX -> one skinned mesh/material per civilian, with a diffuse atlas.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import * as T from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {retargetMotion} from '../src/MotionRetarget.js';
const sources=process.env.CITIZEN_SOURCE_DIR || path.join(os.homedir(),'Downloads');
const entries=[['remy','Remy.fbx',1.77],['megan','Ch22_nonPBR.fbx',1.69],['louise','Ch07_nonPBR.fbx',1.73]];
const only=process.argv.find(v=>v.startsWith('--only='))?.slice(7);
const output='public/citizens';fs.mkdirSync(output,{recursive:true});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'citizen-assets-'));
let blobs=new Map(),blobId=0;
globalThis.window={URL:{createObjectURL(blob){const id='embedded:'+ ++blobId;blobs.set(id,blob);return id;}}};
globalThis.document={createElementNS(){const listeners={};return {addEventListener(k,fn){listeners[k]=fn;},removeEventListener(){},set src(value){this.url=value;queueMicrotask(()=>listeners.load?.call(this));},get src(){return this.url;}};}};
globalThis.FileReader=class {readAsArrayBuffer(blob){blob.arrayBuffer().then(buffer=>{this.result=buffer;this.onloadend?.();});}readAsDataURL(blob){blob.arrayBuffer().then(buffer=>{this.result=`data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;this.onloadend?.();});}};
function parse(file){const b=fs.readFileSync(file);return new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
function pack(json,bin){const j=Buffer.from(JSON.stringify(json)),jb=Buffer.alloc(Math.ceil(j.length/4)*4,32);j.copy(jb);const bb=Buffer.alloc(Math.ceil(bin.length/4)*4);bin.copy(bb);const h=Buffer.alloc(20);h.writeUInt32LE(0x46546c67);h.writeUInt32LE(2,4);h.writeUInt32LE(28+jb.length+bb.length,8);h.writeUInt32LE(jb.length,12);h.writeUInt32LE(0x4e4f534a,16);const bh=Buffer.alloc(8);bh.writeUInt32LE(bb.length);bh.writeUInt32LE(0x004e4942,4);return Buffer.concat([h,jb,bh,bb]);}
const manifest=[];
for(const [id,file,height] of entries){
 if(only && only!==id)continue;
 blobs=new Map();const source=path.join(sources,file),model=parse(source);await new Promise(r=>setTimeout(r,0));model.updateMatrixWorld(true);
 const meshes=[];model.traverse(n=>{if(n.isSkinnedMesh)meshes.push(n);});
 const bones=[];model.traverse(n=>{if(n.isBone)bones.push(n);});
 const counts=new Map();for(const b of bones)counts.set(b.name,(counts.get(b.name)||0)+1);
 // FBX skins introduce identity child bones with the same names as their
 // animated parents. Preserve their weights, but never bind tracks to them.
 bones.forEach((b,i)=>{if(counts.get(b.name)>1&&!b.userData.transformData)b.name+='__skin'+i;});
 const boneIndex=new Map(bones.map((b,i)=>[b,i])),inverses=new Map();
 for(const m of meshes)m.skeleton.bones.forEach((b,i)=>inverses.set(b,m.skeleton.boneInverses[i]));
 const materials=[...new Set(meshes.flatMap(m=>Array.isArray(m.material)?m.material:[m.material]))];
 const grid=Math.ceil(Math.sqrt(materials.length)),tile=384,pad=4,atlasSize=grid*(tile+pad*2),configs=[];
 for(let i=0;i<materials.length;i++){
  const mat=materials[i],texture=mat.map,image=texture?.image,blob=blobs.get(image?.src);let imagePath=null;
  if(blob){imagePath=path.join(temp,`${id}-${i}.png`);fs.writeFileSync(imagePath,Buffer.from(await blob.arrayBuffer()));}
  configs.push({image:imagePath,color:mat.color?.toArray()||[1,1,1],x:(i%grid)*(tile+pad*2),y:Math.floor(i/grid)*(tile+pad*2)});
 }
 const config=path.join(temp,id+'.json'),atlas=path.join(temp,id+'-atlas.png');fs.writeFileSync(config,JSON.stringify({size:atlasSize,tile,pad,items:configs}));
 const python=spawnSync('python3',['scripts/lib/citizen-atlas.py',config,atlas],{encoding:'utf8'});if(python.status)throw Error(python.stderr);
 let vertices=0;for(const m of meshes)vertices+=m.geometry.index?.count || m.geometry.attributes.position.count;
 const pos=new Float32Array(vertices*3),norm=new Float32Array(vertices*3),uv=new Float32Array(vertices*2),joints=new Uint16Array(vertices*4),weights=new Float32Array(vertices*4);let cursor=0;
 for(const mesh of meshes){
  const g=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry,attrs=g.attributes,mats=Array.isArray(mesh.material)?mesh.material:[mesh.material],normalMatrix=new T.Matrix3().getNormalMatrix(mesh.matrixWorld);
  for(let i=0;i<attrs.position.count;i++,cursor++){
   new T.Vector3().fromBufferAttribute(attrs.position,i).applyMatrix4(mesh.matrixWorld).toArray(pos,cursor*3);
   new T.Vector3().fromBufferAttribute(attrs.normal,i).applyMatrix3(normalMatrix).normalize().toArray(norm,cursor*3);
   const group=g.groups.find(group=>i>=group.start&&i<group.start+group.count),mat=mats[group?.materialIndex||0],mi=materials.indexOf(mat),cfg=configs[mi];
   const u=T.MathUtils.clamp(attrs.uv?.getX(i)||0,0,1),v=T.MathUtils.clamp(attrs.uv?.getY(i)||0,0,1);
   uv[cursor*2]=(cfg.x+pad+u*tile)/atlasSize;uv[cursor*2+1]=(cfg.y+pad+(1-v)*tile)/atlasSize;
   for(let k=0;k<4;k++){joints[cursor*4+k]=boneIndex.get(mesh.skeleton.bones[attrs.skinIndex.getComponent(i,k)])||0;weights[cursor*4+k]=attrs.skinWeight.getComponent(i,k);}
  }
 }
 const geometry=new T.BufferGeometry();for(const [name,values,size]of [['position',pos,3],['normal',norm,3],['uv',uv,2],['skinIndex',joints,4],['skinWeight',weights,4]])geometry.setAttribute(name,new T.BufferAttribute(values,size));
 const merged=mergeVertices(geometry,1e-5),material=new T.MeshStandardMaterial({name:'CitizenAtlas',color:0xffffff,roughness:.92,metalness:0,alphaTest:.4,side:T.DoubleSide});
 const mesh=new T.SkinnedMesh(merged,material);mesh.name=id+'Citizen';model.add(mesh);mesh.bind(new T.Skeleton(bones,bones.map(b=>inverses.get(b)||new T.Matrix4())),new T.Matrix4());for(const m of meshes)m.removeFromParent();
 const box=new T.Box3().setFromObject(model),scale=height/(box.max.y-box.min.y);model.scale.multiplyScalar(scale);model.position.y-=box.min.y*scale;model.updateMatrixWorld(true);
 const animations=[];
 for(const [key,filename] of [['jab','Boxing Lead Jab'],['cross','Cross Punch'],['hook','Boxing Hook'],['combatIdle','Boxing Stance'],['idle','Idle'],['walk','Walking'],['run','Fast Run'],['startle','Citizen Startle'],['hit','Light Hit To Head'],['hitBody','Hit To Body'],['hitUppercut','Receive Uppercut To The Face']]){
  const filenamePath=`public/models/${filename}.fbx`;if(!fs.existsSync(filenamePath)){if(key==='startle')continue;throw Error(filenamePath);}
  const sourceMotion=parse(filenamePath);let take=sourceMotion.animations[0];if(key==='startle')take=T.AnimationUtils.subclip(take,key,0,30,30);const clip=retargetMotion(model,sourceMotion,take,20);clip.name=key;clip.optimize();animations.push(clip);
 }
 const glb=Buffer.from(await new GLTFExporter().parseAsync(model,{binary:true,animations,onlyVisible:false})),jl=glb.readUInt32LE(12),json=JSON.parse(glb.subarray(20,20+jl));let bin=glb.subarray(28+jl),image=fs.readFileSync(atlas);const offset=Math.ceil(bin.length/4)*4;bin=Buffer.concat([bin,Buffer.alloc(offset-bin.length),image]);
 const view=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:image.length});json.images=[{bufferView:view,mimeType:'image/png'}];json.samplers=[{magFilter:9729,minFilter:9987,wrapS:33071,wrapT:33071}];json.textures=[{sampler:0,source:0}];json.materials[0].pbrMetallicRoughness.baseColorTexture={index:0};json.buffers[0].byteLength=bin.length;
 const result=pack(json,bin);fs.writeFileSync(`${output}/${id}.glb`,result);
 manifest.push({id,file,bytes:result.length,sourceBytes:fs.statSync(source).size,sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),triangles:vertices/3,vertices:merged.attributes.position.count,bones:bones.length,meshes:1,materials:1,atlasSize,animations:animations.map(a=>({key:a.name,duration:a.duration,nominalSpeed:a.userData.nominalSpeed}))});console.log('COMPILED',manifest.at(-1));
}
if(!only)fs.writeFileSync(`${output}/manifest.json`,JSON.stringify({version:1,characters:manifest},null,2)+'\n');
fs.rmSync(temp,{recursive:true,force:true});
