import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as T from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {loadMotionRig,joint,disposeRig} from './lib/motion-rig.mjs';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {AIR_TRICKS} from '../src/AirTricks.js';
import {capturePose,sanitizePose,RemoteMotion} from '../src/RemoteMotion.js';
const {actor}=await loadMotionRig();
const results=[];
for(const [key,file,window,direction] of [['front','Front Flip',[.5,1.57],1],['back','Stylish Flip',[0,1.23],-1]]){
  const raw=fs.readFileSync(`public/models/${file}.fbx`),source=new FBXLoader().parse(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');
  const take=source.animations[0];let hips;source.traverse(b=>{if(/Hips$/.test(b.name))hips=b;});assert(hips);
  const mixer=new T.AnimationMixer(source),action=mixer.clipAction(take);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
  let previous,rotation=0;
  for(let time=window[0];time<=window[1];time+=1/120){action.time=time;mixer.update(0);source.updateMatrixWorld(true);
    const up=new T.Vector3(0,1,0).applyQuaternion(hips.getWorldQuaternion(new T.Quaternion())),angle=Math.atan2(up.z,up.y);
    if(previous!==undefined)rotation+=Math.atan2(Math.sin(angle-previous),Math.cos(angle-previous));previous=angle;
  }
  assert(direction*rotation>5.5,`${file} lost its complete authored rotation`);
  results.push({source:file,sha256:crypto.createHash('sha256').update(raw).digest('hex'),sourceDuration:take.duration,airborneWindow:window,rotationDegrees:T.MathUtils.radToDeg(rotation)});
  for(const combat of [false,true])for(const fps of [30,60,144])for(const contactTime of [.56,3]){
    const c=actor();c.combatStance=combat;c.group.position.y=20;c.contactTime=contactTime;c.groundProbe=()=>null;
    const p=new SwingPhysics(new T.Scene(),{buildingMeshes:[],colliders:[]},c,{playTrickSound(){}});
    p.state='JUMPING';p.position.set(0,20,0);p.velocity.set(3,8,4);
    const velocity=p.velocity.clone();let completed=0;c.onAirTrickComplete=()=>completed++;
    assert(p.performAirTrick(key));const duration=c.airTrick.duration;
    assert.equal(duration,Math.min(AIR_TRICKS[key].duration,contactTime-.06));assert(!p.performAirTrick(key));
    for(let frame=0;frame<Math.ceil(duration*fps)+2;frame++){
      c.update(1/fps,'JUMPING',p.velocity);
      if(c.airTrick){
        const clip=c.activeAction.getClip();assert.equal(clip.name,key==='front'?'airTrick':'backTrick');
        assert(Math.abs(c.activeAction.time/clip.duration-c.airTrick.elapsed/duration)<1e-5,'Animation and gameplay clocks diverged');
        const pose=capturePose(p,c);assert.equal(pose.airTrick.duration,duration);
        assert.equal(sanitizePose({...pose,airTrick:{...pose.airTrick,duration:NaN}}).airTrick.duration,AIR_TRICKS[key].duration);
      }
      for(const b of Object.values(c.bones))assert(b.quaternion.toArray().every(Number.isFinite));
    }
    assert.equal(completed,1);assert(p.velocity.equals(velocity));
    c.contactTime=.2;assert(!p.performAirTrick(key),'Late input must leave time for landing');
    c.contactTime=3;c.combatAction={key:'slam',duration:1};assert(!p.performAirTrick(key));c.combatAction=null;
    assert(p.performAirTrick(key));c.update(.1,'FALLING',p.velocity);c.update(.01,'LANDING',p.velocity);assert.equal(c.airTrick,null);
    disposeRig(c);
  }
  // Packets carry the gameplay clock as well as an animation sample. Between
  // packets the rig must advance from elapsed time, not freeze on that sample.
  const c=actor();c.triggerAirTrick(key,.5);c.combatStance=true;c.update(.1,'FALLING',new T.Vector3());
  const remote=new RemoteMotion(new T.Scene(),c,{id:'flip',x:0,y:20,z:0},null);
  const physics={state:'FALLING',velocity:new T.Vector3(),webs:[]};remote.receive({id:'flip',x:0,y:20,z:0},capturePose(physics,c),1000);
  remote.update(1/60,1100);const rc=remote.character;
  assert(Math.abs(rc.activeAction.time/rc.activeAction.getClip().duration-.4)<.001,'Remote flip froze at packet phase');
  remote.dispose();disposeRig(c);
}
fs.mkdirSync('docs/qa/imported-air-flips-2026-10-28',{recursive:true});
fs.writeFileSync('docs/qa/imported-air-flips-2026-10-28/analysis.json',JSON.stringify({results,fps:[30,60,144],modes:['web','combat'],contactTimes:[.56,3],status:'PASS'},null,2)+'\n');
console.log('PASS supplied FBX rotation, air windows, both modes, short hops, clock synchronization, interruption, momentum and remote extrapolation');
