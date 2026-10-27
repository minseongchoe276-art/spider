import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {loadMotionRig,point,disposeRig} from './lib/motion-rig.mjs';
const {actor}=await loadMotionRig(),results=[];
for(const fps of [24,60,144])for(const yaw of [0,Math.PI/2,Math.PI]){
 const c=actor();c.targetFacingAngle=c.visualYaw=yaw;c.group.position.y=10;c.groundProbe=()=>null;
 let minHeight=Infinity;
 try{
  // Real state selection: do not force an action or its sampling clock.
  for(let i=0;i<Math.ceil(fps*.2);i++){
   c.update(1/fps,'FALLING',new T.Vector3(0,-2,0));
   assert.equal(c.activeAction,c.actions.drop);
   const height=point(c,'head').y-Math.min(point(c,'leftfoot').y,point(c,'rightfoot').y);
   minHeight=Math.min(minHeight,height);
   assert(height>1.2,'Ledge fall replayed a grounded crouch/takeoff');
  }
  for(let i=0;i<Math.ceil(fps*.1);i++)c.update(1/fps,'FALLING',new T.Vector3(0,-15,0));
  assert.equal(c.activeAction,c.actions.fall);
  assert(point(c,'head').y>point(c,'hips').y+.2,'Fast fall pitched into a forward tumble');
  results.push({fps,yaw,minimumHeadToFeet:minHeight,pass:true});
 }finally{disposeRig(c);}
}
fs.writeFileSync('docs/qa/individual-motions-2026-10-21/drop-motion.json',JSON.stringify({passed:results.length,results},null,2)+'\n');console.log('PASS',results.length,'ledge exits avoid ground anticipation and enter fast fall');
