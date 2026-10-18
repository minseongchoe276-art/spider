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
 const guard=sample(c,'rightHook',0),load=sample(c,'rightHook',.28),contact=sample(c,'rightHook',.58),follow=sample(c,'rightHook',.73),recover=sample(c,'rightHook',.999999);
 const elbow=point(c,'rightarm');sample(c,'rightHook',.58);
 const bend=point(c,'rightarm').sub(contact.elbow).angleTo(contact.right.clone().sub(contact.elbow))*180/Math.PI;
 assert(bend>75&&bend<115,`Hook elbow must remain near 90 degrees: ${bend}`);
 assert(load.right.x<guard.right.x-.15 && contact.right.x>load.right.x+.35,'Hook must arc from outside across the target');
 assert(follow.right.x>contact.right.x+.08,'Hook must follow through instead of retracing the approach');
 assert(contact.left.distanceTo(guard.left)<.03,'Opposite hand must protect the cheek');
 assert(recover.right.distanceTo(guard.right)<.01,'Hook must return to guard');
 const ready=sample(c,'special',0),wind=sample(c,'special',.28),high=sample(c,'special',.4),hit=sample(c,'special',.5),finish=sample(c,'special',.64);
 assert(wind.right.y<ready.right.y-.12 && wind.right.z<ready.right.z-.08,'G must visibly load low and back');
 assert(high.right.y>hit.right.y+.08 && finish.right.y<hit.right.y-.08,'Overhand must travel over and down through contact');
 assert(hit.right.z>ready.right.z+.4 && hit.left.distanceTo(ready.left)<.15,'G must strike with the rear hand and retain the lead guard');
 assert(ATTACKS.special.from<=.5*ATTACKS.special.duration && ATTACKS.special.to>=.5*ATTACKS.special.duration);
 assert(ATTACKS.special.from>.4,'G wind-up must not deal damage');
 assert(ATTACKS.special.damage>ATTACKS.cross.damage && ATTACKS.special.damage>ATTACKS.jab.damage);
 results.push({case:'distinct hook and overhand trajectories',hookElbowDegrees:bend,pass:true});
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
  const clip=c.actions[key==='cross'?'rightHook':key].getClip();
  c.combatAction={id:1,key,time:ATTACKS[key].duration*clip.userData.impactPhase,duration:ATTACKS[key].duration};
  for(let i=0;i<30;i++)c.update(1/60,'IDLE',new THREE.Vector3());
  const tilt={};for(const side of ['left','right']){
   const level=c.model.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().fromArray(c.actions.wall.getClip().userData.soleRotations[side]));
   tilt[side]=level.angleTo(joint(c,side+'foot').getWorldQuaternion(new THREE.Quaternion()))*180/Math.PI;
   assert(tilt[side]<5,`${key}: ${side} supporting boot points down (${tilt[side]} degrees)`);
  }
  results.push({case:key+' contact boots remain level',tiltDegrees:tilt,pass:true});
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
console.log(`PASS ${results.length} combat quality cases: curved right hook, loaded rear overhand, contact timing, running/sprinting at 24/60/144 FPS, bounded rendered joints`);
