import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Character } from '../src/Character.js';
import { MOTIONS } from '../src/MotionCatalog.js';

globalThis.ProgressEvent=class {constructor(type,values){Object.assign(this,values);}};
const raw=fs.readFileSync('public/models/spiderman.glb'),length=raw.readUInt32LE(12);
const json=JSON.parse(raw.subarray(20,20+length));
json.buffers[0].uri=`data:application/octet-stream;base64,${raw.subarray(28+length).toString('base64')}`;
delete json.images;delete json.textures;json.materials=[];
json.meshes.forEach(mesh=>mesh.primitives.forEach(part=>delete part.material));
const model=(await new GLTFLoader().parseAsync(JSON.stringify(json),'')).scene;
const character=Object.create(Character.prototype);
Object.assign(character,{model,mixer:new THREE.AnimationMixer(model),actions:{},activeAction:null});
const bones=[];model.traverse(node=>{if(node.isBone)bones.push(node);});
const rest=bones.map(bone=>({bone,position:bone.position.clone(),quaternion:bone.quaternion.clone()}));
for(const motion of MOTIONS){
  const data=JSON.parse(fs.readFileSync(`public/motions/${motion.key}.json`));
  const clip=THREE.AnimationClip.parse(data),action=character.mixer.clipAction(clip);
  action.setLoop(motion.loop?THREE.LoopRepeat:THREE.LoopOnce);
  action.clampWhenFinished=!motion.loop;character.actions[motion.key]=action;
}
const report=[];
let frames=0;
for(const fps of [30,60,144])for(const from of MOTIONS)for(const to of MOTIONS){
  character.stopAnimation();
  for(const item of rest){item.bone.position.copy(item.position);item.bone.quaternion.copy(item.quaternion);}
  character.fadeToAction(from.key,0);
  const outgoing=character.activeAction;
  outgoing.time=outgoing.getClip().duration*.95;
  character.mixer.update(1/fps);
  character.fadeToAction(to.key,.18);
  const incoming=character.activeAction;
  for(let frame=0;frame<Math.ceil(.3*fps);frame++){
    character.mixer.update(1/fps);frames++;
    for(const bone of bones){
      assert(bone.position.toArray().every(Number.isFinite),`${from.key} → ${to.key}: invalid position`);
      assert(bone.quaternion.toArray().every(Number.isFinite),`${from.key} → ${to.key}: invalid rotation`);
      assert(Math.abs(bone.quaternion.length()-1)<1e-4,`${from.key} → ${to.key}: non-unit rotation`);
    }
  }
  assert.equal(incoming,character.actions[to.key]);
  if(to.loop)assert(incoming.isRunning(),`${from.key} → ${to.key}: looping action froze`);
  if(outgoing!==incoming)assert(outgoing.getEffectiveWeight()<.001,
    `${from.key} → ${to.key}: old pose still contributes after fade`);
  character.stopAnimation();
  assert(Object.values(character.actions).every(action=>!action.isScheduled()),'Reset left a scheduled action');
  report.push({from:from.key,to:to.key,fps});
}
fs.mkdirSync('docs/qa/motion-quality-2026-10-13',{recursive:true});
fs.writeFileSync('docs/qa/motion-quality-2026-10-13/transitions.json',
  JSON.stringify({motions:MOTIONS.length,pairs:MOTIONS.length**2,cases:report.length,frames,
    note:'Mixer transitions, including deliberately unusual pairs; not a claim that every pair is reachable through gameplay.'},null,2)+'\n');
console.log(`PASS: ${MOTIONS.length**2} clip pairs × 3 frame rates = ${report.length} transitions / ${frames} rig frames`);
