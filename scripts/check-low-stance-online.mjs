import assert from 'node:assert/strict';
import * as T from 'three';
import {loadMotionRig,point,joint,disposeRig} from './lib/motion-rig.mjs';
import {ThirdPersonCamera} from '../src/Camera.js';
import {RemoteMotion,capturePose} from '../src/RemoteMotion.js';
const {actor}=await loadMotionRig();
for(const stance of ['crouch']){
 const source=actor(),city={colliders:[]};source.lowStance=stance;
 source.surfaceProbe=()=>({height:0,normal:new T.Vector3(0,1,0)});
 for(let i=0;i<60;i++)source.update(1/60,'IDLE',new T.Vector3());
 const player={id:'stance-peer',x:0,y:.1,z:0,facing:0},remote=new RemoteMotion(new T.Scene(),source,player,city);
 try{
  const rest=source.restBonePose.find(sample=>sample.bone===joint(source,'hips'));
  assert(joint(remote.character,'hips').position.distanceTo(rest.p)<1e-8,'New peer inherited the source crouch root');
  const pose=capturePose({state:'IDLE',velocity:new T.Vector3(),webs:[]},source);
  const before=point(source,'head');
  for(let i=0;i<60;i++){const now=i*1000/60;remote.receive(player,pose,now);remote.update(1/60,now);}
  assert.equal(remote.character.lowStance,stance);
  assert(Math.abs(point(remote.character,'head').y-before.y)<.04,`${stance}: remote posture differs from local`);
  assert(point(source,'head').distanceTo(before)<1e-8,'Remote stance modified the source skeleton');
  for(let i=0;i<60;i++)remote.update(1/60,2000+i*1000/60);
  assert.equal(remote.character.lowStance,null);assert(point(remote.character,'head').y>1.55,'Expired peer pose stayed crouched');
 }finally{remote.dispose();disposeRig(source);}
}
for(const fps of [24,60,144]){
 const camera=new T.PerspectiveCamera(),view=new ThirdPersonCamera(camera),p=new T.Vector3(0,.1,0),v=new T.Vector3();
 const tick=()=>view.update(1/fps,p,v,false,[],null,0,{});
 for(let i=0;i<fps;i++)tick();const standing=view.lookAtTarget.y;
 view.stanceDrop=.44;for(let i=0;i<fps;i++)tick();assert(view.lookAtTarget.y<standing-.4,'Crouch camera stayed at standing height');
 view.stanceDrop=0;for(let i=0;i<fps;i++)tick();assert(Math.abs(view.lookAtTarget.y-standing)<.001,'Camera height did not recover');
}
console.log('PASS 1 real remote crouch case and 3 camera frame rates: neutral clone, matching live pose, independent source, stale-packet stand recovery');
