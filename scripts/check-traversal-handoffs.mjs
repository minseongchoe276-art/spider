import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {loadMotionRig,joint,point,disposeRig} from './lib/motion-rig.mjs';
import {abilitySlotState} from '../src/VitalsHud.js';
const {actor}=await loadMotionRig();
const results=[];
for(const fps of [24,30,60,144]){
 const c=actor();c.group.position.set(0,.1,0);c.groundProbe=()=>0;c.combatStance=true;c.combatAction={key:'combatIdle'};
 const ids=['lefthand','righthand','leftfoot','rightfoot'];
 for(let i=0;i<fps*2;i++)c.update(1/fps,'IDLE',new T.Vector3());
 let prior=ids.map(id=>point(c,id)),maxDrift=0;
 for(let i=0;i<fps*4;i++){
  c.update(1/fps,'IDLE',new T.Vector3());
  const now=ids.map(id=>point(c,id));now.forEach((p,n)=>maxDrift=Math.max(maxDrift,p.distanceTo(prior[n])));prior=now;
 }
 assert(maxDrift<.002,`${fps}fps combat stance shakes by ${maxDrift}m/frame`);
 results.push({case:'stationary-combat',fps,maxLimbFrameDrift:maxDrift});
 c.combatAction=null;c.combatStance=false;
 // This checks the actual rendered, post-contact skeleton as the source.
 // Include an intentional IK correction absent from the source clip.
 for(const [from,to] of [['run','jump'],['jump','swing'],['swing','drop'],['drop','wall'],['wall','idle'],['fall','land'],['land','run'],['roll','regularRun']]){
  c.stopAnimation();c.fadeToAction(from,0);c.mixer.update(.15);
  const hand=joint(c,'lefthand');hand.rotateZ(.15);c.group.updateMatrixWorld(true);
  const before=Object.values(c.bones).map(b=>[b,b.position.clone(),b.quaternion.clone()]);
  c.fadeToAction(to,.18);c.mixer.update(0);
  let maxPosition=0,maxAngle=0;
  for(const [b,p,q]of before){maxPosition=Math.max(maxPosition,b.position.distanceTo(p));maxAngle=Math.max(maxAngle,b.quaternion.clone().normalize().angleTo(q.clone().normalize()));}
  assert(maxPosition<1e-7 && maxAngle<1e-6,`${from}→${to} discarded the rendered contact pose`);
  for(let i=0;i<Math.ceil(fps*.25);i++)c.mixer.update(1/fps);
  assert(c.actions[to].getEffectiveWeight()>.999,'Handoff never completed');
  results.push({case:'rendered-pose-handoff',fps,from,to,maxPosition,maxAngle});
 }
 disposeRig(c);
}
// Exercise Character.update itself: outgoing upper-body layers must survive
// restoring the clean mixer sample at the first airborne frame.
for(const fps of [24,30,60,144]){
 const c=actor();c.groundProbe=()=>0;c.combatStance=true;
 for(let i=0;i<fps;i++){c.group.position.z+=4.8/fps;c.update(1/fps,'RUNNING',new T.Vector3(0,0,4.8));}
 const arms=Object.values(c.bones).filter(b=>/^(left|right)(arm|forearm)$/.test(b.name.replace(/^mixamorig:?/i,'').toLowerCase()));
 const before=arms.map(b=>b.quaternion.clone().normalize());
 c.update(1/fps,'JUMPING',new T.Vector3(0,26,4.8));
 const maxArmStep=Math.max(...arms.map((b,i)=>T.MathUtils.radToDeg(before[i].angleTo(b.quaternion.clone().normalize()))));
 assert(maxArmStep*fps<900,`${fps}fps rendered combat arms snapped on jump: ${maxArmStep} degrees`);
 results.push({case:'rendered-combat-run-to-jump',fps,maxArmStep,armDegreesPerSecond:maxArmStep*fps});disposeRig(c);
}
assert(abilitySlotState({mode:'web',grounded:true}).slots.zip.unavailable);
assert(abilitySlotState({mode:'combat',stamina:11}).slots.guard.dry);
assert(!abilitySlotState({mode:'combat',stamina:12}).slots.guard.dry);
const main=fs.readFileSync('src/main.js','utf8');assert(!main.includes('this.combat.dodge(this.input,this.camera)'),'Ctrl still executes retired evasion');
assert(!fs.readFileSync('index.html','utf8').includes('data-ability="dodge"'));
fs.writeFileSync('docs/qa/traversal-polish-2026-10-26/handoffs.json',JSON.stringify({passed:results.length,results},null,2));
console.log(`PASS ${results.length} rendered-pose handoffs / stationary combat timelines across 24, 30, 60, 144 FPS, retired Ctrl and real ability availability`);
