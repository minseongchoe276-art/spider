import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {loadMotionRig,joint,point,disposeRig} from './lib/motion-rig.mjs';

const {actor}=await loadMotionRig(),results=[];
function step(c,key,frame,speed=0){
  const clip=c.activeAction.getClip(),time=Math.min(frame/60,clip.duration-1e-6);
  c.activeAction.enabled=true;c.activeAction.paused=false;c.activeAction.time=time;
  if(c.combatStance)c.combatAction={id:1,key,time,duration:clip.duration};
  const v=new T.Vector3(0,0,speed);c.group.position.addScaledVector(v,1/60);
  c.update(1/60,speed?'RUNNING':'IDLE',v);
}
function start(key,combat=false){const c=actor();c.combatStance=combat;c.fadeToAction(key,0);c.fadeToAction=()=>{};return c;}
function authored(c,read){
  const bones=Object.values(c.bones),saved=bones.map(b=>[b,b.position.clone(),b.quaternion.clone()]);
  for(const {bone,p,q} of c.animationPose){bone.position.copy(p);bone.quaternion.copy(q);}c.group.updateMatrixWorld(true);
  const result=read();
  for(const [b,p,q] of saved){b.position.copy(p);b.quaternion.copy(q);}c.group.updateMatrixWorld(true);
  return result;
}
function kneePlane(c,side){
  const hip=point(c,side+'upleg'),axis=point(c,side+'foot').sub(hip).normalize();
  const bend=point(c,side+'leg').sub(hip);return bend.addScaledVector(axis,-bend.dot(axis)).normalize();
}
async function check(name,run){try{const measurements=await run();results.push({name,pass:true,...measurements});}
  catch(error){results.push({name,pass:false,error:error.message});}}

await check('Boxing support boots face the opponent instead of pointing backwards',()=>{
  let maximum=0;
  for(const key of ['combatIdle','jab','cross','rightHook','hook','heavy','special']){
    const c=start(key,true);try{for(let frame=0;frame<c.activeAction.getClip().duration*60;frame++){
      step(c,key,frame);
      for(const side of ['left','right'])if(c.movingPlants?.[side]){
        const d=point(c,side+'toebase').sub(point(c,side+'foot'));
        const yaw=Math.abs(Math.atan2(d.x,d.z))*180/Math.PI;maximum=Math.max(maximum,yaw);
        assert(yaw<70,`${key} ${side} support toe points ${yaw.toFixed(1)} degrees away from the opponent`);
      }
    }}finally{disposeRig(c);}
  }
  return {maxSupportToeYaw:maximum};
});

await check('A lifted running foot keeps its authored knee bend plane',()=>{
  let maximum=0,samples=0;
  for(const [key,speed] of [['walk',1.6],['regularRun',4.8],['run',6.5]]){
    const c=start(key);try{for(let frame=0;frame<c.activeAction.getClip().duration*60;frame++){
      step(c,key,frame,speed);
      if(frame<15)continue;
      for(const side of ['left','right'])if(!c.movingPlants?.[side] && !c.movingReleases?.[side] && point(c,side+'foot').y>.3){
        const plane=authored(c,()=>kneePlane(c,side));
        const angle=plane.angleTo(kneePlane(c,side))*180/Math.PI;
        maximum=Math.max(maximum,angle);samples++;
        assert(angle<35,`${key} ${side} lifted knee twists ${angle.toFixed(1)} degrees away from the authored bend`);
      }
    }}finally{disposeRig(c);}
  }
  assert(samples>5);return {maxSwingKneePlaneError:maximum,samples};
});

await check('A right hook closes both hands consistently with the other strikes',()=>{
  const c=start('rightHook',true);try{
    for(let frame=0;frame<28;frame++)step(c,'rightHook',frame);
    const reference=start('jab',true);try{
      for(let frame=0;frame<28;frame++)step(reference,'jab',frame);
      let maximum=0;
      for(const side of ['left','right'])for(const finger of ['index','middle','ring','pinky'])for(const n of [1,2,3]){
        const angle=joint(c,`${side}hand${finger}${n}`).quaternion.angleTo(joint(reference,`${side}hand${finger}${n}`).quaternion);
        maximum=Math.max(maximum,angle*180/Math.PI);
        assert(angle<.03,`${side} ${finger}${n} right hook has a different open/folded finger pose`);
      }
      return {maxFingerDifference:maximum};
    }finally{disposeRig(reference);}
  }finally{disposeRig(c);}
});

await check('An absolute fist layer restores the authored fingers before the next sample',async()=>{
  const {applyHandPose,restoreHandPose,createHandPoseRig}=await import('../src/WebHandPose.js');
  const c=actor();try{
    const rig=createHandPoseRig(c.model,c.bones),finger=joint(c,'lefthandindex2');
    const authoredPose=new T.Quaternion().setFromEuler(new T.Euler(.18,.08,-.04));finger.quaternion.copy(authoredPose);
    applyHandPose(rig,'left',0,1,{absolute:true});restoreHandPose(rig);
    assert(finger.quaternion.angleTo(authoredPose)<1e-6,'An absolute hand layer leaks its fist into a held/unchanged animation sample');
    return {restored:true};
  }finally{disposeRig(c);}
});

const output={passed:results.filter(r=>r.pass).length,total:results.length,results};
if(process.env.MOTION_EXPRESSION_REPORT)fs.writeFileSync(process.env.MOTION_EXPRESSION_REPORT,JSON.stringify(output,null,2)+'\n');
for(const result of results)console.log(`${result.pass?'PASS':'FAIL'} ${result.name}${result.error?': '+result.error:''}`);
if(output.passed!==output.total)process.exitCode=1;
