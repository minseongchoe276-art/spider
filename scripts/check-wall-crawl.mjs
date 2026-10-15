import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {loadMotionRig,joint,point,disposeRig} from './lib/motion-rig.mjs';
import {boneId} from '../src/MotionRetarget.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {City} from '../src/City.js';
const folder='docs/qa/wall-crawl-views-2026-10-15';fs.mkdirSync(folder,{recursive:true});
const {actor}=await loadMotionRig(),results=[];
function check(name,fn){try{const detail=fn();results.push({name,status:'PASS',detail});console.log('PASS',name);}catch(error){results.push({name,status:'FAIL',error:error.message});console.error('FAIL',name,error.message);}}
const palm=(bones,side)=>{const find=id=>Object.values(bones).find(b=>boneId(b.name)===id).getWorldPosition(new THREE.Vector3()),w=find(side+'hand');return new THREE.Vector3().crossVectors(find(side+'handindex1').sub(w),find(side+'handpinky1').sub(w)).normalize().multiplyScalar(side==='left'?1:-1);};
const extended=(bones,side,finger)=>{const p=[1,2,3,4].map(k=>Object.values(bones).find(b=>boneId(b.name)===side+'hand'+finger+k).getWorldPosition(new THREE.Vector3()));return p[0].distanceTo(p[3])/(p[0].distanceTo(p[1])+p[1].distanceTo(p[2])+p[2].distanceTo(p[3]));};
for(const fps of [24,30,60,144])for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(const [profile,vertical,lateral]of [['climb',2.8,0],['sprint',4.2,0],['diagonal',2.8,2.4]])for(const first of [false,true])check(`${fps}fps ${profile} / facade ${Math.round(angle*180/Math.PI)} / ${first?'first':'third'}`,()=>{
 const c=actor(),normal=new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0),angle),sideways=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),normal),v=sideways.clone().multiplyScalar(lateral).setY(vertical);
 c.wallNormal=normal;c.wallDistance=.7;c.group.position.copy(normal).multiplyScalar(.7).setY(4);c.groundProbe=()=>null;
 const camera=new THREE.PerspectiveCamera(64,1,.01,200);c.scene.add(camera);if(first){c.setFirstPersonCamera(camera);c.setFirstPersonMode(true);}
 const previous={},contacts={lefthand:0,righthand:0,leftfoot:0,rightfoot:0};let maxSlip=0,maxError=0,minPalm=1,minSole=1,maxViewTravel=0,lastView=null;
 try{for(let frame=0;frame<fps*3;frame++){
  c.group.position.addScaledVector(v,1/fps);camera.position.copy(c.group.position).add(new THREE.Vector3(0,1.58,0));camera.lookAt(camera.position.clone().sub(normal));camera.updateMatrixWorld(true);
  c.update(1/fps,'WALL_RUNNING',v);c.group.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  for(const b of Object.values(c.bones))assert(Math.abs(b.quaternion.length()-1)<1e-5,'Joint normalization');
  for(const id of ['lefthand','righthand','leftfoot','rightfoot']){
   const contact=c.wallContacts?.[id],actual=point(c,id);
   if(contact?.stance && contact.age>.08){contacts[id]++;maxError=Math.max(maxError,actual.distanceTo(contact.position));const prev=previous[id];if(prev?.anchor===contact.position)maxSlip=Math.max(maxSlip,actual.distanceTo(prev.actual));previous[id]={anchor:contact.position,actual};}else delete previous[id];
  }
  if(frame>fps*.5){for(const side of ['left','right']){
   if(c.wallContacts?.[side+'hand']?.stance && c.wallContacts[side+'hand'].age>.08)minPalm=Math.min(minPalm,palm(c.bones,side).dot(normal.clone().negate()));
   const neutral=c.wallSoleRotations[side],foot=joint(c,side+'foot').getWorldQuaternion(new THREE.Quaternion()),sole=new THREE.Vector3(0,1,0).applyQuaternion(foot.multiply(neutral.clone().invert()));if(c.wallContacts?.[side+'foot']?.stance && c.wallContacts[side+'foot'].age>.08)minSole=Math.min(minSole,sole.dot(normal));
   for(const finger of ['index','middle','ring','pinky'])assert(extended(c.bones,side,finger)>.96,'Climbing hand clenched into a fist');
  }}
  if(first){const positions=c.firstPersonHands.map(hand=>hand.getWorldPosition(new THREE.Vector3()).applyMatrix4(camera.matrixWorldInverse));if(lastView)maxViewTravel=Math.max(maxViewTravel,...positions.map((p,i)=>p.distanceTo(lastView[i])));lastView=positions;
   for(const p of positions)assert(p.toArray().every(Number.isFinite)&&p.length()<1.2,'View hand escaped the camera');
   if(frame>fps*.5)for(const [i,side]of ['left','right'].entries()){
    const height=point(c,side+'hand').y-c.group.getWorldPosition(new THREE.Vector3()).y,expected=THREE.MathUtils.clamp((height-1.6)*.4,-.1,.2);
    assert(Math.abs(positions[i].y-expected)<.002,'First-person hand height diverges from the actual climbing hand');
   }
  }
 }
 assert(Object.values(contacts).every(n=>n>2),'A limb never established support '+JSON.stringify(contacts));assert(maxError<.025,`Contact target error ${maxError}m`);assert(maxSlip<.025,`Planted limb slides ${maxSlip}m per frame`);for(const {bone,rest,limit} of c.jointConstraints)assert(rest.angleTo(bone.quaternion)<=limit+1e-5,'Contact inverted a joint');
 assert(minPalm>.98,`Palm detached from facade normal: ${minPalm}`);assert(minSole>.92,`Sole detached from facade normal: ${minSole}`);
 if(first){assert(maxViewTravel>.005,'First-person climbing arms remain static');assert(maxViewTravel<.15,'First-person arms jump between frames');}
 c.update(1/fps,'FALLING',new THREE.Vector3(0,-5,0));assert.equal(c.wallContacts,null);
 for(let i=0;i<fps;i++)c.update(1/fps,'IDLE',new THREE.Vector3());if(first)assert(c.firstPersonRig.children.every(arm=>Math.abs(arm.rotation.x)<1e-5),'Climbing view pose survived release');
 return {frames:fps*3,contacts,maxPlantDrift:maxError,maxFrameSlip:maxSlip,minPalmAlignment:minPalm,minSoleAlignment:minSole,maxViewFrameTravel:maxViewTravel};
 }finally{disposeRig(c);}
});
for(const fps of [24,30,60,144])check(`${fps}fps first/third silk uses the same taper, fibers, shot ownership and cleanup`,()=>{
 const c=actor(),camera=new THREE.PerspectiveCamera(64,1,.01,200);c.scene.add(camera);camera.position.set(0,1.75,0);camera.lookAt(0,1.75,-1);camera.updateMatrixWorld(true);c.setFirstPersonCamera(camera);
 const widths=[];try{for(const first of [false,true]){c.setFirstPersonMode(first);c.fireWeb(new THREE.Vector3(-2,10,-18),'left');c.fireWeb(new THREE.Vector3(3,12,-20),'right');for(let i=0;i<Math.ceil(.16*fps);i++)c.update(1/fps,'IDLE',new THREE.Vector3());
  for(const mesh of [c.webMesh,c.webMeshOffhand]){assert(mesh.visible);const p=mesh.geometry.attributes.position;const a=new THREE.Vector3().fromBufferAttribute(p,20*6),b=new THREE.Vector3().fromBufferAttribute(p,20*6+3);widths.push(a.distanceTo(b));assert.equal(mesh.material.opacity,1);}
  c.webAttachments=[];c.webShotTimer=0;c.webShotAnchor=null;c.persistentWebAnchor=null;c.webLaunchTimers={};c.update(1/fps,'IDLE',new THREE.Vector3());assert(!c.webMesh.visible&&!c.webMeshOffhand.visible,'Released rope remains in one camera mode');
 }
 assert(Math.abs(widths[0]-widths[2])<1e-5&&Math.abs(widths[1]-widths[3])<1e-5,'Camera mode changes silk style');return {coreDiameters:widths};}finally{disposeRig(c);}
});
check('Actual facade physics selects a crawl cadence and a separate held sprint',()=>{
 const c=actor(),city={colliders:[{minX:-15,maxX:15,minZ:-6,maxZ:0,minY:0,maxY:100}],buildingMeshes:[],raycast:City.prototype.raycast,checkCollision:City.prototype.checkCollision},p=new SwingPhysics(c.scene,city,c,new Proxy({},{get:()=>()=>{}}));try{p.position.set(0,5,.7);p.previousFixedPosition.copy(p.position);p.renderPosition.copy(p.position);p.wallNormal.set(0,0,1);p.state='WALL_RUNNING';for(let i=0;i<60;i++)p.update(1/60,{forward:true,wallRun:true,strafe:0},new THREE.PerspectiveCamera());assert.equal(p.velocity.y,2.8);assert(c.actions.wall.getEffectiveTimeScale()<4);p.update(1/60,{forward:true,wallRun:true,sprint:true,strafe:0},new THREE.PerspectiveCamera());assert.equal(p.velocity.y,4.2);return {crawl:2.8,sprint:4.2};}finally{disposeRig(c);}
});
const failed=results.filter(r=>r.status==='FAIL').length;fs.writeFileSync(folder+'/results.json',JSON.stringify({passed:results.length-failed,failed,results},null,2)+'\n');console.log(`Wall crawl/views: ${results.length-failed} passed, ${failed} failed.`);if(failed)process.exitCode=1;
