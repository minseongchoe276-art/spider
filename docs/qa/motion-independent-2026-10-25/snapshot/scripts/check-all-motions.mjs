import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadMotionRig,point,landmarks,disposeRig} from './lib/motion-rig.mjs';
import {AIR_TRICKS} from '../src/AirTricks.js';
import {MOTIONS} from '../src/MotionCatalog.js';
import {RemoteMotion} from '../src/RemoteMotion.js';

const {actor,clips,embeddedCount}=await loadMotionRig(),folder='docs/qa/all-motions-2026-10-15';
fs.mkdirSync(folder,{recursive:true});const results=[];
function check(name,run){try{const detail=run();results.push({name,status:'PASS',detail});console.log('PASS '+name);}catch(error){results.push({name,status:'FAIL',error:error.message});console.error('FAIL '+name+': '+error.message);}}
const fpsList=[24,30,60,144];
for(const fps of fpsList){
  for(const key of ['hitHead'])check(`${fps}fps ${key} keeps a supported foot during the full hit reaction`,()=>{
    const c=actor();try{let maxError=0;for(let i=0;i<=fps;i++){c.combatAction={id:1,key,time:i/fps,duration:1};c.update(1/fps,'IDLE',new THREE.Vector3());
      if(i/fps>.12)maxError=Math.max(maxError,Math.abs(Math.min(point(c,'leftfoot').y,point(c,'rightfoot').y)-.11));}
      assert(maxError<.015,`Hit reaction floated ${(maxError*1000).toFixed(1)}mm above its support`);return {maxContactError:maxError};
    }finally{disposeRig(c);}
  });
  check(`${fps}fps three-point landing stays grounded throughout its recovery`,()=>{
    const c=actor();try{c.fadeToAction('slamLand',0);const clip=c.activeAction.getClip();let maxHip=0,maxContactError=0;
      for(let i=0;i<=Math.ceil(clip.duration*fps);i++){c.activeAction.enabled=true;c.activeAction.paused=false;c.activeAction.time=Math.min(i/fps,clip.duration-1e-6);c.mixer.update(0);c.group.updateMatrixWorld(true);
        maxHip=Math.max(maxHip,point(c,'hips').y);const ankle=Math.min(point(c,'leftfoot').y,point(c,'rightfoot').y);maxContactError=Math.max(maxContactError,Math.abs(ankle-.21));}
      assert(maxHip<1.6,`A grounded recovery raised the pelvis to ${maxHip.toFixed(2)}m`);
      assert(maxContactError<.02,`Landing contact error ${(maxContactError*1000).toFixed(1)}mm`);
      return {maxHip,maxContactError};
    }finally{disposeRig(c);}
  });
  check(`${fps}fps long-running mixer starts a fade without a precision jump`,()=>{
    const c=actor();try{c.fadeToAction('combatIdle',0);c.mixer.update(65536.011);const before=landmarks(c);
      c.fadeToAction('walk',.18);c.mixer.update(0);const error=Math.max(...landmarks(c).map((p,i)=>p.distanceTo(before[i])));
      assert(error<1e-5,`Large mixer time displaced a joint by ${(error*1000).toFixed(1)}mm at fade start`);return {maxDiscontinuity:error};
    }finally{disposeRig(c);}
  });
  check(`${fps}fps reversal keeps the current blended rig pose`,()=>{
    const c=actor();try{c.fadeToAction('combatIdle',0);c.mixer.update(.2);c.fadeToAction('walk',.2);c.mixer.update(1/fps);
      const before=landmarks(c);c.fadeToAction('combatIdle',.2);c.mixer.update(0);const error=Math.max(...landmarks(c).map((p,i)=>p.distanceTo(before[i])));
      assert(error<1e-5,`Returning to a fading clip displaced a joint by ${(error*1000).toFixed(1)}mm without advancing time`);
      c.mixer.update(.25);assert(c.activeAction.isRunning());return {maxDiscontinuity:error};
    }finally{disposeRig(c);}
  });
}
if(!process.argv.includes('--regressions-only')){
  check('Every registered clip and embedded fallback has explicit coverage',()=>{
    assert.equal(new Set(MOTIONS.map(m=>m.key)).size,MOTIONS.length);
    for(const m of MOTIONS)assert(fs.existsSync('public'+m.url),m.url);
    assert.equal(clips.filter(c=>c.key==='default').length,embeddedCount?1:0,'Embedded fallback coverage differs from the current rig asset');
    return {registered:MOTIONS.length,embedded:clips.filter(c=>c.key==='default').length,archivedCompiled:clips.filter(c=>c.archived).map(c=>c.key)};
  });
  const coverage=[];
  for(const item of clips)for(const fps of fpsList)check(`${item.key}: entire timeline at ${fps}fps`,()=>{
    const c=actor();try{c.fadeToAction(item.key,0);const clip=item.clip,frames=Math.ceil(clip.duration*fps),lengths=Object.values(c.bones).map(b=>b.position.length());let maxSpeed=0,last=null;
      for(const track of clip.tracks){assert(track.times.every(Number.isFinite));assert(track.values.every(Number.isFinite));assert(track.times.every((t,i)=>!i||t>=track.times[i-1]));}
      for(let frame=0;frame<=frames;frame++){c.activeAction.enabled=true;c.activeAction.paused=false;c.activeAction.time=Math.min(clip.duration-1e-6,clip.duration*frame/frames);c.mixer.update(0);c.group.updateMatrixWorld(true);
        for(const [i,bone] of Object.values(c.bones).entries()){assert(bone.position.toArray().every(Number.isFinite));assert(Math.abs(bone.quaternion.length()-1)<1e-4);if(!bone.name.toLowerCase().includes('hips'))assert(Math.abs(bone.position.length()-lengths[i])<1e-4,'Limb length changed');}
        const next=landmarks(c);assert(next.every(p=>p.toArray().every(Number.isFinite)&&p.length()<10),'Pose escaped the humanoid bounds');
        if(last)maxSpeed=Math.max(maxSpeed,...next.map((p,i)=>p.distanceTo(last[i])*frames/clip.duration));last=next;
      }
      assert(maxSpeed<30,`${item.key}: extremity speed ${maxSpeed.toFixed(2)}m/s exceeds the established clip bound`);
      const detail={key:item.key,fps,frames:frames+1,maxExtremitySpeed:maxSpeed};coverage.push(detail);return detail;
    }finally{disposeRig(c);}
  });
  fs.writeFileSync(folder+'/coverage.json',JSON.stringify(coverage,null,2)+'\n');
  for(const fps of fpsList)for(const [key,trick] of Object.entries(AIR_TRICKS))check(`${fps}fps complete procedural ${key} trick, interruption and repeat`,()=>{
    const c=actor();try{let completed=0;c.onAirTrickComplete=()=>completed++;c.group.position.y=20;assert(c.triggerAirTrick(key));
      for(let i=0;i<Math.ceil((trick.duration+.3)*fps);i++){c.update(1/fps,'FALLING',new THREE.Vector3(0,-1,2));for(const b of Object.values(c.bones))assert(Math.abs(b.quaternion.length()-1)<1e-4);}
      assert.equal(completed,1);assert(!c.isTricking);assert(c.model.position.length()<.01,'Torso pivot offset survived the trick');
      assert(c.triggerAirTrick(key));c.update(1/fps,'LANDING',new THREE.Vector3());assert(!c.isTricking);assert.equal(completed,1,'Interrupted trick scored');
      assert(c.triggerAirTrick(key));for(let i=0;i<Math.ceil((trick.duration+.05)*fps);i++)c.update(1/fps,'FALLING',new THREE.Vector3(0,-1,2));assert.equal(completed,2);
    }finally{disposeRig(c);}
  });
  for(const fps of fpsList){
    check(`${fps}fps remote rig plays every combat motion without modifying the source rig`,()=>{
      const source=actor(),player={id:'full-combat',x:0,y:.1,z:0,facing:0},remote=new RemoteMotion(new THREE.Scene(),source,player,{colliders:[]});
      const before=Object.values(source.bones).map(b=>b.quaternion.clone());let frames=0;
      try{for(const key of ['combatIdle','jab','hook','heavy','special','guard','slam','slamLand','hitHead']){
        for(let i=0;i<fps;i++){const time=i/fps,now=frames*1000/fps,state=key==='slam'?'FALLING':'IDLE';
          remote.receive(player,{state,velocity:{x:0,y:key==='slam'?-10:0,z:0},combat:{key,id:key,time,duration:1}},now);
          remote.update(1/fps,now);assert.equal(remote.character.activeAction,remote.character.actions[key]);
          for(const b of Object.values(remote.character.bones))assert(Math.abs(b.quaternion.length()-1)<1e-4);frames++;
        }
      }
      assert(Object.values(source.bones).every((b,i)=>b.quaternion.equals(before[i])));return {motions:9,frames};
      }finally{remote.dispose();disposeRig(source);}
    });
    check(`${fps}fps remote rig reproduces and completes remaining airborne trick`,()=>{
      const source=actor(),player={id:'full-tricks',x:0,y:20,z:0,facing:0},remote=new RemoteMotion(new THREE.Scene(),source,player,{colliders:[]});let frames=0;
      try{for(const [key,trick] of Object.entries(AIR_TRICKS)){
        for(let i=0;i<=Math.ceil((trick.duration+.1)*fps);i++){const time=i/fps,now=frames*1000/fps;
          remote.receive(player,{state:'FALLING',velocity:{x:0,y:-2,z:0},tricking:time<trick.duration,airTrick:{key,elapsed:time}},now);
          remote.update(1/fps,now);
          if(time<trick.duration-.05){assert(remote.character.isTricking);assert.equal(remote.character.activeAction.getClip().name,key==='front'?'airTrick':'fallIdle');}
          if(time>trick.duration+.05)assert(!remote.character.isTricking);
          for(const b of Object.values(remote.character.bones))assert(Math.abs(b.quaternion.length()-1)<1e-4);frames++;
        }
      }return {tricks:Object.keys(AIR_TRICKS).length,frames};}finally{remote.dispose();disposeRig(source);}
    });
  }
  for(const fps of fpsList)check(`${fps}fps every directed clip pair can reverse mid-blend without a pose snap`,()=>{
    const c=actor();let cases=0,maxError=0;try{for(const from of clips)for(const to of clips){
      c.stopAnimation();c.fadeToAction(from.key,0);c.mixer.update(Math.min(.2,from.clip.duration*.4));c.fadeToAction(to.key,.18);c.mixer.update(1/fps);
      const before=landmarks(c);c.fadeToAction(from.key,.18);c.mixer.update(0);
      const error=Math.max(...landmarks(c).map((p,i)=>p.distanceTo(before[i])));maxError=Math.max(maxError,error);
      assert(error<1e-4,`${from.key} → ${to.key} → ${from.key}: ${(error*1000).toFixed(1)}mm instantaneous displacement`);
      c.mixer.update(.3);assert(c.activeAction.getEffectiveWeight()>.99);cases++;
    }return {cases,maxDiscontinuity:maxError};}finally{disposeRig(c);}
  });
}
fs.writeFileSync(folder+'/all-motion-results.json',JSON.stringify({fps:fpsList,registered:MOTIONS.length,embedded:clips.filter(c=>c.key==='default').length,archivedCompiled:clips.filter(c=>c.archived).map(c=>c.key),results},null,2)+'\n');
const failed=results.filter(r=>r.status==='FAIL').length;console.log(`Complete motion review: ${results.length-failed} passed, ${failed} failed.`);if(failed)process.exitCode=1;
