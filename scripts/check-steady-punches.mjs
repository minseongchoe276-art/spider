import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';import * as T from 'three';
import {loadMotionRig,point,joint,disposeRig} from './lib/motion-rig.mjs';import {Character} from '../src/Character.js';import {ATTACKS} from '../src/Combat.js';
const dir='docs/qa/steady-punches-2026-10-27',tmp=fs.mkdtempSync(path.join(os.tmpdir(),'steady-punches-'));
try{
 fs.cpSync('src',tmp+'/src',{recursive:true});for(const f of ['Character.js','CharacterPose.js','MotionRetarget.js','MixamoMotion.js','MotionCatalog.js'])fs.copyFileSync(dir+'/before/src/'+f,tmp+'/src/'+f);
 fs.writeFileSync(tmp+'/package.json','{"type":"module"}');fs.symlinkSync(path.resolve('node_modules'),tmp+'/node_modules','dir');
 const {Character:Before}=await import(pathToFileURL(tmp+'/src/Character.js')), {actor}=await loadMotionRig(),rows=[];
 for(const fps of [30,60,144])for(const key of ['jab','cross'])for(const moving of [false,true]){
  const pair={fps,key,moving};
  for(const version of ['before','after']){
   const c=actor();if(version==='before'){
    Object.setPrototypeOf(c,Before.prototype);const raw=JSON.parse(fs.readFileSync(dir+'/before/public/motions/'+key+'.json')),clip=T.AnimationClip.parse(raw);clip.userData=raw.userData;
    const a=c.mixer.clipAction(clip);a.setLoop(T.LoopOnce);a.clampWhenFinished=true;c.actions[key]=a;
   }else assert.equal(c.actions[key].getClip().userData.bodyProfileVersion,1);
   const v=new T.Vector3(0,0,moving?4.4:0),state=moving?'RUNNING':'IDLE',dt=1/fps;c.combatStance=true;
   let min=Infinity,max=-Infinity,angularTravel=0,peakStep=0,last=null,reach=0;
   try{
    for(let i=0;i<fps*.65;i++){c.combatAction={key:'combatIdle'};c.group.position.addScaledVector(v,dt);c.update(dt,state,v);}
    for(let i=0;i<=Math.floor(fps*ATTACKS[key].duration);i++){
     c.combatAction={id:1,key,time:i*dt,duration:ATTACKS[key].duration,travel:moving};c.group.position.addScaledVector(v,dt);c.update(dt,state,v);
     const head=point(c,'head').sub(c.group.position);min=Math.min(min,head.x);max=Math.max(max,head.x);
     const q=joint(c,'spine2').getWorldQuaternion(new T.Quaternion());if(last){const step=q.angleTo(last)*180/Math.PI;angularTravel+=step;peakStep=Math.max(peakStep,step);}last=q;
     if(i*dt>=ATTACKS[key].from && i*dt<=ATTACKS[key].to){const side=key==='jab'?'left':'right';reach=Math.max(reach,point(c,side+'hand').z-point(c,side+'arm').z);}
     for(const bone of Object.values(c.bones)){assert(bone.position.toArray().every(Number.isFinite));assert(Math.abs(bone.quaternion.length()-1)<1e-4);}
    }
    pair[version]={headSway:max-min,angularTravel,peakStep,reach};
   }finally{disposeRig(c);}
  }
  assert(pair.after.headSway<pair.before.headSway*.7,`${key} ${fps} ${moving}: head sway was not reduced`);
  assert(pair.after.angularTravel<pair.before.angularTravel*.8,`${key}: extra torso rotation remained`);
  assert(pair.after.reach>.45,`${key}: stable torso lost fist reach`);
  rows.push(pair);console.log('PASS',fps,key,moving?'moving':'standing',JSON.stringify(pair));
 }
 fs.writeFileSync(dir+'/comparison.json',JSON.stringify(rows,null,2));console.log(`PASS ${rows.length} before/after standing and moving punch timelines`);
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
