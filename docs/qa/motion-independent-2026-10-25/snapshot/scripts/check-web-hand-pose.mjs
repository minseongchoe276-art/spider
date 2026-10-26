import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {loadMotionRig,disposeRig,joint} from './lib/motion-rig.mjs';
import {boneId} from '../src/MotionRetarget.js';
import {Character} from '../src/Character.js';
import {RemoteMotion,capturePose,sanitizePose} from '../src/RemoteMotion.js';

const folder='docs/qa/web-hand-pose-2026-10-15';fs.mkdirSync(folder,{recursive:true});
const {actor}=await loadMotionRig(),results=[],fpsList=[24,30,60,144],target=new THREE.Vector3(-2,5,-10);
function check(name,run){try{const detail=run();results.push({name,status:'PASS',detail});console.log('PASS '+name);}catch(error){results.push({name,status:'FAIL',error:error.message});console.error('FAIL '+name+': '+error.message);}}
const find=(bones,id)=>Object.values(bones).find(b=>boneId(b.name)===id);
const angle=(a,b)=>a.clone().normalize().angleTo(b.clone().normalize());
function extension(bones,side,finger){const p=[1,2,3,4].map(i=>find(bones,side+'hand'+finger+i)?.getWorldPosition(new THREE.Vector3()));assert(p.every(Boolean),'Missing articulated digit');
  return p[0].distanceTo(p[3])/p.slice(1).reduce((sum,v,i)=>sum+v.distanceTo(p[i]),0);}
function thwip(bones,side){const ratios=Object.fromEntries(['thumb','index','middle','ring','pinky'].map(f=>[f,extension(bones,side,f)]));
  assert(ratios.index>.97 && ratios.pinky>.97,'Index/little finger did not extend');assert(ratios.middle<.62 && ratios.ring<.62,'Middle/ring finger did not fold');assert(ratios.thumb>.9,'Thumb folded into a fist');return ratios;}
function tick(c,fps,seconds,state='IDLE'){for(let i=0;i<Math.ceil(seconds*fps);i++)c.update(1/fps,state,new THREE.Vector3(),c.persistentWebAnchor);c.group.updateMatrixWorld(true);}
function release(c){c.webAttachments=[];c.webLaunchTimers={};c.webShotTimer=0;c.webShotAnchor=null;c.persistentWebAnchor=null;}
function valid(c){for(const b of Object.values(c.bones)){assert(b.quaternion.toArray().every(Number.isFinite));assert(Math.abs(b.quaternion.length()-1)<1e-4);}}
function handBounds(arm){const box=new THREE.Box3();arm.userData.hand.object.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();
  // The viewmodel includes the continuous forearm now. Keep measuring the
  // hand's anatomical size, rather than weakening its original size bound.
  const handBones=mesh.skeleton.bones.map(b=>boneId(b.name).startsWith(arm.userData.side+'hand'));
  const joints=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
  for(const i of new Set(mesh.geometry.index.array)){let weight=0;for(let k=0;k<4;k++)if(handBones[joints.getComponent(i,k)])weight+=weights.getComponent(i,k);
    if(weight>.35)box.expandByPoint(mesh.applyBoneTransform(i,new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i)).applyMatrix4(mesh.matrixWorld));}});return box;}

for(const fps of fpsList)for(const side of ['left','right']){
  check(`${fps}fps ${side}: anatomical third-person shooting, held grip and clean release`,()=>{const c=actor(),control=actor();try{
    c.fireWeb(target,side);tick(c,fps,.16);const firing=thwip(c.bones,side);valid(c);
    const wrist=joint(c,side+'hand'),direction=target.clone().sub(wrist.getWorldPosition(new THREE.Vector3())).normalize();
    const fingerDirection=new THREE.Vector3(0,1,0).applyQuaternion(wrist.getWorldQuaternion(new THREE.Quaternion()));
    assert(fingerDirection.dot(direction)<.9,'Fingers point along the strand instead of clearing its wrist exit');
    tick(c,fps,.7,'SWINGING');assert(extension(c.bones,side,'index')<.7,'Held strand kept an extended firing index');
    release(c);tick(c,fps,.7);tick(control,fps,1.56);c.stopAnimation();control.stopAnimation();c.fadeToAction('idle',0);control.fadeToAction('idle',0);tick(c,fps,.2);tick(control,fps,.2);
    assert((c.webGestures[side]?.shoot || 0)<1e-6);for(const [name,b] of Object.entries(c.bones))if(/hand/i.test(name))assert(angle(b.quaternion,control.bones[name].quaternion)<1e-4,'Released pose contaminated subsequent animation');
    return firing;
  }finally{disposeRig(c);disposeRig(control);}});
  check(`${fps}fps ${side}: a missed shot articulates, expires and never attaches`,()=>{const c=actor();try{
    c.fireWebMiss(target,side);tick(c,fps,.16);thwip(c.bones,side);assert.equal(c.webAttachments.length,0);tick(c,fps,1);assert.equal(c.webShotTimer,0);assert(c.webGestures[side].shoot<1e-6);assert(!c.webMesh.visible && !c.webMeshOffhand.visible);valid(c);
  }finally{disposeRig(c);}});
}
for(const fps of fpsList){
  check(`${fps}fps: both hands can shoot and release independently`,()=>{const c=actor();try{
    c.fireWeb(target,'left');c.fireWeb(target.clone().setX(2),'right');tick(c,fps,.16);thwip(c.bones,'left');thwip(c.bones,'right');
    c.webAttachments=c.webAttachments.filter(w=>w.hand==='right');delete c.webLaunchTimers.left;tick(c,fps,.7,'SWINGING');assert(c.webGestures.left.shoot<1e-6 && c.webGestures.left.grip===0);assert(c.webGestures.right.grip>.95);valid(c);
  }finally{disposeRig(c);}});
  check(`${fps}fps: web fingers cannot overwrite combat or wall contact fingers`,()=>{for(const state of ['WALL_RUNNING','MANTLING','IDLE']){const c=actor(),control=actor();try{
    c.fireWeb(target,'left');tick(c,fps,.16);tick(control,fps,.16);
    if(state==='IDLE')c.combatAction=control.combatAction={key:'cross',id:1,time:.3,duration:1};
    tick(c,fps,.16,state);tick(control,fps,.16,state);
    for(const [name,b] of Object.entries(c.bones))if(/hand(index|middle|ring|pinky|thumb)/i.test(name))assert(angle(b.quaternion,control.bones[name].quaternion)<1e-4,'Web pose overrode contact/combat animation');
  }finally{disposeRig(c);disposeRig(control);}}});
  check(`${fps}fps: remote hit/miss/dual hand gestures and stale cleanup use independent skin`,()=>{const source=actor(),player={id:'web-gesture',x:0,y:.1,z:0,facing:0},remote=new RemoteMotion(new THREE.Scene(),source,player,{colliders:[]});try{
    const original=Object.values(source.bones).map(b=>b.quaternion.clone());
    for(const miss of [false,true]){const pose={state:'IDLE',velocity:{x:0,y:0,z:0},webs:miss?[]:[{hand:'left',anchor:target}],webShot:{hand:'left',target,remaining:.38,miss}};
      remote.receive(player,pose,0);for(let i=0;i<Math.ceil(.16*fps);i++)remote.update(1/fps,i*1000/fps);remote.mesh.updateMatrixWorld(true);thwip(remote.character.bones,'left');
      assert.equal(remote.character.webAttachments.length,miss?0:1);
    }
    const dualSource=actor();dualSource.fireWeb(target,'left');dualSource.fireWeb(target.clone().setX(2),'right');
    const dualPose=capturePose({state:'SWINGING',velocity:new THREE.Vector3(),webs:dualSource.webAttachments},dualSource);
    assert.equal(dualPose.webShots.length,2);remote.receive(player,dualPose,200);
    for(let i=0;i<Math.ceil(.16*fps);i++)remote.update(1/fps,200+i*1000/fps);remote.mesh.updateMatrixWorld(true);
    thwip(remote.character.bones,'left');thwip(remote.character.bones,'right');disposeRig(dualSource);
    remote.receive(player,{state:'SWINGING',velocity:{x:0,y:0,z:0},webs:[{hand:'left',anchor:target},{hand:'right',anchor:target.clone().setX(2)}]},400);
    for(let i=0;i<Math.ceil(.3*fps);i++)remote.update(1/fps,400+i*1000/fps);assert(remote.character.webGestures.right.grip>.95);
    remote.update(.1,2000);remote.update(.5,2500);assert(!remote.character.webMesh.visible && !remote.character.webMeshOffhand.visible);assert.equal(remote.character.webShotTimer,0);
    assert(Object.values(source.bones).every((b,i)=>b.quaternion.equals(original[i])),'Remote gesture modified local fingers');
  }finally{remote.dispose();disposeRig(source);}});
}
check('Remote shot capture validates handedness, expiry, target and payload size',()=>{
  const c=actor();try{c.fireWebMiss(target,'right');const pose=capturePose({state:'IDLE',velocity:new THREE.Vector3(),webs:[]},c);assert.equal(pose.webShot.hand,'right');assert(pose.webShot.miss);assert(JSON.stringify(pose).length<1200);
    for(const shot of [{hand:'wrong',target,remaining:.3},{hand:'left',target:{x:NaN,y:0,z:0},remaining:.3},{hand:'left',target,remaining:Infinity},{hand:'left',target,remaining:-1}])assert.equal(sanitizePose({...pose,webShot:shot}).webShot,null);
    assert.equal(sanitizePose({...pose,webShot:{hand:'left',target,remaining:100}}).webShot.remaining,.55);
  }finally{disposeRig(c);}});
check('A new remote character never inherits the local firing fingers',()=>{const c=actor();let remote;try{
  c.fireWeb(target,'left');tick(c,60,.16);const before=joint(c,'lefthandmiddle1').quaternion.clone();
  remote=new RemoteMotion(new THREE.Scene(),c,{id:'late-join',x:0,y:0,z:0,facing:0},{colliders:[]});remote.mesh.updateMatrixWorld(true);
  assert(extension(remote.character.bones,'left','middle')>.9,'New opponent inherited the local web gesture');assert(joint(c,'lefthandmiddle1').quaternion.equals(before));
 }finally{remote?.dispose();disposeRig(c);}});
const failures=results.filter(r=>r.status==='FAIL');fs.writeFileSync(folder+'/results.json',JSON.stringify({fps:fpsList,results},null,2)+'\n');console.log(`Web hand pose: ${results.length-failures.length} passed, ${failures.length} failed.`);if(failures.length)process.exitCode=1;
