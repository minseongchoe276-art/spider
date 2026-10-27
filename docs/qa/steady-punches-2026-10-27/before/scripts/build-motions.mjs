import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { retargetMotion, prepareMotion } from '../src/MotionRetarget.js';
import {createJointConstraints} from '../src/JointConstraints.js';
import { MOTIONS } from '../src/MotionCatalog.js';

// Keep original FBXs for authoring, but ship lightweight retargeted tracks.
const files=['public/models/shadow-pulse-rig.glb','src/MotionCatalog.js','src/MotionRetarget.js','src/CombatChoreography.js','src/MixamoMotion.js','src/JointConstraints.js','src/WebHandPose.js',
  ...new Set(MOTIONS.map(item=>'public'+item.url))];
const hash=crypto.createHash('sha256');
for(const file of files) hash.update(fs.readFileSync(file));
const fingerprint=hash.digest('hex');
const manifestPath='public/motions/manifest.json';
if(fs.existsSync(manifestPath)) {
  const manifest=JSON.parse(fs.readFileSync(manifestPath));
  if(manifest.fingerprint===fingerprint && MOTIONS.every(m=>fs.existsSync(`public/motions/${m.key}.json`))) {
    console.log('PASS: compiled motions match current model and FBX sources');process.exit(0);
  }
}
// Texture-free target loading is only used by this offline compiler.
globalThis.ProgressEvent=class {constructor(type,values){Object.assign(this,values);}};
globalThis.document={createElementNS(){return {addEventListener(){},removeEventListener(){},set src(value){}};}};
globalThis.window={URL:globalThis.URL};
const data=fs.readFileSync('public/models/shadow-pulse-rig.glb'),length=data.readUInt32LE(12);
const json=JSON.parse(data.subarray(20,20+length));
json.buffers[0].uri=`data:application/octet-stream;base64,${data.subarray(28+length).toString('base64')}`;
delete json.images;delete json.textures;json.materials=[];
json.meshes.forEach(mesh=>mesh.primitives.forEach(part=>delete part.material));
const target=(await new GLTFLoader().parseAsync(JSON.stringify(json),'')).scene;
const bones={};target.traverse(b=>{if(b.isBone)bones[b.name]=b;});
fs.mkdirSync('public/motions',{recursive:true});
let bytes=0;
for(const item of MOTIONS) {
  const data=fs.readFileSync('public'+item.url);
  const buffer=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
  const gltf=item.url.endsWith('.glb')?await new GLTFLoader().parseAsync(buffer,''):null;
  const source=gltf?.scene || new FBXLoader().parse(buffer,'');
  const take=(gltf?.animations || source.animations).find(clip=>(!item.take || clip.name===item.take)&&clip.duration>0&&clip.tracks.length);
  assert(take,`No take in ${item.url}`);
  const clip=prepareMotion(retargetMotion(target,source,take),item.key,bones,item);
  // Bake anatomical limits into review clips as well as live IK output.
  for(const {bone,rest,limit} of createJointConstraints(target,bones)){
    const track=clip.tracks.find(t=>t.name===bone.name+'.quaternion');
    if(!track)continue;
    for(let i=0;i<track.values.length;i+=4){
      const q=new THREE.Quaternion().fromArray(track.values,i),angle=rest.angleTo(q);
      if(angle>limit)q.slerpQuaternions(rest,q.clone(),limit/angle).normalize().toArray(track.values,i);
    }
  }
  const compiled={...THREE.AnimationClip.toJSON(clip),userData:clip.userData};
  const parsed=THREE.AnimationClip.parse(compiled);
  assert.equal(parsed.tracks.length,clip.tracks.length);
  for(let n=0;n<clip.tracks.length;n++) assert.deepEqual(parsed.tracks[n].values,clip.tracks[n].values);
  const output=JSON.stringify(compiled);bytes+=Buffer.byteLength(output);
  fs.writeFileSync(`public/motions/${item.key}.json`,output);
}
fs.writeFileSync(manifestPath,JSON.stringify({fingerprint,count:MOTIONS.length,bytes},null,2)+'\n');
console.log(`PASS: compiled ${MOTIONS.length} motions, ${(bytes/1024/1024).toFixed(2)} MiB; track values preserved`);
