import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as T from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadMotionRig,disposeRig} from './lib/motion-rig.mjs';
import {MOTIONS} from '../src/MotionCatalog.js';
import {AIR_TRICKS} from '../src/AirTricks.js';
import {boneId} from '../src/MotionRetarget.js';
const folder='docs/qa/system-motion-2026-10-27';fs.mkdirSync(folder,{recursive:true});
const {actor,clips}=await loadMotionRig(),c=actor();
globalThis.document={createElementNS(){return {addEventListener(){},removeEventListener(){},set src(value){}};}};
globalThis.window={URL:globalThis.URL};
const files=execFileSync('rg',['--files','-g','*.fbx','-g','*.FBX','-g','*.glb','-g','*.gltf','-g','*.bvh'],{encoding:'utf8'}).trim().split('\n').sort((a,b)=>Number(!a.startsWith('public/'))-Number(!b.startsWith('public/'))||a.localeCompare(b));
const digests=new Map(),assets=[];
for(const file of files){
 const bytes=fs.readFileSync(file),sha256=crypto.createHash('sha256').update(bytes).digest('hex'),same=digests.get(sha256);
 if(same){assets.push({file,sha256,duplicateOf:same.file,takes:same.takes,status:same.status});continue;}
 const item={file,sha256,takes:[],status:'PASS'};
 try{
  let scene,takes=[];
  if(/\.fbx$/i.test(file)){scene=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');takes=scene.animations;}
  else if(/\.glb$/i.test(file)){
   const length=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+length));
   if(!j.buffers?.length){item.status='NOT_APPLICABLE';item.usage='empty scene placeholder';digests.set(sha256,item);assets.push(item);continue;}
   j.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(28+length).toString('base64');delete j.images;delete j.textures;j.materials=[];
   j.meshes?.forEach(m=>m.primitives.forEach(p=>delete p.material));
   const gltf=await new GLTFLoader().parseAsync(JSON.stringify(j),'');scene=gltf.scene;takes=gltf.animations;
  }else throw Error('Unimplemented source format');
  for(const take of takes){const errors=[];
   if(!(take.duration>0)){item.takes.push({name:take.name,duration:take.duration,tracks:take.tracks.length,status:'NOT_APPLICABLE',reason:'Empty placeholder take; not a playable animation'});continue;}
   for(const track of take.tracks){if(!track.values.every(Number.isFinite)||!track.times.every(Number.isFinite))errors.push('non-finite '+track.name);}
   item.takes.push({name:take.name,duration:take.duration,tracks:take.tracks.length,errors,status:errors.length?'FAIL':'PASS'});
  }
  if(item.takes.some(t=>t.status==='FAIL'))item.status='FAIL';
  item.runtimeKeys=MOTIONS.filter(m=>'public'+m.url===file).map(m=>m.key);
  item.usage=item.runtimeKeys.length?'runtime source':file.startsWith('artifacts/itchio/')?'packaged copy':item.takes.length?'unused/archived source':'static geometry/appearance';
  scene?.traverse(n=>{if(n.isMesh){n.geometry?.dispose();const materials=Array.isArray(n.material)?n.material:[n.material];materials.forEach(m=>m?.dispose());}n.skeleton?.dispose();});
 }catch(e){item.status='UNVERIFIED';item.error=e.message;}
 digests.set(sha256,item);assets.push(item);
}
const bones=Object.values(c.bones),bindErrors=[],meshes=[];
for(const b of bones){if(!b.parent)bindErrors.push(b.name+' has no parent');if(![...b.position,...b.quaternion,...b.scale].every(Number.isFinite))bindErrors.push(b.name+' non-finite bind');}
c.model.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const{skinWeight:w,skinIndex:j}=mesh.geometry.attributes;let badWeights=0,badIndices=0;for(let v=0;v<w.count;v++){let sum=0;for(let k=0;k<4;k++){const weight=w.getComponent(v,k);sum+=weight;if(weight<0||!Number.isFinite(weight))badWeights++;if(weight>0&&j.getComponent(v,k)>=mesh.skeleton.bones.length)badIndices++;}if(Math.abs(sum-1)>.001)badWeights++;}meshes.push({name:mesh.name,vertices:w.count,bones:mesh.skeleton.bones.length,badWeights,badIndices,badInverses:mesh.skeleton.boneInverses.filter(m=>!m.elements.every(Number.isFinite)||Math.abs(m.determinant())<1e-8).length});});
const motions=[];
const stateMap={idle:'IDLE',walk:'RUNNING',regularRun:'RUNNING',run:'SPRINTING',stop:'RUNNING→IDLE',runStop:'SPRINTING→IDLE',turnLeft:'TURNING',turnRight:'TURNING',jump:'JUMPING',drop:'FALLING < .24s',fall:'FALLING',land:'LANDING',roll:'ROLLING',swing:'SWINGING',zip:'WEB_ZIP',wall:'WALL_RUNNING/MANTLING',airTrick:'AIR_TRICKS.front',backTrick:'AIR_TRICKS.back'};
for(const item of clips){const clip=item.clip,errors=[],seen=new Set(),deltas=[];
 for(const track of clip.tracks){if(seen.has(track.name))errors.push('duplicate track '+track.name);seen.add(track.name);
  if(!track.times.every((t,i)=>Number.isFinite(t)&&(!i||t>=track.times[i-1])))errors.push('invalid times '+track.name);
  if(!track.values.every(Number.isFinite))errors.push('non-finite track '+track.name);
  if(track.name.endsWith('.quaternion'))for(let i=0;i<track.values.length;i+=4){if(Math.abs(new T.Quaternion().fromArray(track.values,i).length()-1)>1e-3)errors.push('non-unit '+track.name);}
  for(let i=1;i<track.times.length;i++)if(track.times[i]>track.times[i-1])deltas.push(track.times[i]-track.times[i-1]);
 }
 const source=MOTIONS.find(m=>m.key===item.key);
 const retainedOnly=['jumpDown','jumpDownVariant','fallVariant','injuredIdle','rightHook'].includes(item.key);
 const selection=retainedOnly?'explicit review/network selection; no ordinary automatic selector':item.key==='fallIdle'?'air-trick fallback / explicit review':stateMap[item.key]||'combatAction.key';
 motions.push({key:item.key,file:'public/motions/'+item.key+'.json',source:source?.url||'embedded or archived',duration:clip.duration,sampleInterval:deltas.length?Math.min(...deltas):null,bones:[...new Set(clip.tracks.map(t=>t.name.split('.')[0]))],tracks:clip.tracks.length,loop:!!item.loop,archived:!!item.archived,selectedBy:selection,callSites:['src/Character.js: update/fadeToAction','src/RemoteMotion.js: receive/update'],endCondition:item.loop?'state change or action interruption':'clip end or gameplay action timer/state change',rootMotion:clip.userData?.rootMotion||null,sync:'state, combat timer, animation sample via RemoteMotion/capturePose',automated:errors.length?'FAIL':'PASS',visual:'UNVERIFIED',errors});
}
const sourceFiles=execFileSync('rg',['-l','AnimationMixer|AnimationAction|AnimationClip|KeyframeTrack|SkinnedMesh|Skeleton|GLTFLoader|FBXLoader|retarget|crossFade|fadeIn|fadeOut|Quaternion|solveLimb','src','scripts','--glob','*.js','--glob','*.mjs'],{encoding:'utf8'}).trim().split('\n');
const result={date:'2026-10-27',counts:{registered:MOTIONS.length,compiled:clips.length,compiledArchived:clips.filter(m=>m.archived).length,assets:assets.length,uniqueAssets:digests.size,sourceTakes:[...digests.values()].reduce((n,a)=>n+a.takes.length,0),bones:bones.length,proceduralAirTricks:Object.keys(AIR_TRICKS).length},rig:{hierarchy:bones.map(b=>({name:b.name,id:boneId(b.name),parent:b.parent.name,position:b.position.toArray(),quaternion:b.quaternion.toArray(),scale:b.scale.toArray()})),bindErrors,meshes},motions,assets,animationSourceFiles:sourceFiles,procedural:{airTricks:AIR_TRICKS,lowStances:['crouch'],removedLowStances:['prone'],webLayers:['body aim','per-hand IK','shoot/grip fingers'],combatLayers:['guard','travel strikes','hit/dodge','gaze','wrist alignment','footwork'],terrainLayers:['foot planting','pelvis adaptation','sole clearance','wall contacts','mantle','roll recovery']},limits:'Structural PASS does not mean visual naturalness. Archived takes and impossible state pairs require separate visual judgement.'};
fs.writeFileSync(folder+'/inventory.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.counts));console.log('Rig:',JSON.stringify(meshes),'bind errors',bindErrors.length);console.log('Asset failures',assets.filter(a=>a.status!=='PASS').map(a=>[a.file,a.error]));disposeRig(c);
if(motions.some(m=>m.errors.length)||meshes.some(m=>m.badWeights||m.badIndices||m.badInverses)||bindErrors.length)process.exitCode=1;
