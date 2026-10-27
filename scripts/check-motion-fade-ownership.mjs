import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {loadMotionRig,disposeRig} from './lib/motion-rig.mjs';
const {actor}=await loadMotionRig(),results=[];
for(const fps of [24,60,144])for(const from of ['IDLE','RUNNING','SPRINTING'])for(const key of ['jab','cross','hook','heavy','special','hitHead']){
 const c=actor(),dt=1/fps,speed=from==='SPRINTING'?6.5:from==='RUNNING'?4.4:0;
 try{
  c.combatStance=true;if(from==='IDLE')c.combatAction={key:'combatIdle'};
  for(let n=0;n<Math.ceil(fps*.25);n++)c.update(dt,from,new T.Vector3(0,0,speed));
  c.combatAction={key,id:1,time:dt,duration:1};c.update(dt,'IDLE',new T.Vector3());
  const action=c.actions[key],weight=action.getEffectiveWeight();
  const total=Object.values(c.actions).filter(a=>a.isScheduled()).reduce((sum,a)=>sum+a.getEffectiveWeight(),0)+(c.transitionPoseAction?.isScheduled()?c.transitionPoseAction.getEffectiveWeight():0);
  const overlay=c.activeAction!==action;
  if(overlay){
   assert(key==='hitHead' && ['walk','regularRun','run'].includes(c.activeAction.getClip().name),'Unexpected action ownership');
   assert(c.movingGuardWeight>0,'Moving hit reaction never entered the upper-body layer');
  }else assert(weight<.8,`${from}->${key} ${fps}: incoming action lost its fade (${weight})`);
  assert(Math.abs(total-1)<1e-4,`${from}->${key}: mixed weights sum to ${total}`);
  results.push({fps,from,key,incomingWeight:overlay?c.movingGuardWeight:weight,overlay,totalWeight:total,status:'PASS'});
 }finally{disposeRig(c);}
}
fs.writeFileSync('docs/qa/system-motion-2026-10-27/fade-ownership.json',JSON.stringify({cases:results.length,results},null,2)+'\n');
console.log(`PASS ${results.length} timed-attack entry transitions: one fade owner, normalized total action weight, 24/60/144 FPS`);
