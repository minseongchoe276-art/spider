import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {loadMotionRig,point,disposeRig} from './lib/motion-rig.mjs';
import {CombatSystem} from '../src/Combat.js';
const {actor}=await loadMotionRig(),rows=[];
for(const fps of [24,60,144])for(const key of ['dodgeLeft','dodgeRight','dodgeBack','dodgeForward']){
 const c=actor(),dt=1/fps,duration={dodgeLeft:.38,dodgeRight:.38,dodgeBack:.42,dodgeForward:.52}[key],peak={dodgeLeft:.8,dodgeRight:.8,dodgeBack:1.35,dodgeForward:2.3}[key];
 c.combatStance=true;for(let i=0;i<fps/2;i++){c.combatAction={key:'combatIdle'};c.update(dt,'IDLE',new T.Vector3());}
 const initial=c.group.position.clone(),direction=new T.Vector3(key==='dodgeLeft'?1:key==='dodgeRight'?-1:0,0,key==='dodgeForward'?1:key==='dodgeBack'?-1:0),heights=[],widths=[];let maxStep=0,previous=null;
 for(let i=0;i<=Math.ceil(fps*duration);i++){
  const time=Math.min(duration,i*dt),distance=peak*duration/Math.PI*(1-Math.cos(Math.PI*time/duration));
  c.group.position.copy(initial).addScaledVector(direction,distance);c.combatAction={id:1,key,time,duration};
  c.update(dt,'IDLE',direction.clone().multiplyScalar(peak*Math.sin(Math.PI*time/duration)));c.group.updateMatrixWorld(true);
  const left=point(c,'leftfoot'),right=point(c,'rightfoot');heights.push(left.y,right.y);widths.push(left.distanceTo(right));
  if(previous)maxStep=Math.max(maxStep,left.distanceTo(previous));previous=left;
  for(const node of Object.values(c.bones))assert(node.quaternion.toArray().every(Number.isFinite));
 }
 for(let i=0;i<Math.ceil(fps*.35);i++){
  c.combatAction={key:'combatIdle'};c.update(dt,'IDLE',new T.Vector3());const left=point(c,'leftfoot');maxStep=Math.max(maxStep,left.distanceTo(previous));previous=left;
 }
 assert(Math.max(...heights)-Math.min(...heights)>.04,`${key} should visibly lift a foot`);
 assert(Math.min(...heights)>.025,`${key} ankle below ground`);assert(Math.min(...widths)>.08,`${key} crossed feet`);assert(maxStep<.25,`${key} abrupt foot teleport ${maxStep}`);
 c.stopAnimation();c.combatAction=null;c.group.position.copy(initial);c.update(dt,'IDLE',new T.Vector3());
 rows.push({fps,key,liftRange:Math.max(...heights)-Math.min(...heights),minAnkle:Math.min(...heights),minWidth:Math.min(...widths),maxStep});disposeRig(c);
}
fs.writeFileSync('docs/qa/quality-upgrade-2026-10-28/dodge.json',JSON.stringify(rows,null,2));console.log('PASS',rows.length,'actual rig dodge cases: visible steps, ground clearance, no crossed feet or teleports');
