import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as T from 'three';
import {loadMotionRig,point,disposeRig} from './lib/motion-rig.mjs';
import {CombatSystem,ATTACKS} from '../src/Combat.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {City} from '../src/City.js';
import {sampleCombatScenario,COMBAT_DIRECTIONS} from '../src/CombatMotionScenario.js';
const folder='docs/qa/moving-actions-2026-10-27';fs.mkdirSync(folder,{recursive:true});
const {actor}=await loadMotionRig(),results=[];
const audio=new Proxy({},{get:()=>()=>{}});
function setup(){const c=actor(),p=new SwingPhysics(c.scene,{colliders:[],buildingMeshes:[],raycast:City.prototype.raycast,checkCollision:City.prototype.checkCollision},c,audio),camera=new T.PerspectiveCamera();return {c,p,camera,combat:new CombatSystem(c.scene,p,c)};}
const fpsSet=(process.env.MOVING_FPS||'30,60').split(',').map(Number);
const patterns=(process.env.MOVING_PATTERNS||'steady,start,stop,reverse').split(',');
for(const fps of fpsSet)for(const key of ['jab','cross','heavy','guard'])for(const direction of Object.keys(COMBAT_DIRECTIONS))for(const pattern of patterns){
 const {c,p,camera,combat}=setup();let maxStep=0,last=null,frames=0,minFootGap=Infinity,contactReach=0,travelDuringAttack=false;
 try{
  const result=sampleCombatScenario({combat,physics:p,camera},{key,direction,pattern,sprint:true,phase:1,recovery:.3,fps,onFrame({step}){
   frames++;travelDuringAttack ||= !!combat.action?.travel;
   if(['jab','cross'].includes(key) && combat.action?.time>=ATTACKS[key].from && combat.action.time<=ATTACKS[key].to){const side=key==='jab'?'left':'right';contactReach=Math.max(contactReach,point(c,side+'hand').z-point(c,side+'arm').z);}
   c.group.updateMatrixWorld(true);
   for(const bone of Object.values(c.bones)){assert(bone.position.toArray().every(Number.isFinite));assert(Math.abs(bone.quaternion.length()-1)<1e-4);}
   const next=['lefthand','righthand','leftfoot','rightfoot'].map(id=>point(c,id).sub(c.group.position));
   const gap=point(c,'leftfoot').x-point(c,'rightfoot').x;minFootGap=Math.min(minFootGap,gap);
   if(Math.abs(c.combatStepYaw || 0)>.12 && Math.hypot(p.velocity.x,p.velocity.z)>.5)assert(gap>.08,`Directional feet crossed: ${gap}m`);
   if(last)maxStep=Math.max(maxStep,...next.map((p,i)=>p.distanceTo(last[i])));last=next;
   assert(next.every(p=>p.length()<3),'Rendered limb escaped body bounds');
  }});
  if(key==='guard'){
   assert(combat.blocking,'Held guard disappeared');
   for(const side of ['left','right'])assert(point(c,side+'hand').y-c.group.position.y>1.25,'Guard dropped below the chest');
   if(Math.hypot(p.velocity.x,p.velocity.z)>.4)assert.equal(result.base,'walk','Slow guard movement used a sprint clip');
  }else{
   assert(!combat.action,'Attack did not finish and return to locomotion');
   if(pattern==='start'&&direction!=='stationary')assert(travelDuringAttack,'Starting movement during an attack stayed planted');
   if(['jab','cross'].includes(key))assert(contactReach>.36,`Attack never extended in its damage window: ${contactReach}`);
  }
  assert(maxStep<.85,`Rendered joint jumped ${maxStep}m`);
  results.push({...result,fps,frames,maxStep,minFootGap,contactReach,travelDuringAttack,pass:true});
 }catch(error){results.push({fps,key,direction,pattern,pass:false,error:error.message});console.error('FAIL',fps,key,direction,pattern,error.message);}
 finally{disposeRig(c);}
}
fs.writeFileSync(folder+'/matrix.json',JSON.stringify({passed:results.filter(r=>r.pass).length,total:results.length,results},null,2));
console.log('Moving action matrix',results.filter(r=>r.pass).length+'/'+results.length);if(results.some(r=>!r.pass))process.exitCode=1;
