import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {loadMotionRig,disposeRig} from './lib/motion-rig.mjs';
import {RemoteMotion,sanitizePose} from '../src/RemoteMotion.js';

const {actor}=await loadMotionRig(),source=actor(),folder=process.env.MOTION_STRESS_DIR||'docs/qa/motion-adversarial-2026-10-25';
fs.mkdirSync(folder,{recursive:true});
const states=['IDLE','RUNNING','SPRINTING','JUMPING','FALLING','SWINGING','WEB_ZIP','WALL_RUNNING','ROLLING','LANDING','TURNING'];
const ages=[0,16,99,349,350,649,650,1000,5000],result={cases:0,frames:0,ages,failures:[],
  scope:'Deterministic receipt-time simulation of gaps, duplicates, expired poses and recovery. No live network or transport ordering guarantee.'};
try{
  for(const state of states)for(const dt of [1/24,1/60,1/144,.1]){
    const player={id:'gap',x:0,y:.1,z:0,facing:0},r=new RemoteMotion(new T.Scene(),source,player,{colliders:[]});
    r.character.surfaceProbe=()=>({height:0,normal:new T.Vector3(0,1,0)});
    try{
      const wire=['SWINGING','WEB_ZIP'].includes(state),packet={state,velocity:{x:0,y:0,z:0},
        animation:{key:wire?'swing':state==='ROLLING'?'roll':'idle',phase:.3,rate:1},
        webs:wire?[{hand:'left',anchor:{x:0,y:15,z:8}}]:[],anchor:wire?{x:0,y:15,z:8}:null,
        wallNormal:state==='WALL_RUNNING'?{x:0,y:0,z:1}:null,
        combat:state==='IDLE'?{key:'jab',id:'gap',time:.1,duration:.72}:null};
      r.receive(player,packet,0);r.receive(player,packet,0); // duplicate delivery
      for(const age of ages){
        r.update(dt,age);result.frames++;
        if(age>=650){assert.equal(r.character.networkAnimation,null);assert.equal(r.character.combatAction,null);assert.equal(r.character.webAttachments.length,0);}
        assert([...r.mesh.position].every(Number.isFinite));
        for(const b of Object.values(r.character.bones))assert([...b.position,...b.quaternion].every(Number.isFinite)&&Math.abs(b.quaternion.length()-1)<1e-4);
      }
      // A new valid packet must resume immediately after a long gap.
      r.receive({...player,z:.2},{state:'RUNNING',velocity:{x:0,y:0,z:4.4},animation:{key:'regularRun',phase:.4,rate:1}},5100);
      r.update(dt,5116);assert.equal(r.character.activeAction,r.character.actions.regularRun);
      // Invalid optional animation data is discarded, and invalid velocities
      // cannot replace the last accepted pose.
      assert.equal(sanitizePose({state:'RUNNING',velocity:{x:NaN,y:0,z:0}}),null);
      assert.equal(sanitizePose({state:'RUNNING',velocity:{x:0,y:0,z:0},animation:{key:'run',phase:Infinity,rate:1}}).animation,null);
      r.receive({...player,z:.3},{state:'RUNNING',velocity:{x:NaN,y:0,z:0}},5120);
      r.update(dt,5136);assert([...r.mesh.position,...r.character.model.quaternion].every(Number.isFinite));
      result.cases++;
    }finally{r.dispose();}
  }
  console.log(`PASS ${result.cases} remote packet-gap cases / ${result.frames} sampled frames; expiry at 650ms and recovery verified`);
}catch(error){result.failures.push(error.message);process.exitCode=1;console.error(error);}
finally{fs.writeFileSync(folder+'/packet-gaps.json',JSON.stringify(result,null,2)+'\n');disposeRig(source);}
