import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {loadMotionRig} from './lib/motion-rig.mjs';
import {MOTIONS} from '../src/MotionCatalog.js';
import {retargetMotion,boneId} from '../src/MotionRetarget.js';

const {template}=await loadMotionRig();
globalThis.document={createElementNS(){return {addEventListener(){},removeEventListener(){},set src(value){}};}};
globalThis.window={URL:globalThis.URL};
const folder='docs/qa/mode-controls-2026-10-27/archived-sources';
function filesIn(folder){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(item=>item.isDirectory()?filesIn(folder+'/'+item.name):[folder+'/'+item.name]);}
const files=['Falling.fbx','docs/qa/mixamo-combat/candidates/Jab Cross.fbx','docs/qa/mixamo-combat/candidates/Stylish Flip.fbx','docs/qa/mixamo-combat/candidates/Roundhouse Kick.fbx'],results=[];
for(const file of files){
  const raw=fs.readFileSync(file);let source,takes;
  if(file.endsWith('.glb')){const length=raw.readUInt32LE(12),json=JSON.parse(raw.subarray(20,20+length));
    json.buffers[0].uri=`data:application/octet-stream;base64,${raw.subarray(28+length).toString('base64')}`;
    delete json.images;delete json.textures;json.materials=[];json.meshes?.forEach(mesh=>mesh.primitives.forEach(part=>delete part.material));
    const gltf=await new GLTFLoader().parseAsync(JSON.stringify(json),'');source=gltf.scene;takes=gltf.animations;
  }else {source=new FBXLoader().parse(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');takes=source.animations;}
  if(!takes.length){results.push({file,status:'NOT_APPLICABLE',reason:'No animation takes',duration:0,tracks:0});continue;}
  for(const take of takes){
    const usedBy=MOTIONS.filter(item=>'public'+item.url===file && (!item.take || item.take===take.name)).map(item=>item.key);
    if(!(take.duration>0&&take.tracks.length)){results.push({file,take:take.name,status:'EMPTY',duration:take.duration,tracks:take.tracks.length});continue;}
    const target=clone(template);let mixer;
    try{const clip=file==='public/models/shadow-pulse-rig.glb'?take.clone():retargetMotion(target,source,take),bones=[];target.traverse(node=>{if(node.isBone)bones.push(node);});
      const lengths=bones.map(b=>b.position.length());mixer=new THREE.AnimationMixer(target);const action=mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
      assert(clip.tracks.every(track=>track.values.every(Number.isFinite)&&track.times.every(Number.isFinite)));
      if(file!=='public/models/shadow-pulse-rig.glb')assert(clip.userData.matchedBones>=50,'Incomplete bone mapping');
      const frames=Math.ceil(clip.duration*60);let minHip=Infinity,maxHip=-Infinity;
      for(let frame=0;frame<=frames;frame++){action.time=Math.min(clip.duration-1e-6,clip.duration*frame/frames);mixer.update(0);target.updateMatrixWorld(true);
        for(const [i,bone] of bones.entries()){assert(bone.position.toArray().every(Number.isFinite));assert(Math.abs(bone.quaternion.length()-1)<1e-4);if(boneId(bone.name)!=='hips')assert(Math.abs(bone.position.length()-lengths[i])<1e-4);}
        const hips=bones.find(b=>boneId(b.name)==='hips').getWorldPosition(new THREE.Vector3());minHip=Math.min(minHip,hips.y);maxHip=Math.max(maxHip,hips.y);
      }
      results.push({file,take:take.name,status:'PASS',usedBy,archived:usedBy.length===0&&file!=='public/models/shadow-pulse-rig.glb',duration:clip.duration,frames:frames+1,bones:bones.length,hipRange:[minHip,maxHip]});
      console.log(`PASS ${file}: ${take.name} / ${frames+1} source frames / ${usedBy.length?'runtime '+usedBy.join(','):'preserved source or embedded fallback'}`);
    }catch(error){results.push({file,take:take.name,status:'FAIL',error:error.message});console.error(`FAIL ${file}: ${take.name}: ${error.message}`);}
    finally{mixer?.stopAllAction();mixer?.uncacheRoot(target);target.traverse(node=>node.skeleton?.dispose());}
  }
}
const summary={files:files.length,animatedTakes:results.filter(r=>!['EMPTY','NOT_APPLICABLE'].includes(r.status)).length,emptyTakes:results.filter(r=>r.status==='EMPTY').length,frames:results.reduce((n,r)=>n+(r.frames||0),0),results};
fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(folder+'/source-coverage.json',JSON.stringify(summary,null,2)+'\n');
console.log(`Source review: ${summary.files} files / ${summary.animatedTakes} animated takes / ${summary.frames} frames / ${results.filter(r=>r.status==='FAIL').length} failures.`);
if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
