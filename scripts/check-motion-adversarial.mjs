import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {loadMotionRig, disposeRig} from './lib/motion-rig.mjs';
import {boneId} from '../src/MotionRetarget.js';
import {JOINT_SPEEDS} from '../src/JointConstraints.js';

const {actor}=await loadMotionRig(), c=actor();
const folder=process.env.MOTION_STRESS_DIR || 'docs/qa/motion-adversarial-2026-10-25';
fs.mkdirSync(folder,{recursive:true});
const profiles=[
  ['idle','IDLE',0,0],['walk','RUNNING',1.6,0],['run','RUNNING',4.4,0],['sprint','SPRINTING',6.5,0],
  ['jump','JUMPING',3,8],['fall','FALLING',2,-18],['drop','FALLING',1,-5],
  ['swing','SWINGING',12,-3],['zip','WEB_ZIP',10,8],['wall','WALL_RUNNING',0,3],
  ['mantle','MANTLING',.4,1],['landing','LANDING',2,0],['roll','ROLLING',4,0],
  ['turnLeft','TURNING',0,0],['turnRight','TURNING',0,0],
  ...['guard','jab','cross','hook','heavy','special','hitHead','dodgeLeft','dodgeRight','dodgeBack','dodgeForward']
    .map(key=>[key,'SPRINTING',6.5,0,key]),
  ['slam','FALLING',1,-16,'slam'],['slamLand','LANDING',1,0,'slamLand'],['trick','FALLING',2,-4],
];
const schedules=[[1/24],[1/30],[1/60],[1/144],[1/144,.09,1/30,1/60]];
const bones=Object.values(c.bones),lengths=bones.map(b=>b.position.length()),restPositions=bones.map(b=>b.position.clone());
const result={profiles:profiles.map(p=>p[0]),timings:schedules,cases:0,frames:0,maxJointExcess:0,maxEndJointRate:0,failures:[],
  scope:'Render-state interruption robustness, including deliberately unreachable pairs. Actual physics reachability and contact quality are tested by separate gameplay suites.'};
const anchor=new T.Vector3(-3,14,8),normal=new T.Vector3(0,0,1);
let serial=0,last=new Map();
function step(profile,frame,dt){
  const [name,state,speed,vertical,key]=profile;
  c.combatAction=key?{key,id:serial,time:Math.min(.65,frame*dt),duration:key==='guard'?undefined:.8}:null;
  c.combatStance=!!key;
  c.pendingTurn=name==='turnLeft'?'left':name==='turnRight'?'right':null;
  c.contactTime=state==='FALLING'?.6:0;c.landingSpeed=24;
  c.wallNormal=['WALL_RUNNING','MANTLING'].includes(state)?normal:null;c.wallDistance=.7;
  c.mantle=state==='MANTLING'?{normal,edge:new T.Vector3(0,2,.7),start:new T.Vector3(0,.8,0),
    end:new T.Vector3(0,2.2,1.1),elapsed:Math.min(.75,.3+frame*dt),duration:.8,gap:.7,height:2}:null;
  c.recoveryProgress=state==='ROLLING'?Math.min(.95,.3+frame*dt):null;
  c.webAttachments=['SWINGING','WEB_ZIP'].includes(state)?[{hand:'left',anchor}]:[];
  if(name==='trick' && !c.airTrick)c.triggerAirTrick('front');
  if(name!=='trick')c.cancelAirTrick();
  const velocity=new T.Vector3(0,vertical,speed);
  c.group.position.addScaledVector(velocity,dt);
  c.update(dt,state,velocity,['SWINGING','WEB_ZIP'].includes(state)?anchor:null);
  const label=`${name} frame ${frame}, dt ${dt}`;
  for(let i=0;i<bones.length;i++){
    const b=bones[i];
    assert([...b.position,...b.quaternion].every(Number.isFinite),`${label}: non-finite bone ${b.name}`);
    assert(Math.abs(b.quaternion.length()-1)<1e-4,`${label}: non-unit ${b.name}`);
    const id=boneId(b.name);
    if(id==='spine'){const shift=b.position.clone().sub(restPositions[i]).multiply(b.parent.getWorldScale(new T.Vector3())).length();assert(shift<.061,`${label}: torso lean ${shift}m exceeded 6cm (${result.currentPair})`);}
    else if(id!=='hips')assert(Math.abs(b.position.length()-lengths[i])<1e-5,`${label}: changed limb length ${b.name}`);
  }
  for(const {bone,kind,rest,limit}of c.jointConstraints || []){
    const excess=rest.clone().normalize().angleTo(bone.quaternion.clone().normalize())-limit;
    result.maxJointExcess=Math.max(result.maxJointExcess,excess);
    assert(excess<1e-3,`${label}: ${kind} exceeds anatomical limit by ${excess}rad`);
    const previous=last.get(bone);
    if(previous && dt>0){const rate=previous.angleTo(bone.quaternion.clone().normalize())/dt*180/Math.PI;
      result.maxEndJointRate=Math.max(result.maxEndJointRate,rate);
      assert(rate<JOINT_SPEEDS[kind]+.1,`${label}: ${kind} snapped at ${rate}deg/s`);}
    last.set(bone,bone.quaternion.clone().normalize());
  }
  result.frames++;
}
try{
  for(const timing of schedules)for(const from of profiles)for(const to of profiles){
    result.currentPair=from[0]+' -> '+to[0];
    c.stopAnimation();c.cancelAirTrick();c.networkAnimation=null;c.networkVisualYaw=null;
    c.group.position.set(0,1,.7);c.webAttachments=[];c.webShotTimer=0;c.persistentWebAnchor=null;
    last=new Map();serial++;
    for(let i=0;i<4;i++)step(from,i,timing[i%timing.length]);
    serial++;
    for(let i=0;i<6;i++)step(to,i,timing[i%timing.length]);
    result.cases++;
  }
  console.log(`PASS ${result.cases} runtime interruptions / ${result.frames} frames, ${profiles.length} profiles and ${schedules.length} frame schedules`);
}catch(error){result.failures.push(error.message);process.exitCode=1;console.error(error);}
finally{fs.writeFileSync(folder+'/runtime.json',JSON.stringify(result,null,2)+'\n');disposeRig(c);}
