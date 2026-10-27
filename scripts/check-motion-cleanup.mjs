import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadMotionRig,point,disposeRig} from './lib/motion-rig.mjs';
import {createJointConstraints} from '../src/JointConstraints.js';
import {MOTIONS} from '../src/MotionCatalog.js';
import {AIR_TRICKS,selectAirTrick} from '../src/AirTricks.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {City} from '../src/City.js';
import {sanitizePose} from '../src/RemoteMotion.js';
const folder='docs/qa/motion-cleanup-2026-10-15';fs.mkdirSync(folder,{recursive:true});
const {actor,clips}=await loadMotionRig(),results=[];
function check(name,run){try{results.push({name,status:'PASS',detail:run()});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',error:error.message});console.error('FAIL',name,error.message);}}
const removed=['hit','dodgeBack','dodgeLeft','dodgeRight','dodgeForward','femaleStop','jog'];
check('Requested motions are absent from catalog, generated assets and loaded actors',()=>{
 const c=actor();try{for(const key of removed){assert(!MOTIONS.some(m=>m.key===key));assert(!fs.existsSync(`public/motions/${key}.json`));assert(!c.actions[key]);}
 assert.equal(c.actions.cross.getClip().userData.source,'/models/Jab Cross.fbx');
 assert.equal(c.actions.cross.getClip().userData.authoredMixamo,true);
 assert.equal(c.actions.backTrick.getClip().userData.source,'/models/Stylish Flip.fbx');
 assert.deepEqual(Object.keys(AIR_TRICKS),['front','back']);
 for(const key of ['left','right','spin','cork']){assert(!c.triggerAirTrick(key));assert.equal(sanitizePose({state:'FALLING',velocity:{x:0,y:-2,z:0},tricking:true,airTrick:{key,elapsed:0}}).airTrick,null);}
 assert.equal(selectAirTrick({sprint:true,left:true}),'front');return {removed,retainedAirTricks:Object.keys(AIR_TRICKS)};}finally{disposeRig(c);}
});
check('Every retained compiled motion respects ankle, wrist and toe limits between keyframes',()=>{
 const c=actor(),rig=createJointConstraints(c.model,c.bones);let frames=0,max={};try{
 for(const item of clips.filter(c=>!c.archived&&c.key!=='default')){
 c.stopAnimation();c.fadeToAction(item.key,0);const clip=item.clip;
 for(let frame=0;frame<=Math.ceil(clip.duration*60);frame++){
 c.activeAction.enabled=true;c.activeAction.paused=false;c.activeAction.time=Math.min(frame/60,clip.duration-1e-6);c.mixer.update(0);
 for(const {bone,kind,rest,limit} of rig){const angle=rest.angleTo(bone.quaternion);assert(angle<=limit+1e-5,`${item.key} ${bone.name}: ${angle*180/Math.PI} degrees`);max[kind]=Math.max(max[kind]||0,angle*180/Math.PI);}frames++;
 }}return {frames,maxDegrees:max};}finally{disposeRig(c);}
});
function measure(c,stats){
 for(const {bone,kind,rest,limit} of c.jointConstraints){const angle=rest.angleTo(bone.quaternion);assert(angle<=limit+1e-5,`${c.poseState} ${bone.name}: ${angle*180/Math.PI} degrees`);assert(Math.abs(bone.quaternion.length()-1)<1e-5);stats[kind]=Math.max(stats[kind]||0,angle*180/Math.PI);}
}
for(const fps of [24,30,60,144]){
 check(`${fps}fps walk, run, sprint, stop, slope and all retained combat poses`,()=>{
 const c=actor(),max={};let frames=0;try{for(const slope of [0,.3,-.3]){
 c.surfaceProbe=p=>({height:p.z*slope,normal:new THREE.Vector3(0,1,-slope).normalize()});
 for(const speed of [1.6,3.4,4.8,6.5,0])for(let i=0;i<fps/2;i++){
 const v=new THREE.Vector3(0,0,speed);c.group.position.addScaledVector(v,1/fps);c.group.position.y=c.group.position.z*slope+.1;
 c.update(1/fps,speed===0?'IDLE':speed>5?'SPRINTING':'RUNNING',v);measure(c,max);assert(!removed.includes(c.activeAction.getClip().name));frames++;
 }}
 c.surfaceProbe=()=>({height:0,normal:new THREE.Vector3(0,1,0)});c.group.position.set(0,.1,0);
 for(const key of ['combatIdle','jab','cross','hook','heavy','guard','slamLand','special','hitHead',...removed.filter(k=>/cross|hit|dodge/.test(k))])for(let i=0;i<fps/2;i++){
 c.combatAction={id:key,key,time:2*i/fps,duration:1};c.update(1/fps,'IDLE',new THREE.Vector3());measure(c,max);assert(!removed.includes(c.activeAction.getClip().name));frames++;
 }return {frames,maxDegrees:max};}finally{disposeRig(c);}
 });
 for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5])check(`${fps}fps climb, diagonal and sprint on facade ${Math.round(yaw*180/Math.PI)}`,()=>{
 const c=actor(),normal=new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0),yaw),max={};c.wallNormal=normal;c.groundProbe=()=>null;c.group.position.copy(normal).multiplyScalar(.7).setY(4);let frames=0;
 try{for(const [up,side] of [[2.8,0],[2.8,2.4],[4.2,0]])for(let i=0;i<fps;i++){
 const v=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),normal).multiplyScalar(side).setY(up);c.group.position.addScaledVector(v,1/fps);c.update(1/fps,'WALL_RUNNING',v);measure(c,max);frames++;
 }return {frames,maxDegrees:max};}finally{disposeRig(c);}
 });
 check(`${fps}fps actual wall → parapet → roof: joint bounds, grip, clearance and continuity`,()=>{
 const c=actor(),roof={minX:-5,maxX:5,minY:0,maxY:10,minZ:-12,maxZ:0},lip={...roof,minY:10,maxY:11.2,minZ:-.8};
 const city={colliders:[roof,lip],buildingMeshes:[],raycast:City.prototype.raycast,checkCollision:City.prototype.checkCollision};
 const p=new SwingPhysics(c.scene,city,c,new Proxy({},{get:()=>()=>{}}));p.position.set(0,7,.7);p.previousFixedPosition.copy(p.position);p.renderPosition.copy(p.position);p.wallNormal.set(0,0,1);c.wallNormal=p.wallNormal;p.state='WALL_RUNNING';
 let mantle=false,landed=false,maxGrip=0,maxStep=0,previous=null;const max={};
 try{for(let frame=0;frame<fps*5;frame++){
 p.update(1/fps,{forward:true,wallRun:true,strafe:0},new THREE.PerspectiveCamera());measure(c,max);
 const points=['head','lefthand','righthand','leftfoot','rightfoot'].map(id=>point(c,id));
 if(previous&&frame>fps*.3)maxStep=Math.max(maxStep,...points.map((v,i)=>v.distanceTo(previous[i])));previous=points;
 if(p.state==='MANTLING'){mantle=true;const t=p.mantle.elapsed/p.mantle.duration;
 if(t>.2&&t<.42)for(const side of ['left','right'])maxGrip=Math.max(maxGrip,point(c,side+'hand').distanceTo(c.mantleHandTargets[side]));
 for(const side of ['left','right']){const f=point(c,side+'foot');assert(!(f.x>lip.minX&&f.x<lip.maxX&&f.z>lip.minZ+.02&&f.z<lip.maxZ-.02&&f.y<lip.maxY+.03&&f.y>lip.minY),'Foot enters parapet');}
 }if(mantle&&['RUNNING','IDLE'].includes(p.state)){landed=true;break;}
 }assert(landed,'Never finished traversal');assert(maxGrip<.06,`Grip detached ${maxGrip}m`);assert(maxStep*fps<15,`Extremity jumped at ${maxStep*fps}m/s`);return {maxDegrees:max,maxGripError:maxGrip,maxExtremitySpeed:maxStep*fps,landed};}finally{disposeRig(c);}
 });
}
const failed=results.filter(r=>r.status==='FAIL').length;
fs.writeFileSync(folder+'/results.json',JSON.stringify({passed:results.length-failed,failed,results},null,2)+'\n');
console.log(`Motion cleanup: ${results.length-failed} passed, ${failed} failed`);if(failed)process.exitCode=1;
