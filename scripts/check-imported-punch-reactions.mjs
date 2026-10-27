import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as T from 'three';
import {loadMotionRig,point,disposeRig} from './lib/motion-rig.mjs';
import {CombatSystem,ATTACKS} from '../src/Combat.js';
import {Multiplayer} from '../src/Multiplayer.js';
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
assert.equal(hash('public/models/Punching.fbx'),'16cbd9f0718400a665877d8e296f3da8741dafbdfdb64a4580bdc8f076f0dd66');
const {actor}=await loadMotionRig(),results=[];
for(const speed of [0,4.4,6.5])for(const key of ['cross','hitHead','hitBody','hitHeavy']){
 const c=actor(),clip=c.actions[key].getClip(),duration=ATTACKS[key]?.duration || clip.duration;
 assert(clip.userData.authoredMixamo);assert(clip.tracks.every(t=>t.values.every(Number.isFinite)));
 c.combatStance=true;c.targetFacingAngle=0;
 const velocity=new T.Vector3(0,0,speed),state=speed>5?'SPRINTING':speed?'RUNNING':'IDLE';
 for(let i=0;i<15;i++)c.update(1/60,state,velocity);
 let previous=null,maxStep=0,minFoot=Infinity;
 for(let i=0;i<=Math.ceil(duration*60)+15;i++){
  c.combatAction=i<=duration*60?{id:42,key,time:i/60,duration}:null;
  c.group.position.addScaledVector(velocity,1/60);c.update(1/60,state,velocity);c.group.updateMatrixWorld(true);
  for(const b of Object.values(c.bones)){assert(b.quaternion.toArray().every(Number.isFinite));assert(Math.abs(b.quaternion.length()-1)<1e-4);}
  const hand=point(c,'righthand').sub(c.group.position);if(previous)maxStep=Math.max(maxStep,hand.distanceTo(previous));previous=hand;
  minFoot=Math.min(minFoot,point(c,'leftfoot').y,point(c,'rightfoot').y);
  assert(minFoot>-.1,`${key}: foot penetrated ground ${minFoot}`);
 }
 assert(maxStep<.65,`${key}: hand discontinuity ${maxStep}`);
 results.push({key,speed,maxStep:+maxStep.toFixed(3),minFoot:+minFoot.toFixed(3)});disposeRig(c);
}
const c=actor(),p={state:'IDLE',facingAngle:0,position:new T.Vector3(),velocity:new T.Vector3()},combat=new CombatSystem(new T.Scene(),p,c);combat.toggle();
for(const [damage,region,key] of [[12,null,'hitBody'],[17,null,'hitHead'],[32,null,'hitHeavy'],[17,'body','hitBody']]){combat.invulnerable=0;combat.receiveDamage(damage,{position:new T.Vector3(0,0,1),hitRegion:region});assert.equal(combat.action.key,key);}
combat.cancel();combat.invulnerable=0;combat.stamina=100;combat.guard(true);combat.receiveDamage(17,{position:new T.Vector3(0,0,1)});assert.equal(combat.action,null,'Guarded hits must not trigger recoil');
p.state='FALLING';assert.equal(combat.reactToHit(30),false);disposeRig(c);
assert(ATTACKS.cross.from<=.54*ATTACKS.cross.duration && ATTACKS.cross.to>=.54*ATTACKS.cross.duration);
const calls=[],online={id:'local',players:[{id:'local'}],game:{combat:{reactToHit:(...args)=>calls.push(args)},tpsCamera:{triggerShake(){}}},renderHud(){},syncAvatars(){}};
for(const blocked of [false,true])Multiplayer.prototype.message.call(online,{type:'hit',target:'local',kind:'punch',damage:17,health:83,blocked});
assert.equal(calls.length,1,'Only an unblocked server hit should recoil');
assert.equal(calls[0][0],17);
fs.mkdirSync('docs/qa/punch-reactions-2026-10-27',{recursive:true});
fs.writeFileSync('docs/qa/punch-reactions-2026-10-27/results.json',JSON.stringify({results,serverHitSelection:true,guardExclusion:true,airborneExclusion:true},null,2)+'\n');
console.log('PASS: supplied punch integrity, contact timing, 12 rendered motion/recovery scenarios, damage selection, guard and airborne exclusion');console.table(results);
