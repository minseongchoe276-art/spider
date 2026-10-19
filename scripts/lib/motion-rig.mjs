import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {Character} from '../../src/Character.js';
import {MOTIONS} from '../../src/MotionCatalog.js';
import {boneId} from '../../src/MotionRetarget.js';

export async function loadMotionRig() {
  globalThis.ProgressEvent ||= class {constructor(type,values){Object.assign(this,values);}};
  const raw=fs.readFileSync('public/models/shadow-pulse-rig.glb'),length=raw.readUInt32LE(12);
  const json=JSON.parse(raw.subarray(20,20+length));
  json.buffers[0].uri=`data:application/octet-stream;base64,${raw.subarray(28+length).toString('base64')}`;
  delete json.images;delete json.textures;json.materials=[];
  json.meshes.forEach(mesh=>mesh.primitives.forEach(part=>delete part.material));
  const gltf=await new GLTFLoader().parseAsync(JSON.stringify(json),'');
  const clips=MOTIONS.map(item=>{const data=JSON.parse(fs.readFileSync(`public/motions/${item.key}.json`));
    const clip=THREE.AnimationClip.parse(data);clip.userData=data.userData;return {...item,clip};});
  if(gltf.animations[0]){const clip=gltf.animations[0].clone();clip.name='default';clips.push({key:'default',loop:true,clip});}
  for(const file of fs.readdirSync('public/motions').filter(name=>name.endsWith('.json') && name!=='manifest.json' && !MOTIONS.some(m=>m.key+'.json'===name))){
    const data=JSON.parse(fs.readFileSync('public/motions/'+file)),clip=THREE.AnimationClip.parse(data);clip.userData=data.userData;clip.name=file.slice(0,-5);
    clips.push({key:clip.name,loop:false,clip,archived:true});
  }
  function actor(){const c=Object.create(Character.prototype),scene=new THREE.Scene();
    Object.assign(c,{scene,group:new THREE.Group(),model:clone(gltf.scene),bones:{},actions:{},activeAction:null,isLoaded:true,
      currentHand:'left',webHandWeights:{},webHandTargets:{},webLaunchTimers:{},webAttachments:[],
      webShotTimer:0,bodyPitch:0,visualYaw:0,targetFacingAngle:0,idleTime:0,trickRotation:0,lastState:null,groundProbe:()=>0});
    scene.add(c.group);c.group.add(c.model);c.group.position.y=.1;c.mixer=new THREE.AnimationMixer(c.model);
    c.model.traverse(node=>{if(node.isBone){c.bones[node.name]=node;if(boneId(node.name)==='lefthand')c.leftHand=node;if(boneId(node.name)==='righthand')c.rightHand=node;}});
    for(const item of clips){const action=c.mixer.clipAction(item.clip);action.setLoop(item.loop?THREE.LoopRepeat:THREE.LoopOnce);action.clampWhenFinished=!item.loop;c.actions[item.key]=action;}
    c.initWebVisual();return c;
  }
  return {actor,clips,template:gltf.scene,embeddedCount:gltf.animations.length};
}
export const joint=(c,id)=>Object.values(c.bones).find(b=>boneId(b.name)===id);
export const point=(c,id)=>joint(c,id).getWorldPosition(new THREE.Vector3());
export const landmarks=c=>['hips','head','lefthand','righthand','leftfoot','rightfoot'].map(id=>point(c,id));
export function disposeRig(c){c.mixer.stopAllAction();c.mixer.uncacheRoot(c.model);c.model.traverse(node=>node.skeleton?.dispose());
  for(const object of [c.webLine,c.webMesh,c.webLineOffhand,c.webMeshOffhand]){object.geometry.dispose();object.material.dispose();}
}
