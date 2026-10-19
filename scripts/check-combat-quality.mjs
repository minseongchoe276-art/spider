import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {loadMotionRig,point,joint,disposeRig} from './lib/motion-rig.mjs';
import {ATTACKS,CombatSystem} from '../src/Combat.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {City} from '../src/City.js';
const {actor}=await loadMotionRig(),results=[];
const sample=(c,key,phase)=>{c.stopAnimation();c.fadeToAction(key,0);c.activeAction.time=c.activeAction.getClip().duration*phase;c.mixer.update(0);c.group.updateMatrixWorld(true);return {left:point(c,'lefthand'),right:point(c,'righthand'),elbow:point(c,'rightforearm')};};
const c=actor();try{
 for(const [key,file] of [['jab','Lead Jab'],['cross','Cross Punch'],['special','Cross Punch']]){
  const clip=c.actions[key].getClip();
  assert.equal(clip.userData.source,`/models/${file}.fbx`);
  assert.equal(clip.userData.authoredMixamo,true);
  assert.equal(clip.userData.choreography,undefined,'Basic punches must retain imported body motion');
  const impact=clip.userData.impactPhase*ATTACKS[key].duration;
  assert(impact>=ATTACKS[key].from && impact<=ATTACKS[key].to,'Imported punch must match damage timing');
 }
 const guard=sample(c,'rightHook',0),load=sample(c,'rightHook',.28),contact=sample(c,'rightHook',.58),follow=sample(c,'rightHook',.73),recover=sample(c,'rightHook',.999999);
 const elbow=point(c,'rightarm');sample(c,'rightHook',.58);
 const bend=point(c,'rightarm').sub(contact.elbow).angleTo(contact.right.clone().sub(contact.elbow))*180/Math.PI;
 assert(bend>75&&bend<115,`Hook elbow must remain near 90 degrees: ${bend}`);
 assert(load.right.x<guard.right.x-.15 && contact.right.x>load.right.x+.35,'Hook must arc from outside across the target');
 assert(follow.right.x>contact.right.x+.08,'Hook must follow through instead of retracing the approach');
 assert(contact.left.distanceTo(guard.left)<.03,'Opposite hand must protect the cheek');
 assert(recover.right.distanceTo(guard.right)<.01,'Hook must return to guard');
 const impact=c.actions.special.getClip().userData.impactPhase;
 const ready=sample(c,'special',0),wind=sample(c,'special',.3),hit=sample(c,'special',impact),recoverPower=sample(c,'special',.999999);
 assert(wind.right.z<ready.right.z-.15,'G must visibly load the rear hand before contact');
 assert(hit.right.z>ready.right.z+.5 && hit.left.y>1.4,'G must drive a rear straight while retaining the lead guard');
 assert(hit.right.y<1.75,'G must not throw the old high overhand arc');
 assert(recoverPower.right.distanceTo(ready.right)<.02,'G must recover to its starting guard');
 assert(ATTACKS.special.from<=impact*ATTACKS.special.duration && ATTACKS.special.to>=impact*ATTACKS.special.duration);
 assert(ATTACKS.special.from>.4,'G wind-up must not deal damage');
 assert(ATTACKS.special.damage>ATTACKS.cross.damage && ATTACKS.special.damage>ATTACKS.jab.damage);
 results.push({case:'imported rear power cross and retained hook',hookElbowDegrees:bend,pass:true});
}finally{disposeRig(c);}
for(const fps of [24,60,144])for(const key of ['jab','cross','special'])for(const sprint of [false,true]){
 const c=actor(),city={colliders:[],buildingMeshes:[],raycast:City.prototype.raycast,checkCollision:City.prototype.checkCollision};
 const p=new SwingPhysics(c.scene,city,c,new Proxy({},{get:()=>()=>{}})),combat=new CombatSystem(c.scene,p,c),camera=new THREE.PerspectiveCamera();camera.lookAt(0,0,1);camera.updateMatrixWorld(true);
 p.position.set(0,.1,0);p.previousFixedPosition.copy(p.position);p.renderPosition.copy(p.position);p.state='IDLE';
 try{
  // Establish a moving guard before entering the strike, as during real play.
  for(let i=0;i<fps;i++){combat.before(1/fps,camera);p.update(1/fps,{forward:true,sprint},camera);combat.after(1/fps);}
  const start=p.position.clone();assert(({jab:()=>combat.attack(camera),cross:()=>combat.straight(camera),special:()=>combat.special(camera)})[key]());
  let active=0,maxStep=0,last=null;
  for(let i=0;i<Math.ceil(fps*ATTACKS[key].duration);i++){
   combat.before(1/fps,camera);p.update(1/fps,{forward:true,sprint},camera);combat.after(1/fps);
   if(combat.action)active++;
   const hand=point(c,key==='jab'?'lefthand':'righthand').sub(c.group.position);
   if(last)maxStep=Math.max(maxStep,hand.distanceTo(last));last=hand;
   for(const {bone,rest,limit} of c.jointConstraints)assert(rest.angleTo(bone.quaternion)<=limit+1e-5,'Rendered joint exceeded anatomical bounds');
  }
  const travel=p.position.distanceTo(start);assert(travel>ATTACKS[key].duration*3,'Attack stalled movement');
  assert(active>fps*ATTACKS[key].duration*.7);assert(maxStep<25/fps,`Visible hand snapped: ${maxStep}m at ${fps}fps`);
  results.push({fps,key,sprint,travel,maxHandStep:maxStep,pass:true});
 }finally{disposeRig(c);}
}
for(const key of ['jab','cross','special']){
 const c=actor();try{
  const clip=c.actions[key].getClip();
  c.combatAction={id:1,key,time:ATTACKS[key].duration*clip.userData.impactPhase,duration:ATTACKS[key].duration};
  for(let i=0;i<30;i++)c.update(1/60,'IDLE',new THREE.Vector3());
  const tilt={};for(const side of ['left','right']){
   const level=c.model.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().fromArray(c.actions.wall.getClip().userData.soleRotations[side]));
   const normal=new THREE.Vector3(0,1,0).applyQuaternion(level.clone().invert()).applyQuaternion(joint(c,side+'foot').getWorldQuaternion(new THREE.Quaternion()));
   tilt[side]=normal.angleTo(new THREE.Vector3(0,1,0))*180/Math.PI;
   assert(tilt[side]<(clip.userData.authoredMixamo?35:5),`${key}: ${side} supporting boot points down (${tilt[side]} degrees)`);
  }
  results.push({case:key+' contact boots retain bounded authored pivot',tiltDegrees:tilt,pass:true});
 }finally{disposeRig(c);}
}
// Moving between attacks must retain the same closed guard as combat idle.
{
 const c=actor();try{
  const camera=new THREE.PerspectiveCamera();c.setFirstPersonCamera(camera);c.setFirstPersonMode(true);c.combatStance=true;
  c.update(1/60,'RUNNING',new THREE.Vector3(0,0,4.4));
  const fingers=c.firstPersonRig.children.flatMap(arm=>arm.userData.hand.rig[arm.userData.side].map(item=>item.bone));
  const moving=fingers.map(bone=>bone.quaternion.clone());
  c.combatAction={key:'combatIdle'};c.update(1/60,'RUNNING',new THREE.Vector3(0,0,4.4));
  assert(fingers.every((bone,i)=>moving[i].angleTo(bone.quaternion)<1e-5),'Moving guard opened between punches');
  c.combatAction=null;c.combatStance=false;c.update(1/60,'RUNNING',new THREE.Vector3(0,0,4.4));
  assert(fingers.some((bone,i)=>moving[i].angleTo(bone.quaternion)>.1),'Leaving combat did not release the finger guard');
  results.push({case:'first-person moving guard stays closed between attacks',pass:true});
 }finally{disposeRig(c);}
}
// Exercise the live callback wiring: swing/flip/landing must never bank points.
const {PlayerExperience}=await import('../src/PlayerExperience.js');
const oldDocument=globalThis.document,oldWindow=globalThis.window;
try{
 globalThis.document={getElementById:()=>null};globalThis.window={addEventListener(){}};
 const notices=[],game={scene:new THREE.Scene(),physics:{},character:{},combat:{},city:{},audio:{playSurfaceStep(){}},showNotice:m=>notices.push(m)};
 const experience=new PlayerExperience(game,{getItem:()=>null,setItem(){}});
 game.physics.onStuntCallback('스윙 연결',80);game.character.onAirTrickComplete('front');game.physics.onLanding(new THREE.Vector3(),10);
 assert.equal(game.progression.data.score,0);assert.equal(experience.stunts,undefined);assert.equal(notices.length,0);
 game.physics.onStuntCallback('이동 안내',0);assert.deepEqual(notices,['이동 안내']);
 results.push({case:'swing, trick and landing callbacks cannot score or show combo notices',pass:true});
}finally{globalThis.document=oldDocument;globalThis.window=oldWindow;}
const folder='docs/qa/combat-quality-2026-10-18';fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(folder+'/results.json',JSON.stringify(results,null,2)+'\n');
console.log(`PASS ${results.length} combat quality cases: curved right hook, imported rear power cross, contact timing, running/sprinting at 24/60/144 FPS, bounded rendered joints`);
