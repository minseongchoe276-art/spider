import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MOTIONS } from '../src/MotionCatalog.js';
import { RemoteMotion, sanitizePose, capturePose } from '../src/RemoteMotion.js';

globalThis.ProgressEvent=class {constructor(type,values){Object.assign(this,values);}};
const raw=fs.readFileSync('public/models/shadow-pulse-rig.glb'),length=raw.readUInt32LE(12);
const json=JSON.parse(raw.subarray(20,20+length));
json.buffers[0].uri=`data:application/octet-stream;base64,${raw.subarray(28+length).toString('base64')}`;
delete json.images;delete json.textures;json.materials=[];
json.meshes.forEach(m=>m.primitives.forEach(p=>delete p.material));
const model=(await new GLTFLoader().parseAsync(JSON.stringify(json),'')).scene;
const source={model,mixer:new THREE.AnimationMixer(model),actions:{}};
for(const motion of MOTIONS){
  const data=JSON.parse(fs.readFileSync(`public/motions/${motion.key}.json`));
  const clip=THREE.AnimationClip.parse(data);clip.userData=data.userData;
  const action=source.mixer.clipAction(clip);action.setLoop(motion.loop?THREE.LoopRepeat:THREE.LoopOnce);
  action.clampWhenFinished=!motion.loop;source.actions[motion.key]=action;
}
const original=[];model.traverse(b=>{if(b.isBone)original.push([b,b.quaternion.clone()]);});
const geometry=model.getObjectByProperty('isSkinnedMesh',true).geometry;
let sharedDisposed=0;geometry.addEventListener('dispose',()=>sharedDisposed++);
const finalPositions=[];
// Joining while the local model is still loading must never create a capsule
// or freeze a partial set of clips into the opponent's rig.
const loadingSource={model:null,mixer:null,actions:{},isLoaded:false};
const loadingScene=new THREE.Scene();
const pending=new RemoteMotion(loadingScene,loadingSource,
  {id:'loading-friend',x:0,y:.1,z:0,facing:0,team:'free'},{colliders:[]});
pending.update(1/60,0);
assert.equal(pending.character.placeholder,undefined,'Opponent used a capsule proxy');
assert.equal(pending.character.isLoaded,false);
assert.equal(pending.marker.visible,false,'Marker appeared before the opponent model');
Object.assign(loadingSource,source);
pending.update(1/60,16);
assert.equal(pending.character.model,null,'Cloned a partially loaded animation set');
loadingSource.isLoaded=true;
pending.update(1/60,32);
assert(pending.character.model.getObjectByProperty('isSkinnedMesh',true));
assert.equal(pending.marker.visible,true);
assert.equal(Object.keys(pending.character.actions).length,MOTIONS.length);
const localSkin=source.model.getObjectByProperty('isSkinnedMesh',true);
const remoteSkin=pending.character.model.getObjectByProperty('isSkinnedMesh',true);
assert.equal(remoteSkin.material,localSkin.material,'Opponent lost the SHADOW PULSE suit material');
assert.notEqual(remoteSkin.skeleton,localSkin.skeleton,'Opponent reused the local skeleton');
pending.dispose();assert.equal(loadingScene.children.length,0);
console.log('PASS remote appearance: no capsule, deferred full rig, shared suit material, independent skeleton');
for(const fps of [30,60,144]){
  const scene=new THREE.Scene(),player={id:'friend',x:0,y:.1,z:0,facing:0,team:'free'};
  const remote=new RemoteMotion(scene,source,player,{colliders:[]});
  assert.notEqual(remote.character.model,source.model);
  assert.equal(remote.character.model.getObjectByProperty('isSkinnedMesh',true).geometry,geometry);
  const pose={state:'RUNNING',velocity:{x:0,y:0,z:2.8},webs:[]};
  for(let frame=0;frame<=fps*2;frame++){
    const t=frame/fps;
    if(frame===0 || Math.floor(t*10)>Math.floor((frame-1)/fps*10)){
      player.z=Math.floor(t*10)/10*2.8;remote.receive(player,pose,t*1000);
    }
    remote.update(1/fps,t*1000);
    for(const bone of Object.values(remote.character.bones)){
      assert(bone.quaternion.toArray().every(Number.isFinite));
      assert(Math.abs(bone.quaternion.length()-1)<1e-4);
    }
  }
  finalPositions.push(remote.mesh.position.z);
  assert(['walk','jog','regularRun'].includes(remote.character.activeAction.getClip().name));
  const anchor={x:0,y:40,z:10};
  remote.receive({...player,y:12},{state:'SWINGING',velocity:{x:0,y:-3,z:10},anchor,
    webs:[{hand:'left',anchor}]},2100);
  for(let i=0;i<10;i++)remote.update(1/fps,2100+i*1000/fps);
  assert.equal(remote.character.activeAction.getClip().name,'swing');
  assert(remote.character.webMeshOffhand.visible,'Remote left-hand web was missing');
  remote.receive({...player,y:12},{state:'FALLING',velocity:{x:0,y:-5,z:10},webs:[]},2400);
  remote.update(1/fps,2400);
  assert(!remote.character.webMesh.visible && !remote.character.webMeshOffhand.visible,'Released remote rope remained attached');
  remote.update(.1,4000);
  assert(!remote.character.webMesh.visible && !remote.character.webMeshOffhand.visible,'Stale pose kept a ghost rope');
  remote.dispose();assert.equal(scene.children.length,0,'Remote rig/web leaked after leave');
  assert.equal(sharedDisposed,0,'Leaving disposed the local player model');
  for(const [bone,q] of original)assert(bone.quaternion.equals(q),'Remote animation modified local skeleton');
  console.log(`PASS remote real rig ${fps}fps: strides, independent bones, swing/release, stale pose, leave cleanup`);
}
assert(Math.max(...finalPositions)-Math.min(...finalPositions)<.12,'Network smoothing depends on FPS');
assert.equal(sanitizePose({state:'bogus',velocity:{x:0,y:0,z:0}}),null);
assert.equal(sanitizePose({state:'IDLE',velocity:{x:NaN,y:0,z:0}}),null);
assert.equal(sanitizePose({state:'IDLE',velocity:{x:900,y:0,z:0}}),null);
const sanitized=sanitizePose({state:'IDLE',velocity:{x:0,y:0,z:0},webs:[{anchor:{x:NaN,y:0,z:0}}]});
assert.equal(sanitized.webs.length,0);
assert(capturePose({state:'IDLE',velocity:new THREE.Vector3(),webs:[]},{}));

