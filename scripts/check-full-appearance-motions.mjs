import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadMotionRig,disposeRig} from './lib/motion-rig.mjs';

async function geometry(path){
 const b=fs.readFileSync(path),length=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+length));
 j.buffers[0].uri='data:application/octet-stream;base64,'+b.subarray(28+length).toString('base64');delete j.images;delete j.textures;j.materials=[];
 for(const m of j.meshes)for(const p of m.primitives)delete p.material;
 return (await new GLTFLoader().parseAsync(JSON.stringify(j),'')).scene.getObjectByProperty('isMesh',true).geometry;
}
const {actor,clips}=await loadMotionRig(),results=[];
for(const [mode,sourceName]of [['combat','변신모습'],['web','사람모습']]){
 const skin=await geometry(`public/models/appearance-${mode}.glb`),source=await geometry(`artifacts/${sourceName}.glb`);
 source.computeBoundingBox();const p=source.attributes.position,scale=2.0527/(source.boundingBox.max.y-source.boundingBox.min.y),index=source.index,edges=[];
 for(let i=0;i<(index?.count || p.count);i+=3)for(let k=0;k<3;k++){
  const a=index?index.getX(i+k):i+k,b=index?index.getX(i+(k+1)%3):i+(k+1)%3;
  edges.push([a,b,new T.Vector3().fromBufferAttribute(p,a).distanceTo(new T.Vector3().fromBufferAttribute(p,b))*scale]);
 }
 const c=actor(),mesh=c.model.getObjectByProperty('isSkinnedMesh',true);mesh.geometry=skin;
 const rest=Object.values(c.bones).map(b=>({b,p:b.position.clone(),q:b.quaternion.clone()}));
 try{for(const item of clips.filter(item=>!item.archived)){
  let maxEdgeGrowth=0,maxExtent=0,finite=true,worstPhase=0;
  c.stopAnimation();rest.forEach(({b,p,q})=>{b.position.copy(p);b.quaternion.copy(q);});c.fadeToAction(item.key,0);
  for(let sample=0;sample<=12;sample++){
   c.activeAction.enabled=true;c.activeAction.paused=false;c.activeAction.time=Math.min(item.clip.duration-1e-6,item.clip.duration*sample/12);
   c.mixer.update(0);c.group.updateMatrixWorld(true);mesh.skeleton.update();
   const posed=Array.from({length:skin.attributes.position.count},(_,i)=>mesh.applyBoneTransform(i,new T.Vector3().fromBufferAttribute(skin.attributes.position,i)).applyMatrix4(mesh.matrixWorld));
   finite &&=posed.every(v=>v.toArray().every(Number.isFinite));maxExtent=Math.max(maxExtent,new T.Box3().setFromPoints(posed).getSize(new T.Vector3()).length());
   for(const [a,b,length]of edges){const growth=posed[a].distanceTo(posed[b])-length;if(growth>maxEdgeGrowth){maxEdgeGrowth=growth;worstPhase=sample/12;}}
  }
  const pass=finite && maxExtent<5.5 && maxEdgeGrowth<.16;
  results.push({mode,key:item.key,samples:13,finite,maxExtent,maxEdgeGrowth,worstPhase,pass});
  console.log(`${pass?'PASS':'FAIL'} ${mode}/${item.key}: max edge growth ${(maxEdgeGrowth*100).toFixed(1)}cm`);
 }}finally{disposeRig(c);}
}
const failed=results.filter(r=>!r.pass),folder='docs/qa/complete-motion-2026-10-19';fs.mkdirSync(folder,{recursive:true});
fs.writeFileSync(folder+'/appearance-motion-results.json',JSON.stringify({cases:results.length,failed:failed.length,results},null,2)+'\n');
console.log(`Full appearance motion matrix: ${results.length-failed.length}/${results.length} passed, ${results.length*13} complete-skin poses`);
if(failed.length)process.exitCode=1;
