import assert from 'node:assert/strict';
import * as T from 'three';
import {loadMotionRig,joint,disposeRig} from './lib/motion-rig.mjs';
const {actor}=await loadMotionRig();
for(const fps of [24,60,144])for(const state of ['IDLE','RUNNING','SPRINTING','JUMPING','FALLING','SWINGING','WEB_ZIP'])for(const side of ['left','right','both']){
 const c=actor(),control=actor(),velocity=new T.Vector3(0,state==='FALLING'?-4:0,state==='SPRINTING'?12:state==='RUNNING'?7:0);
 try{
  const targets={left:new T.Vector3(-5,8,14),right:new T.Vector3(5,8,14)};
  for(const hand of side==='both'?['left','right']:[side])c.fireWeb(targets[hand],hand);
  let response=0;
  for(let i=0;i<Math.ceil(.3*fps);i++){
   c.update(1/fps,state,velocity,targets.left);control.update(1/fps,state,velocity,targets.left);
   response=Math.max(response,joint(c,'spine1').quaternion.angleTo(joint(control,'spine1').quaternion));
   for(const b of Object.values(c.bones))assert(b.quaternion.toArray().every(Number.isFinite)&&Math.abs(b.quaternion.length()-1)<1e-4);
   for(const {bone,rest,limit} of c.jointConstraints)assert(rest.angleTo(bone.quaternion)<limit+1e-5,'Shot exceeded anatomical joint limits');
  }
  assert(response>.005,`${state} ${side}: chest never joined the shot`);
  assert(Math.abs(c.webShotBody.yaw)<.6 && Math.abs(c.webShotBody.pitch)<.2,'Excessive torso twist');
  c.webAttachments=[];c.webLaunchTimers={};c.webShotTimer=0;c.webShotAnchor=null;c.persistentWebAnchor=null;
  for(let i=0;i<fps*2;i++)c.update(1/fps,'IDLE',new T.Vector3());
  assert(Math.abs(c.webShotBody.yaw)<1e-6 && Math.abs(c.webShotBody.pitch)<1e-6,'Body did not recover after release');
 }finally{disposeRig(c);disposeRig(control);}
}
console.log('PASS 63 real-rig web shot cases: both hands, standing/running/sprinting/jumping/falling/swing/zip at 24/60/144 FPS; torso participation, joint limits, clean recovery');
