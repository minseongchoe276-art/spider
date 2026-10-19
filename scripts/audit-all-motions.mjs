import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { retargetMotion, boneId } from '../src/MotionRetarget.js';

globalThis.ProgressEvent = class { constructor(type, values) { Object.assign(this, values); } };
globalThis.document = { createElementNS() { return {addEventListener(){},removeEventListener(){},set src(v){}}; } };
globalThis.window = { URL: globalThis.URL };
const data = fs.readFileSync('public/models/shadow-pulse-rig.glb');
const jsonLength = data.readUInt32LE(12);
const json = JSON.parse(data.subarray(20,20+jsonLength).toString());
json.buffers[0].uri = `data:application/octet-stream;base64,${data.subarray(28+jsonLength).toString('base64')}`;
delete json.images; delete json.textures; json.materials = [];
json.meshes.forEach(m => m.primitives.forEach(p => delete p.material));
const target = (await new GLTFLoader().parseAsync(JSON.stringify(json),'')).scene;
const characterSource = fs.readFileSync('src/Character.js','utf8');
const bindings = new Map([...characterSource.matchAll(/key: '([^']+)', url: '\/models\/([^']+)'/g)].map(m => [m[2],m[1]]));
const files = fs.readdirSync('public/models').filter(f => /\.fbx$/i.test(f)).sort();
const extras = ['/Users/choeminseong/Downloads/Walking (1).fbx','/Users/choeminseong/Downloads/Falling (1).fbx'];
const fingerprints = new Map();
let failures = 0;
for (const path of [...files.map(f => 'public/models/'+f), ...extras.filter(p => fs.existsSync(p))]) {
  const file = path.split('/').at(-1);
  try {
    const buffer = fs.readFileSync(path);
    const digest = crypto.createHash('sha256').update(buffer).digest('hex');
    const duplicateOf = fingerprints.get(digest) || null;
    fingerprints.set(digest,path);
    const source = new FBXLoader().parse(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');
    const take = source.animations.find(c => c.duration > 0 && c.tracks.length);
    if (!take) throw new Error('No animated take');
    const clip = retargetMotion(target,source,take);
    const mixer = new THREE.AnimationMixer(target);
    mixer.clipAction(clip).setLoop(THREE.LoopOnce).play();
    const bones = new Map();target.traverse(n=>{if(n.isBone)bones.set(boneId(n.name),n);});
    const poses = [];
    for (let frame=0; frame<=Math.ceil(clip.duration*60);frame++) {
      mixer.setTime(Math.min(clip.duration-1e-6,frame/60)); target.updateMatrixWorld(true);
      const point = id => bones.get(id).getWorldPosition(new THREE.Vector3());
      const head=point('head'),hips=point('hips'),l=point('leftfoot'),r=point('rightfoot');
      poses.push({torsoUp:head.clone().sub(hips).normalize().y,headAboveFeet:head.y-Math.min(l.y,r.y),feet:[l,r]});
    }
    const range = fn => [Math.min(...poses.map(fn)),Math.max(...poses.map(fn))].map(v=>+v.toFixed(3));
    const footTravel=[0,1].map(i=>+Math.max(...poses.map(p=>p.feet[i].distanceTo(poses[0].feet[i]))).toFixed(3));
    const seam=Math.max(...clip.tracks.filter(t=>t.ValueTypeName==='quaternion').map(t=>
      new THREE.Quaternion().fromArray(t.values).angleTo(new THREE.Quaternion().fromArray(t.values,t.values.length-4))));
    const finite=clip.tracks.every(t=>[...t.values].every(Number.isFinite));
    if(!finite || clip.userData.matchedBones<50) throw new Error('Invalid tracks/bone coverage');
    console.log(JSON.stringify({path,file,loadedAction:bindings.get(file)||null,duplicateOf,
      takes:source.animations.map(a=>({name:a.name,duration:+a.duration.toFixed(3),tracks:a.tracks.length})),
      matchedBones:clip.userData.matchedBones,duration:+clip.duration.toFixed(3),checkedFrames:poses.length,
      nominalSpeed:+clip.userData.nominalSpeed.toFixed(3),torsoUp:range(p=>p.torsoUp),
      headAboveFeet:range(p=>p.headAboveFeet),footTravel,rawLoopSeamDegrees:+THREE.MathUtils.radToDeg(seam).toFixed(1)}));
    mixer.stopAllAction();mixer.uncacheRoot(target);
  } catch(error) { failures++;console.log(JSON.stringify({path,error:error.message})); }
}
if(failures) process.exitCode=1;
