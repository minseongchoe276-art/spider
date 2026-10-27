import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadMotionRig,point,disposeRig} from './lib/motion-rig.mjs';

async function geometry(path){
 const b=fs.readFileSync(path),length=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+length));
 j.buffers[0].uri='data:application/octet-stream;base64,'+b.subarray(28+length).toString('base64');
 delete j.images;delete j.textures;j.materials=[];for(const m of j.meshes)for(const p of m.primitives)delete p.material;
 return (await new GLTFLoader().parseAsync(JSON.stringify(j),'')).scene.getObjectByProperty('isMesh',true).geometry;
}
const {actor}=await loadMotionRig();
const skin=await geometry(process.argv[2] || 'public/models/appearance-web.glb');
const source=await geometry('artifacts/사람모습.glb');source.computeBoundingBox();
const scale=2.0527/(source.boundingBox.max.y-source.boundingBox.min.y),positions=source.attributes.position;
const index=source.index,edges=[];
for(let i=0;i<(index?.count || positions.count);i+=3)for(let k=0;k<3;k++){
 const a=index?index.getX(i+k):i+k,b=index?index.getX(i+(k+1)%3):i+(k+1)%3;
 const p=new T.Vector3().fromBufferAttribute(positions,a),q=new T.Vector3().fromBufferAttribute(positions,b);
 edges.push({a,b,length:p.distanceTo(q)*scale});
}
const results=[];
for(const speed of [4.4,6.5])for(const key of ['jab','cross','heavy','guard'])for(const yaw of [0,Math.PI/2,-Math.PI*.75]){
 const c=actor(),mesh=c.model.getObjectByProperty('isSkinnedMesh',true);mesh.geometry=skin;c.combatStance=true;
 const actualSpeed=speed*(key==='guard'?.35:1),state=actualSpeed>5?'SPRINTING':'RUNNING',velocity=new T.Vector3(Math.sin(yaw)*actualSpeed,0,Math.cos(yaw)*actualSpeed),dt=1/60;
 const update=()=>{c.group.position.addScaledVector(velocity,dt);c.update(dt,state,velocity);};
 let maxWristBend=0,maxEdgeGrowth=0,worstEdge;
 try{
  for(let i=0;i<40;i++){c.combatAction={key:'combatIdle'};update();}
  const duration={jab:.72,cross:.82,heavy:1.05,guard:1.2}[key];
  for(let i=0;i<=Math.ceil(duration/dt);i++){
   c.combatAction=key==='guard'?{key}:{id:1,key,time:i*dt,duration,travel:true};update();
   for(const side of ['left','right']){
    const forearm=point(c,side+'hand').sub(point(c,side+'forearm'));
    const palm=point(c,side+'handmiddle1').sub(point(c,side+'hand'));
    maxWristBend=Math.max(maxWristBend,forearm.angleTo(palm)*180/Math.PI);
   }
   if(i%10===0){
    c.group.updateMatrixWorld(true);mesh.skeleton.update();
    const posed=Array.from({length:positions.count},(_,vertex)=>mesh.applyBoneTransform(vertex,new T.Vector3().fromBufferAttribute(skin.attributes.position,vertex)).applyMatrix4(mesh.matrixWorld));
    for(const {a,b,length} of edges){const growth=posed[a].distanceTo(posed[b])-length;if(growth>maxEdgeGrowth){maxEdgeGrowth=growth;worstEdge={a,b,sourceA:new T.Vector3().fromBufferAttribute(positions,a).toArray(),sourceB:new T.Vector3().fromBufferAttribute(positions,b).toArray(),phase:i*dt/duration};}}
   }
  }
  results.push({speed,actualSpeed,yaw,key,maxWristBend,maxEdgeGrowth});
  assert(maxWristBend<12.1,`${key}: wrist folded ${maxWristBend.toFixed(1)} degrees`);
  assert(maxEdgeGrowth<.16,`${key}: a mesh edge stretched by ${maxEdgeGrowth.toFixed(3)}m ${JSON.stringify(worstEdge)}`);
 }finally{disposeRig(c);}
}
fs.mkdirSync('docs/qa/moving-actions-2026-10-27',{recursive:true});
fs.writeFileSync('docs/qa/moving-actions-2026-10-27/actual-skin.json',JSON.stringify(results,null,2)+'\n');
console.log('PASS actual combat appearance: straight wrists and bounded skin triangles while running/sprinting',JSON.stringify(results));
