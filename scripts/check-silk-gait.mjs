import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {loadMotionRig,joint,point,disposeRig} from './lib/motion-rig.mjs';
import {boneId} from '../src/MotionRetarget.js';
import {createWebStrand,updateWebStrand} from '../src/WebStrand.js';
const folder='docs/qa/silk-gait-2026-10-15';fs.mkdirSync(folder,{recursive:true});
const {actor}=await loadMotionRig(),results=[];
function check(name,fn){try{const detail=fn();results.push({name,status:'PASS',detail});console.log('PASS',name);}catch(e){results.push({name,status:'FAIL',error:e.message});console.error('FAIL',name,e.message);}}
function bootVertices(c){
 const feet={left:[],right:[]};c.model.traverse(mesh=>{
  if(!mesh.isSkinnedMesh)return;const w=mesh.geometry.attributes.skinWeight,j=mesh.geometry.attributes.skinIndex;
  for(const side of ['left','right']){const selected=mesh.skeleton.bones.map(b=>[side+'foot',side+'toebase'].some(id=>boneId(b.name).startsWith(id)));
   for(let v=0;v<w.count;v++){let weight=0;for(let k=0;k<4;k++)if(selected[j.getComponent(v,k)])weight+=w.getComponent(v,k);if(weight>.5)feet[side].push({mesh,vertex:v});}
  }
 });return feet;
}
for(const fps of [24,30,60,144])for(const [key,speed] of [['walk',1.6],['regularRun',4.8],['run',6.5]])for(const [gx,gz] of [[0,0],[0,.3],[0,-.3],[.3,0],[.4,.2]])check(`${fps}fps ${key}: slope ${gx}/${gz}, ankle continuity and toe clearance`,()=>{
 const c=actor(),normal=new THREE.Vector3(-gx,1,-gz).normalize(),last={},vertices=bootVertices(c);
 c.surfaceProbe=p=>({height:gx*p.x+gz*p.z,normal});
 let minToe=Infinity,maxTurn=0,frames=0,minKnee=180,maxKnee=0,minSole=Infinity,maxContactGap=0;
 const rest=Object.values(c.bones).filter(b=>b.parent?.isBone).map(b=>[b,b.position.length()]);
 try{
 for(let i=0;i<fps*3;i++){
  c.group.position.z+=speed/fps;c.group.position.y=.1+gz*c.group.position.z;
  c.update(1/fps,key==='run'?'SPRINTING':'RUNNING',new THREE.Vector3(0,gz*speed,speed));
  assert.equal(c.activeAction,c.actions[key],'Wrong gait was exercised');
  for(const [b,length] of rest){assert(Math.abs(b.position.length()-length)<1e-6,'IK stretched a bone');assert(Math.abs(b.quaternion.length()-1)<1e-4);}
  for(const side of ['left','right']){
   const foot=joint(c,side+'foot'),q=foot.quaternion.clone(),ankle=point(c,side+'foot'),toe=point(c,side+'toebase');
   minToe=Math.min(minToe,toe.y-gx*toe.x-gz*toe.z);
   let sole=Infinity;for(const {mesh,vertex} of vertices[side]){const p=mesh.localToWorld(mesh.applyBoneTransform(vertex,new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,vertex)));sole=Math.min(sole,p.y-gx*p.x-gz*p.z);}minSole=Math.min(minSole,sole);
   if(c.movingPlants?.[side]?.age>.1)maxContactGap=Math.max(maxContactGap,sole);
   if(last[side] && i>fps/3)maxTurn=Math.max(maxTurn,q.angleTo(last[side])*fps);last[side]=q;
   const hip=point(c,side+'upleg'),knee=point(c,side+'leg');
   const angle=THREE.MathUtils.radToDeg(hip.sub(knee).angleTo(ankle.sub(knee)));minKnee=Math.min(minKnee,angle);maxKnee=Math.max(maxKnee,angle);
  }frames++;
 }
 assert(minSole>=-.001,`Boot mesh crossed support plane: ${minSole}m`);
 assert(maxContactGap<.025,`Planted sole floats above support: ${maxContactGap}m`);
 assert(minToe>=.0005,`Toe marker crossed support plane: ${minToe}m`);
 // Measure ankle articulation relative to the shin; world rotation also
 // includes the leg's legitimate swing and the whole body's heading.
 assert(maxTurn<=THREE.MathUtils.degToRad(240)+.001,`Ankle contact snapped: ${THREE.MathUtils.radToDeg(maxTurn)}deg/s`);
 assert(maxKnee<179.9,'Knee locked into a straight singularity');
 c.surfaceProbe=()=>null;c.update(1/fps,'RUNNING',new THREE.Vector3(0,0,speed));assert(!Object.keys(c.movingPlants).length,'Unsupported ledge retained a plant');
 c.update(1/fps,'JUMPING',new THREE.Vector3(0,10,0));assert.equal(c.groundFootRotations,null,'Ground ankle constraint survived takeoff');
 return {frames,minToeClearance:minToe,minBootMeshClearance:minSole,maxPlantedSoleGap:maxContactGap,bootVertices:vertices.left.length+vertices.right.length,maxAnkleDegreesPerSecond:THREE.MathUtils.radToDeg(maxTurn),minKneeAngle:minKnee,maxKneeAngle:maxKnee};
 }finally{disposeRig(c);}
});
for(const fps of [24,30,60,144])check(`${fps}fps walk/jog/run/sprint, stop, turn and jump sequence`,()=>{
 const c=actor();let frames=0;
 try{for(const [state,speed,yaw] of [['IDLE',0,0],['RUNNING',1.6,0],['RUNNING',3.4,.4],['RUNNING',4.8,.8],['SPRINTING',6.5,1.2],['IDLE',0,1.2],['TURNING',0,2.4],['JUMPING',0,2.4],['FALLING',0,2.4],['LANDING',0,2.4],['IDLE',0,2.4]]){
  c.targetFacingAngle=yaw;c.pendingTurn='left';
  for(let i=0;i<fps;i++){c.group.position.add(new THREE.Vector3(Math.sin(yaw)*speed/fps,0,Math.cos(yaw)*speed/fps));
   const v=new THREE.Vector3(Math.sin(yaw)*speed,state==='FALLING'?-14:state==='JUMPING'?10:0,Math.cos(yaw)*speed);
   c.group.position.y=['JUMPING','FALLING'].includes(state)?3:.1;c.update(1/fps,state,v);
   for(const b of Object.values(c.bones))assert(b.quaternion.toArray().every(Number.isFinite)&&Math.abs(b.quaternion.length()-1)<1e-4);frames++;
  }
 }return {frames};}finally{disposeRig(c);}
});
for(const fps of [24,30,60,144])check(`${fps}fps roof handoff preserves ankle orientation and final boot clearance`,()=>{
 const c=actor();try{
  for(let i=0;i<fps;i++)c.update(1/fps,'IDLE',new THREE.Vector3());
  const before=Object.fromEntries(['left','right'].map(side=>[side,joint(c,side+'foot').quaternion.clone()]));
  c.lastState='MANTLING';c.mantleExitFeet=Object.fromEntries(['left','right'].map(side=>[side,point(c,side+'foot').add(new THREE.Vector3(0,-.3,-.3))]));
  const vertices=bootVertices(c);let minSole=Infinity,maxAngle=0;
  for(let i=0;i<Math.ceil(fps*.4);i++){
   c.update(1/fps,'IDLE',new THREE.Vector3());
   for(const side of ['left','right']){
    const q=joint(c,side+'foot').quaternion.clone();maxAngle=Math.max(maxAngle,q.angleTo(before[side]));before[side]=q;
    for(const {mesh,vertex} of vertices[side]){const p=mesh.localToWorld(mesh.applyBoneTransform(vertex,new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,vertex)));minSole=Math.min(minSole,p.y);}
   }
  }
  assert(maxAngle*fps<=THREE.MathUtils.degToRad(240)+.001,'Final mantle foot IK bypassed the ankle rate limit');assert(minSole>=-.001,'Roof handoff bypassed boot clearance');return {minBootMeshClearance:minSole,maxAnkleDegrees:THREE.MathUtils.radToDeg(maxAngle)};
 }finally{disposeRig(c);}
});
check('Silk geometry: tapered ends, exposed fibers, tangent normals and reusable buffers',()=>{
 const {line,mesh}=createWebStrand(new THREE.Scene()),wrist=new THREE.Vector3(),anchor=new THREE.Vector3(0,5,20);
 const geometry=mesh.geometry,positions=geometry.attributes.position.array,fiberPositions=line.geometry.attributes.position.array;
 const ring=i=>{const center=new THREE.Vector3();for(let j=0;j<6;j++)center.add(new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,i*6+j));return center.divideScalar(6);};
 const radius=i=>new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,i*6).distanceTo(ring(i));
 updateWebStrand(line,mesh,wrist,anchor,1,1);
 assert(radius(0)<radius(20)*.7 && radius(40)<radius(20)*.7,'Silk ends have no taper');
 for(let i=1;i<39;i++){
  const tangent=ring(i+1).sub(ring(i-1)).normalize();
  for(let j=0;j<6;j++){const n=new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal,i*6+j);assert(Math.abs(n.length()-1)<1e-5);assert(Math.abs(n.dot(tangent))<1e-5,'Tube normal ignores curve tangent');}
  const filament=new THREE.Vector3().fromBufferAttribute(line.geometry.attributes.position,i*6);
  assert(filament.distanceTo(ring(i))>radius(i),'Filaments are buried inside the core');
 }
 for(let i=0;i<60;i++)updateWebStrand(line,mesh,wrist,anchor,i/60,.5+i/120);
 assert.equal(mesh.geometry,geometry);assert.equal(geometry.attributes.position.array,positions);assert.equal(line.geometry.attributes.position.array,fiberPositions);
 return {tubeVertices:geometry.attributes.position.count,fiberVertices:line.geometry.attributes.position.count};
});
check('Silk frame remains continuous when a swinging anchor crosses vertical',()=>{
 const {line,mesh}=createWebStrand(new THREE.Scene());let previous=null,maxAngle=0;
 for(let i=0;i<=200;i++){const theta=-.4+i*.004;updateWebStrand(line,mesh,new THREE.Vector3(),new THREE.Vector3(0,Math.cos(theta)*20,Math.sin(theta)*20),i/60,1);const side=mesh.userData.webSide;if(previous)maxAngle=Math.max(maxAngle,side.angleTo(previous));previous=side.clone();}
 assert(maxAngle<.01,'Braid flips when the vertical reference axis changes');return {maxFrameDegrees:THREE.MathUtils.radToDeg(maxAngle)};
});
check('Slack silk sags, a taut strand settles, missed shots fade without a ghost attachment',()=>{
 const {line,mesh}=createWebStrand(new THREE.Scene()),wrist=new THREE.Vector3(0,2,0),anchor=new THREE.Vector3(0,2,20);
 const center=()=>new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,20*6).add(new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,20*6+3)).multiplyScalar(.5);
 updateWebStrand(line,mesh,wrist,anchor,0,1,{tension:1});const taut=center();updateWebStrand(line,mesh,wrist,anchor,0,1,{tension:0});const slack=center();assert(slack.y<taut.y-.2,'Slack and taut silk look identical');
 const c=actor();try{c.fireWebMiss(anchor,'left');for(let i=0;i<30;i++)c.update(1/60,'IDLE',new THREE.Vector3());assert(c.webMeshOffhand.visible);assert(c.webMeshOffhand.material.opacity<.3,'Miss does not fade');assert.equal(c.webAttachments.length,0);for(let i=0;i<20;i++)c.update(1/60,'IDLE',new THREE.Vector3());assert(!c.webMeshOffhand.visible);c.fireWeb(anchor,'left');assert.equal(c.webMeshOffhand.material.opacity,1,'Previous miss dimmed a new attachment');}finally{disposeRig(c);}
 return {tautSag:2-taut.y,slackSag:2-slack.y};
});
const failed=results.filter(r=>r.status==='FAIL').length;
fs.writeFileSync(folder+'/results.json',JSON.stringify({results,passed:results.length-failed,failed},null,2)+'\n');
console.log(`Silk/gait: ${results.length-failed} passed, ${failed} failed.`);if(failed)process.exitCode=1;
