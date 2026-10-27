import {performance} from 'node:perf_hooks';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';import * as T from 'three';
import {loadMotionRig,point,disposeRig} from './lib/motion-rig.mjs';
import {Character} from '../src/Character.js';import {CombatSystem} from '../src/Combat.js';import {SwingPhysics} from '../src/SwingPhysics.js';import {City} from '../src/City.js';
const dir='docs/qa/moving-actions-2026-10-27',tmp=fs.mkdtempSync(path.join(os.tmpdir(),'shadow-moving-before-'));
try{
 fs.cpSync('src',tmp+'/src',{recursive:true});for(const f of ['Character.js','CharacterPose.js','Combat.js'])fs.copyFileSync(dir+'/before/src/'+f,tmp+'/src/'+f);
 fs.writeFileSync(tmp+'/package.json','{"type":"module"}');fs.symlinkSync(path.resolve('node_modules'),tmp+'/node_modules','dir');
 const {Character:BeforeCharacter}=await import(pathToFileURL(tmp+'/src/Character.js'));
 const {CombatSystem:BeforeCombat}=await import(pathToFileURL(tmp+'/src/Combat.js'));
 const {actor}=await loadMotionRig(),out={};
 for(const [version,C,Combat]of [['before',BeforeCharacter,BeforeCombat],['after',Character,CombatSystem]]){
  const make=()=>{const c=actor();Object.setPrototypeOf(c,C.prototype);const p=new SwingPhysics(c.scene,{colliders:[],buildingMeshes:[],raycast:City.prototype.raycast,checkCollision:City.prototype.checkCollision},c,new Proxy({},{get:()=>()=>{}}));p.position.set(0,.1,0);p.previousFixedPosition.copy(p.position);p.renderPosition.copy(p.position);p.state='IDLE';const camera=new T.PerspectiveCamera();camera.userData.movementYaw=0;const combat=new Combat(c.scene,p,c);combat.toggle();return {c,p,camera,combat,tick(input){combat.before(1/60,camera,input);p.update(1/60,input,camera);combat.after(1/60);}};};
  const metrics={};
  {
   const a=make();a.combat.attack(a.camera);for(let i=0;i<6;i++)a.tick({});for(let i=0;i<15;i++)a.tick({forward:true});
   metrics.moveStartedDuringAttack={travel:a.combat.action?.travel,distance:a.p.position.z};disposeRig(a.c);
  }
  {
   const a=make();for(let i=0;i<60;i++)a.tick({forward:true,sprint:true,guard:true});metrics.guardSprint={speed:a.p.velocity.length(),base:a.c.activeAction.getClip().name};disposeRig(a.c);
  }
  {
   const a=make();for(let i=0;i<40;i++)a.tick({right:true});a.combat.attack(a.camera);let minGap=Infinity;
   for(let i=0;i<40;i++){a.tick({right:true});minGap=Math.min(minGap,point(a.c,'leftfoot').x-point(a.c,'rightfoot').x);}metrics.sideAttack={minFootGap:minGap};disposeRig(a.c);
  }
  {
   const a=make(),input={right:true,sprint:true,guard:true};for(let i=0;i<80;i++)a.tick(input);
   const rounds=[];for(let n=0;n<5;n++){const start=performance.now();for(let i=0;i<60;i++)a.tick(input);rounds.push((performance.now()-start)/60);}
   metrics.cpuGuardStepMs=rounds.sort((a,b)=>a-b)[2];disposeRig(a.c);
  }
  out[version]=metrics;
 }
 assert.equal(out.before.moveStartedDuringAttack.travel,false);assert(out.before.moveStartedDuringAttack.distance<.01);
 assert(out.after.moveStartedDuringAttack.travel&&out.after.moveStartedDuringAttack.distance>.1);
 assert.equal(out.before.guardSprint.base,'run');assert.equal(out.after.guardSprint.base,'walk');
 assert(out.before.sideAttack.minFootGap<.04,'Baseline did not reproduce crossed feet');assert(out.after.sideAttack.minFootGap>.08);
 fs.writeFileSync(dir+'/before-after.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
