import assert from 'node:assert/strict';
import * as T from 'three';
import {CombatSystem} from '../src/Combat.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {loadMotionRig,disposeRig} from './lib/motion-rig.mjs';
const {actor}=await loadMotionRig(),camera=new T.PerspectiveCamera();camera.userData.movementYaw=0;
let cases=0;
for(const fps of [24,60,144])for(const stance of ['crouch','prone'])for(const method of ['attack','straight','heavy','special','dodge']){
 const c=actor(),p=new SwingPhysics(c.scene,{colliders:[],buildingMeshes:[],checkCollision:()=>({collided:false})},c,new Proxy({},{get:()=>()=>{}}));
 p.position.set(0,.1,0);p.renderPosition.copy(p.position);p.previousFixedPosition.copy(p.position);p.state='IDLE';
 const combat=new CombatSystem(c.scene,p,c);combat.toggle();let notifications=0;combat.onDeferredStrike=()=>notifications++;
 const dt=1/fps,tick=()=>{combat.before(dt,camera,{});p.update(dt,{},camera);combat.after(dt);};
 try{
  p.toggleLowStance(stance);for(let i=0;i<fps;i++)tick();
  const stamina=combat.stamina;
  assert.equal(method==='dodge'?combat.dodge({},camera):combat[method](camera),false);
  assert.equal(combat.stamina,stamina,'Standing charged stamina before attack');
  assert.equal(combat.action,null,'Attack began while prone/crouched');
  let fired=false;
  for(let i=0;i<fps*1.1;i++){
   tick();if(combat.action){
    assert(c.crouchBlend+c.proneBlend<.001,'Strike hitbox started before standing pose');fired=true;break;
   }
  }
  assert(fired,`${stance} -> ${method} did not start after standing`);
  assert.equal(notifications,method==='dodge'?0:1,'Deferred online notification count');
  combat.cancel();p.toggleLowStance(stance);for(let i=0;i<fps;i++)tick();combat.attack(camera);combat.clearHeld();
  for(let i=0;i<fps;i++)tick();assert.equal(combat.action,null,'Paused/cleared input fired a stale attack');
  cases++;
 }finally{disposeRig(c);}
}
console.log(`PASS ${cases} actual controller cases: stand before attack/dodge, no early damage or stamina cost, one network callback, pause cancellation at 24/60/144 FPS`);
