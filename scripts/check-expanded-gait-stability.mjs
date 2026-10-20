import assert from 'node:assert/strict';import fs from 'node:fs';import * as T from 'three';import {loadMotionRig,disposeRig} from './lib/motion-rig.mjs';
const {actor}=await loadMotionRig(),results=[];const folder='docs/qa/expanded-motion-2026-10-19';
for(const fps of [24,30,60,144]){
 const c=actor();try{let changes=0,last=null,frames=0;const sample=speed=>{c.group.position.z+=speed/fps;c.update(1/fps,'RUNNING',new T.Vector3(0,0,speed));const key=c.activeAction.getClip().name;if(last&&last!==key)changes++;last=key;frames++;return key;};
 for(let i=0;i<fps;i++)sample(4.8);assert.equal(last,'regularRun');const before=changes;
 for(let i=0;i<fps*2;i++)sample(i%2?3.22:2.98);
 assert.equal(changes,before,'Near-threshold speeds switched gait every frame');
 for(let i=0;i<fps;i++)sample(1.6);assert.equal(last,'walk','Sustained slowdown never selected walking');assert.equal(changes,before+1);
 for(let i=0;i<fps;i++)sample(4.8);assert.equal(last,'regularRun','Sustained acceleration never selected running');assert.equal(changes,before+2);
 // Repeated one-frame collision stalls must not restart the running take.
 for(let i=0;i<fps*2;i++)sample(i%7===0?1.5:4.8);assert.equal(changes,before+2,'A single-frame riser collision restarted walking');
 results.push({fps,pass:true,frames,changes});console.log('PASS gait hysteresis',fps);
 }catch(e){results.push({fps,pass:false,error:e.message});console.error('FAIL',fps,e.message);}finally{disposeRig(c);}
}
fs.writeFileSync(folder+'/gait-stability-results.json',JSON.stringify({cases:results.length,failed:results.filter(r=>!r.pass).length,results},null,2)+'\n');if(results.some(r=>!r.pass))process.exitCode=1;
