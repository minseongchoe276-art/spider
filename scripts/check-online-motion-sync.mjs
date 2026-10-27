import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {loadMotionRig,disposeRig} from './lib/motion-rig.mjs';
import {RemoteMotion,capturePose,sanitizePose} from '../src/RemoteMotion.js';
import {ATTACKS} from '../src/Combat.js';
import {MOTIONS} from '../src/MotionCatalog.js';
const {actor}=await loadMotionRig(),folder=process.env.ONLINE_QA_DIR||'docs/qa/eight-player-2026-10-21';fs.mkdirSync(folder,{recursive:true});
const results=[],states=['IDLE','RUNNING','SPRINTING','WALL_RUNNING','SWINGING','JUMPING','ROLLING','LANDING'];
const sources=Array.from({length:8},actor),views=[],city={colliders:[]};
try{
 for(let observer=0;observer<8;observer++)for(let subject=0;subject<8;subject++)if(observer!==subject){
  const remote=new RemoteMotion(new T.Scene(),sources[subject],{id:String(subject),x:0,y:.1,z:0,facing:0},city);
  remote.character.mixer.update(observer*.317);views.push({observer,subject,remote});
 }
 assert.equal(views.length,56);assert.equal(new Set(views.map(v=>v.remote.character.model.getObjectByProperty('isSkinnedMesh',true).skeleton)).size,56);
 // Each subject supplies the pose actually produced by Character.update. Each
 // observer starts its own clock at a different phase and uses a different FPS.
 for(let step=0;step<8;step++){
  const packets=[];
  for(let i=0;i<8;i++){
   const c=sources[i],state=states[(i+step)%8],speed=state==='SPRINTING'?6.5:state==='RUNNING'?4.4:0;
   const wall=state==='WALL_RUNNING',air=['SWINGING','JUMPING'].includes(state),v=wall?new T.Vector3(0,2.8,0):new T.Vector3(0,air?4:0,speed);
   c.group.position.set(i*2,wall?4:air?10:.1,wall?.7:0);c.wallNormal=new T.Vector3(0,0,1);c.wallDistance=.7;c.groundProbe=air||wall?()=>null:()=>0;
   c.combatStance=state==='IDLE'||state==='RUNNING';c.combatAction=c.combatStance?{key:step%2?'guard':'combatIdle'}:null;
   for(let frame=0;frame<35;frame++){c.group.position.addScaledVector(v,1/60);c.update(1/60,state,v);}
   const physics={state,velocity:v,webs:[],anchorPoint:state==='SWINGING'?new T.Vector3(0,20,5):null};
   const p=capturePose(physics,c);assert(p.animation);assert(Buffer.byteLength(JSON.stringify(p))<3500);
   packets.push({p,player:{id:String(i),x:c.group.position.x,y:c.group.position.y,z:c.group.position.z,facing:0}});
  }
  let maxPhase=0;
  for(const {observer,subject,remote} of views){
   const {p,player}=packets[subject],fps=[24,30,60,144][observer%4];remote.receive(player,p,1000);
   const clip=remote.character.actions[p.animation.key].getClip(),loop=MOTIONS.find(m=>m.key===p.animation.key).loop;
   for(let f=0;f<Math.ceil(.2*fps);f++){
    const now=1000+f*1000/fps;remote.update(1/fps,now);
    assert.equal(remote.character.activeAction.getClip().name,p.animation.key,'Observer selected a different gait/action');
    const expected=loop?(p.animation.phase*clip.duration+(now-1000)/1000*p.animation.rate)%clip.duration:Math.min(clip.duration-1e-6,p.animation.phase*clip.duration+(now-1000)/1000*p.animation.rate);
    const error=Math.abs(remote.character.activeAction.time-expected);maxPhase=Math.max(maxPhase,error);assert(error<1e-5,'Observer free-ran its own clip clock');
    for(const bone of Object.values(remote.character.bones))assert(Math.abs(bone.quaternion.length()-1)<1e-4);
   }
  }
  results.push({step,subjects:8,observersPerSubject:7,views:56,maxClipTimeErrorSeconds:maxPhase,pass:true});
 }
 // All registered clips carry a bounded, sanitized phase. Malicious labels,
 // rates and nonfinite input cannot select arbitrary rig actions.
 assert.equal(sanitizePose({state:'IDLE',velocity:{x:0,y:0,z:0},animation:{key:'__proto__',phase:0,rate:1}}).animation,null);
 for(const key of MOTIONS.map(m=>m.key)){
  const p=sanitizePose({state:'IDLE',velocity:{x:0,y:0,z:0},animation:{key,phase:.42,rate:1}});assert.equal(p.animation.key,key);
 }
 // Manual combat clocks (including fast dodge base clips) and a held slam
 // must extrapolate their real gameplay rate rather than freeze between packets.
 for(const key of ['jab','cross','dodgeLeft','slam']){
  const c=actor(),state=key==='slam'?'FALLING':'IDLE',duration=key==='dodgeLeft'?.38:key==='slam'?1:.72;
  c.combatStance=true;c.group.position.y=key==='slam'?10:.1;c.groundProbe=key==='slam'?()=>null:()=>0;
  c.combatAction={id:1,key,time:key==='slam'?.62:.1,duration};c.update(1/60,state,new T.Vector3());
  const packet=capturePose({state,velocity:new T.Vector3(),webs:[]},c),player={id:key,x:0,y:c.group.position.y,z:0,facing:0};
  const r=new RemoteMotion(new T.Scene(),c,player,city);
  try{r.receive(player,packet,0);r.update(1/60,50);const clip=r.character.activeAction.getClip();
   const expected=key==='slam'?clip.duration*.62:packet.animation.phase*clip.duration+.05*packet.animation.rate;
   assert(Math.abs(r.character.activeAction.time-expected)<1e-5,key+' lost manual combat clock');
   if(key==='dodgeLeft')assert(packet.animation.rate>6,'Dodge clock was silently clamped');
  }finally{r.dispose();disposeRig(c);}
 }
 // A moving action has two clocks: the source gait and the combat layer.
 // Local smoothing speed must not replace the transmitted gait, including E.
 for(const key of ['jab','cross','heavy','guard'])for(const fps of [24,60,144]){
  const c=actor(),v=new T.Vector3(4.4,0,0);c.combatStance=true;
  try{
   for(let i=0;i<35;i++){c.combatAction=key==='guard'?{key}:{id:9,key,time:.3,duration:ATTACKS[key].duration,travel:true};c.group.position.addScaledVector(v,1/60);c.update(1/60,'RUNNING',v);}
   const packet=capturePose({state:'RUNNING',velocity:v,webs:[]},c),player={id:key,x:c.group.position.x,y:.1,z:0,facing:0};
   const r=new RemoteMotion(new T.Scene(),c,{...player,x:player.x-1},city);
   try{r.receive(player,packet,1000);for(let frame=0;frame<Math.ceil(.1*fps);frame++){
    const age=frame/fps;r.update(1/fps,1000+age*1000);
    const clip=r.character.activeAction.getClip();assert.equal(clip.name,packet.animation.key,key+' gait was replaced by smoothing speed');
    const expected=(packet.animation.phase*clip.duration+age*packet.animation.rate)%clip.duration;
    assert(Math.abs(r.character.activeAction.time-expected)<1e-5,key+' moving gait lost its source clock');
   }}finally{r.dispose();}
  }finally{disposeRig(c);}
 }
 for(const [team,color]of [['red',0xff536e],['blue',0x45cfff]]){
  const r=new RemoteMotion(new T.Scene(),sources[0],{id:team,x:0,y:.1,z:0,facing:0,team},city);
  assert.equal(r.marker.material.color.getHex(),color);r.dispose();
 }
 fs.writeFileSync(folder+'/motion-sync.json',JSON.stringify({players:8,remoteRigs:56,registeredClips:MOTIONS.length,results,scope:'Final Character.update clocks across 56 independent remote rigs at 24/30/60/144 FPS. Root smoothing and real network latency remain intentionally visible; this is not pixel identity.'},null,2)+'\n');
 console.log('PASS eight subjects × seven observers: 56 independent remote rigs, eight state rotations, explicit phase consistency and finite final bones');
}finally{for(const {remote}of views)remote.dispose();for(const c of sources)disposeRig(c);}
