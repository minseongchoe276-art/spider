import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { retargetMotion, prepareMotion, boneId } from '../src/MotionRetarget.js';
import { Character } from '../src/Character.js';
import { MOTIONS } from '../src/MotionCatalog.js';

globalThis.ProgressEvent = class { constructor(type, values) { Object.assign(this, values); } };
// Geometry/bind-pose audit does not need textures, and does not change assets.
globalThis.document = { createElementNS() { return {
  addEventListener() {}, removeEventListener() {}, set src(value) {},
}; } };
globalThis.window = { URL: globalThis.URL };
const data = fs.readFileSync('public/models/shadow-pulse-rig.glb');
const jsonLength = data.readUInt32LE(12);
const json = JSON.parse(data.subarray(20, 20 + jsonLength).toString());
const bin = data.subarray(28 + jsonLength);
json.buffers[0].uri = `data:application/octet-stream;base64,${bin.toString('base64')}`;
delete json.images; delete json.textures; json.materials = [];
json.meshes.forEach(m => m.primitives.forEach(p => delete p.material));
const gltf = await new GLTFLoader().parseAsync(JSON.stringify(json), '');
for (const item of MOTIONS) {
  const file = item.url.split('/').at(-1).replace('.fbx','');
  const buffer = fs.readFileSync('public'+item.url);
  const raw=buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);
  const gltfSource=item.url.endsWith('.glb')?await new GLTFLoader().parseAsync(raw,''):null;
  const source=gltfSource?.scene || new FBXLoader().parse(raw,'');
  const sourceClip = (gltfSource?.animations || source.animations).find(c => (!item.take || c.name===item.take)&&c.duration > 0 && c.tracks.length);
  assert(sourceClip, `${file}: empty takes only`);
  const targetBones = {};
  gltf.scene.traverse(n => { if (n.isBone) targetBones[n.name] = n; });
  const clip = prepareMotion(retargetMotion(gltf.scene, source, sourceClip,30,item.mirror), item.key, targetBones,item);
  assert(clip.duration > 0, file + ': empty clip');
  for (const track of clip.tracks.filter(t => t.ValueTypeName === 'quaternion')) {
    for (let n = 0; n < track.values.length; n += 4) {
      assert(Math.abs(new THREE.Quaternion().fromArray(track.values,n).length() - 1) < 1e-5, file + ': non-unit joint rotation');
    }
  }
  assert(clip.userData.matchedBones >= 50, `${file}: missing bones`);
  assert(clip.tracks.every(t => [...t.values].every(Number.isFinite)), `${file}: NaN`);
  if (item.loop) {
    for (const track of clip.tracks.filter(t => t.ValueTypeName === 'quaternion')) {
      const first = new THREE.Quaternion().fromArray(track.values);
      const last = new THREE.Quaternion().fromArray(track.values,track.values.length-4);
      assert(first.angleTo(last) < 0.001, `${file}: loop seam`);
    }
  }
  const hipsTrack = clip.tracks.find(t => t.name.endsWith('Hips.position'));
  assert(hipsTrack, `${file}: no pelvis translation`);
  const mix = new THREE.AnimationMixer(gltf.scene);
  mix.clipAction(clip).play();
  const bones = new Map();
  gltf.scene.traverse(n => { if (n.isBone) bones.set(boneId(n.name), n); });
  const poses = [];
  for (let frame = 0; frame <= Math.ceil(clip.duration * 60); frame++) {
    const fraction = Math.min(0.999, frame / Math.ceil(clip.duration * 60));
    mix.setTime(clip.duration * fraction);
    gltf.scene.updateMatrixWorld(true);
    const pos = id => bones.get(id).getWorldPosition(new THREE.Vector3());
    poses.push({ headY: +pos('head').y.toFixed(3), footY: +Math.min(pos('leftfoot').y, pos('rightfoot').y).toFixed(3),
      leftFoot: pos('leftfoot').toArray(),rightFoot: pos('rightfoot').toArray() });
  }
  if (['Idle', 'Walking', 'Jogging', 'Running', 'Fast Run'].includes(file)) {
    assert(poses.every(p => p.headY > p.footY + 0.6), `${file}: inverted pose`);
    if (file === 'Idle') for (const k of ['leftFoot','rightFoot']) {
      const travel = Math.max(...poses.map(p => new THREE.Vector3().fromArray(p[k]).distanceTo(new THREE.Vector3().fromArray(poses[0][k]))));
      assert(travel < 0.15, 'Idle contains excessive foot movement');
    }
  }
  if (file === 'Rope Swinging') {
    const c = Object.create(Character.prototype); c.bones = targetBones;
    for (const hand of ['left','right']) for (const anchor of [new THREE.Vector3(10,20,0),new THREE.Vector3(-8,15,-5)]) {
      c.currentHand = hand; c.reachWebAnchor(anchor);
      gltf.scene.updateMatrixWorld(true);
      const shoulder = bones.get(hand + 'arm').getWorldPosition(new THREE.Vector3());
      const wrist = bones.get(hand + 'hand').getWorldPosition(new THREE.Vector3());
      const direction = anchor.clone().sub(shoulder).normalize();
      const reached = wrist.clone().sub(shoulder).normalize();
      assert(direction.dot(reached) > 0.999, 'Web hand does not reach toward anchor');
      assert(wrist.toArray().every(Number.isFinite), 'Invalid IK wrist position');
    }
  }
  if (item.key === 'idle') {
    const group=new THREE.Group();group.position.y=0.1;
    group.add(gltf.scene);gltf.scene.position.y=-0.1;group.updateMatrixWorld(true);
    const c=Object.create(Character.prototype);c.group=group;c.bones=targetBones;
    c.plantIdleFeet(1);
    const anchors=['left','right'].map(side=>bones.get(side+'foot').getWorldPosition(new THREE.Vector3()));
    assert(anchors.every(p=>Math.abs(p.y-0.11)<0.02),'Idle ankle contact height');
    mix.setTime(1.8);group.updateMatrixWorld(true);c.plantIdleFeet(0.1);
    for (let k=0;k<2;k++) {
      const p=bones.get(['leftfoot','rightfoot'][k]).getWorldPosition(new THREE.Vector3());
      assert(Math.hypot(p.x-anchors[k].x,p.z-anchors[k].z)<0.02,'Idle feet sliding after plant');
    }
    group.remove(gltf.scene);gltf.scene.position.y=0;gltf.scene.updateMatrixWorld(true);
  }
  mix.stopAllAction(); mix.uncacheRoot(gltf.scene);
  const {rootMotion,footContacts,...audit} = clip.userData;
  if (item.key === 'roll') assert(rootMotion.length > 2 && rootMotion.at(-1).distance > 1, 'Roll lost authored travel');
  console.log(JSON.stringify({ file, key:item.key, duration: +clip.duration.toFixed(3), ...audit, checkedFrames: poses.length,
    samples: [poses[0],poses[Math.floor(poses.length/2)],poses.at(-1)].map(({headY,footY}) => ({headY,footY})) }));
}
