import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadMotionRig,disposeRig} from './lib/motion-rig.mjs';
import {setAppearance,updateAppearance,disposeAppearance} from '../src/CharacterAppearance.js';
import {CombatSystem} from '../src/Combat.js';
import {soleSamples} from '../src/CharacterPose.js';
const {actor,clips}=await loadMotionRig(),assets={},results=[];
for(const [mode,name] of [['web','변신모습'],['combat','사람모습']]){
 const b=fs.readFileSync(`public/models/appearance-${mode}.glb`),length=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+length));
 assert.equal(j.asset.extras.sourceSha256,crypto.createHash('sha256').update(fs.readFileSync(`artifacts/${name}.glb`)).digest('hex'));
 assert(j.images.length>=1,'Authored textures must remain embedded');
 j.buffers[0].uri='data:application/octet-stream;base64,'+b.subarray(28+length).toString('base64');delete j.images;delete j.textures;j.materials=[];for(const m of j.meshes)for(const p of m.primitives)delete p.material;
 const gltf=await new GLTFLoader().parseAsync(JSON.stringify(j),''),mesh=gltf.scene.getObjectByProperty('isSkinnedMesh',true);assert.equal(mesh.skeleton.bones.length,65);
 const {skinIndex:si,skinWeight:sw,position:p}=mesh.geometry.attributes;
 for(let i=0;i<p.count;i++){let sum=0;for(let k=0;k<4;k++){assert(si.getComponent(i,k)<65);assert(sw.getComponent(i,k)>=0);sum+=sw.getComponent(i,k);}assert(Math.abs(sum-1)<2e-6);}
 assets[mode]={geometry:mesh.geometry,material:new T.MeshStandardMaterial()};results.push({case:mode+' source, textures and normalized weights',vertices:p.count,pass:true});
}
const c=actor();c.appearances=assets;updateAppearance(c,0);assert.equal(c.appearanceMode,'web');
const webSoles=soleSamples(c,'left');assert(webSoles.length>0);
setAppearance(c,'combat',false);const combatSoles=soleSamples(c,'left');
assert.notEqual(combatSoles,webSoles,'Each appearance needs sole samples for its own geometry');
assert(combatSoles.every(({vertex})=>vertex<c.model.getObjectByProperty('isSkinnedMesh',true).geometry.attributes.position.count),
 'Combat sole cache contains vertex indices from the larger web model');
setAppearance(c,'web',false);
results.push({case:'appearance changes invalidate cached foot-contact vertices',webSoleSamples:webSoles.length,combatSoleSamples:combatSoles.length,pass:true});
const root=c.group.position.clone(),mixer=c.mixer,skeleton=c.model.getObjectByProperty('isSkinnedMesh',true).skeleton;
c.fadeToAction('run',0);c.mixer.update(.23);const time=c.activeAction.time,pose=Object.values(c.bones).map(b=>b.quaternion.clone());
const physics={state:'IDLE',velocity:new T.Vector3(3,2,1),clearPendingInput(){},clearWebAnchor(){}};
const combat=new CombatSystem(c.scene,physics,c);assert.equal(combat.mode,'web');
for(let i=0;i<40;i++){combat.toggle({});updateAppearance(c,1/60);assert.equal(c.appearanceMode,combat.mode);assert.equal(c.mixer,mixer);assert.equal(c.activeAction.time,time);assert(c.group.position.equals(root));assert.deepEqual(physics.velocity.toArray(),[3,2,1]);assert.equal(c.model.getObjectByProperty('isSkinnedMesh',true).skeleton,skeleton);Object.values(c.bones).forEach((b,k)=>assert(b.quaternion.equals(pose[k])));}
updateAppearance(c,1);assert.equal(c.transformTime,null);assert.equal(c.transformEffect.visible,false);results.push({case:'40 mode changes preserve pose, mixer, root and momentum; effect expires',pass:true});
const camera=new T.PerspectiveCamera();c.setFirstPersonCamera(camera);c.setFirstPersonMode(true);combat.toggle();updateAppearance(c,0);assert(c.firstPersonRig.visible);assert.equal(c.model.visible,false);assert(c.firstPersonGloves.every(g=>g));assert.equal(c.transformEffect.visible,false);c.setFirstPersonMode(false);results.push({case:'First-person appearance rebuild preserves view mode',pass:true});
for(const mode of ['web','combat']){
 setAppearance(c,mode,false);const mesh=c.model.getObjectByProperty('isSkinnedMesh',true),p=mesh.geometry.attributes.position;
 let samples=0,maxExtent=0;
 for(const {key,clip,archived} of clips){if(archived)continue;c.mixer.stopAllAction();const a=c.actions[key];a.enabled=true;a.reset().play();a.setEffectiveWeight(1);
  for(const fraction of [0,.2,.45,.7,.99]){a.time=clip.duration*fraction;c.mixer.update(0);c.group.updateMatrixWorld(true);mesh.skeleton.update();const box=new T.Box3();
   for(let i=0;i<p.count;i++){const v=mesh.applyBoneTransform(i,new T.Vector3().fromBufferAttribute(p,i)).applyMatrix4(mesh.matrixWorld);assert(v.toArray().every(Number.isFinite),`${mode}/${key}: invalid skin vertex`);box.expandByPoint(v);}
   const size=box.getSize(new T.Vector3());maxExtent=Math.max(maxExtent,size.length());assert(size.length()<5.5,`${mode}/${key}: exploded mesh ${size.toArray()}`);samples++;
  }
 }
 results.push({case:mode+' all catalog motions skin finite and bounded',motionCount:clips.filter(c=>!c.archived).length,samples,maxExtent,pass:true});
}
disposeAppearance(c);disposeRig(c);
fs.writeFileSync('docs/qa/appearances-2026-10-19/results.json',JSON.stringify(results,null,2)+'\n');for(const r of results)console.log('PASS APPEARANCE:',JSON.stringify(r));
