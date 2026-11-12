import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadMotionRig,disposeRig} from './lib/motion-rig.mjs';

globalThis.ProgressEvent ||= class {constructor(type,values){Object.assign(this,values);}};
const data=fs.readFileSync('public/models/weapons/sniper-rifle.glb');
const length=data.readUInt32LE(12),json=JSON.parse(data.subarray(20,20+length));
json.buffers[0].uri='data:application/octet-stream;base64,'+data.subarray(28+length).toString('base64');
delete json.images;delete json.textures;json.materials=[];
json.meshes.forEach(m=>m.primitives.forEach(p=>delete p.material));
const model=(await new GLTFLoader().parseAsync(JSON.stringify(json),'')).scene;
const {actor}=await loadMotionRig();
for(const yaw of [0,Math.PI/2,Math.PI,3*Math.PI/2]){
 const c=actor();try{
  const mount=new THREE.Group();mount.add(model.clone(true));c.rightHand.add(mount);
  c.extraWeapons={'sniper-rifle':mount};c.extraWeapon='sniper-rifle';c.extraWeaponVisible=true;c.gunVisible=true;c.combatStance=true;c.visualYaw=c.targetFacingAngle=yaw;
  for(let i=0;i<60;i++){c.combatAction={key:'gunIdle'};c.update(1/60,'IDLE',new THREE.Vector3(),null);}
  const muzzle=new THREE.Vector3(0,0,.494).applyMatrix4(mount.matrixWorld);
  const stock=new THREE.Vector3(0,0,-.410).applyMatrix4(mount.matrixWorld);
  const forward=new THREE.Vector3(Math.sin(c.visualYaw),0,Math.cos(c.visualYaw));
  assert(muzzle.sub(stock).normalize().dot(forward)>.99,`Rifle mesh points backward at yaw ${yaw}`);
 }finally{disposeRig(c);}
}
console.log('PASS actual rifle GLB muzzle faces forward in four directions');
