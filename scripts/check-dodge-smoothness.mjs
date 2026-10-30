import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {loadMotionRig,point,disposeRig} from './lib/motion-rig.mjs';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {CombatSystem} from '../src/Combat.js';
import {City} from '../src/City.js';
const folder='docs/qa/dodge-smoothness-2026-10-30';fs.mkdirSync(folder,{recursive:true});
const {actor}=await loadMotionRig(),results=[];
for(const fps of [30,60,144])for(const movement of ['idle','walk','sprint'])for(const side of ['left','right']){
 const moving=movement!=='idle';
 const c=actor(),city={colliders:[],buildingMeshes:[],raycast:City.prototype.raycast,checkCollision:City.prototype.checkCollision};
 const p=new SwingPhysics(c.scene,city,c,new Proxy({},{get:()=>()=>{}})),combat=new CombatSystem(c.scene,p,c),camera=new T.PerspectiveCamera();
 camera.userData.movementYaw=0;p.position.set(0,.1,0);p.previousFixedPosition.copy(p.position);p.renderPosition.copy(p.position);p.state='IDLE';
 const input={forward:moving,sprint:movement==='sprint',combatStance:true};combat.toggle(input);const dt=1/fps;
 const tick=()=>{combat.before(dt,camera,input);p.update(dt,input,camera);combat.after(dt);};
 try{
  for(let i=0;i<fps*.6;i++)tick();
  let maxIdleClock=0,maxFootStep=0,previous=point(c,'leftfoot'),maxSpeedDrop=0,peakFrame=null;
  for(let repeat=0;repeat<2;repeat++){
   assert(combat.dodge({[side]:true},camera));
   for(let i=0;i<Math.ceil(fps*.65);i++){
    const before=p.velocity.clone();tick();
    if(combat.action?.key.startsWith('dodge')&&c.activeAction===c.actions.combatIdle)maxIdleClock=Math.max(maxIdleClock,c.activeAction.time);
    const foot=point(c,'leftfoot');if(foot.distanceTo(previous)>maxFootStep){maxFootStep=foot.distanceTo(previous);peakFrame={repeat,i,key:combat.action?.key,time:combat.action?.time,carrier:c.activeAction.getClip().name,carrierTime:c.activeAction.time,settle:c.reactSettle,speed:p.velocity.length()};}previous=foot;
    maxSpeedDrop=Math.max(maxSpeedDrop,before.clone().sub(p.velocity).setY(0).length());
    assert([...p.position,...p.velocity,...foot].every(Number.isFinite));
   }
  }
  results.push({fps,movement,side,maxIdleClock,maxFootStep,maxSpeedDrop,peakFrame});
  assert(maxIdleClock<.001,`Dodge scrubs the 4.4s idle clip in 0.38s: ${JSON.stringify(results.at(-1))}`);
  // Even at 30 FPS a slip must not discard half the incoming run speed.
  // Render frames can contain zero or two 120Hz steps, so use a velocity
  // jump bound rather than dividing a sampled jump by one render interval.
  assert(maxSpeedDrop<(movement==='sprint'?3.3:moving?2.2:.5),`Dodge abruptly replaces momentum: ${JSON.stringify(results.at(-1))}`);
  assert(side==='left'?p.position.x>.1:p.position.x<-.1,'Dodge moves to the wrong side');
  assert(maxFootStep/dt<10+(movement==='sprint'?6.5:moving?4.4:0),`Dodge teleports a foot: ${JSON.stringify(results.at(-1))}`);
 }finally{disposeRig(c);fs.writeFileSync(folder+'/motion.json',JSON.stringify(results,null,2));}
}
console.log(`PASS ${results.length} integrated combat/physics/rig dodge cases: repeated left/right, idle/walk/sprint, 30/60/144 FPS`);
