import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CombatSystem,FIREARMS,ATTACKS} from '../src/Combat.js';

for(const fps of [24,60,144])for(const type of ['pistol','sniper-rifle']){
 const physics={state:'IDLE',position:new THREE.Vector3(),velocity:new THREE.Vector3(),facingAngle:0,city:{raycast:()=>null}};
 const character={};const target={position:new THREE.Vector3(0,0,6),health:1000};
 const combat=new CombatSystem(new THREE.Scene(),physics,character,{getTargets:()=>[target]});
 combat.mode='combat';combat.gunEquipped=true;combat.extraWeapon=type==='sniper-rifle'?type:null;
 const tick=seconds=>{for(let t=0;t<seconds;t+=1/fps){combat.before(1/fps,null,{});combat.after(1/fps);}};
 for(let i=0;i<FIREARMS[type].capacity;i++){
  assert(combat.attack());tick(ATTACKS.gunFire.duration+.05);
  assert.equal(target.health,1000-(i+1)*ATTACKS.gunFire.damage);
 }
 assert.equal(combat.magazines[type],0);assert.equal(combat.attack(),false);
 assert(combat.reload());tick(FIREARMS[type].reload/2);assert.equal(combat.magazines[type],0);
 combat.cancel();tick(FIREARMS[type].reload);assert.equal(combat.magazines[type],0,'cancelled reload must not refill');
 assert(combat.reload());tick(FIREARMS[type].reload+.1);assert.equal(combat.magazines[type],FIREARMS[type].capacity);
 assert.equal(combat.reload(),false,'full magazine must not reload');
 assert(combat.attack());tick(.5);assert.equal(combat.magazines[type],FIREARMS[type].capacity-1);
 assert(combat.reload());physics.state='JUMPING';tick(.1);assert.equal(combat.action,null);assert.equal(combat.magazines[type],FIREARMS[type].capacity-1);
 physics.state='IDLE';tick(.1);physics.city.raycast=()=>({});const hp=target.health;assert(combat.attack());tick(.5);assert.equal(target.health,hp,'walls block shots');
 console.log(`PASS ${type} ${fps}fps: damage, empty, reload, interruptions and obstruction`);
}

// A missed shot cannot hit a target that moves into the cone later in its active window.
{
 const physics={state:'IDLE',position:new THREE.Vector3(),velocity:new THREE.Vector3(),facingAngle:0,city:{raycast:()=>null}};
 const target={position:new THREE.Vector3(3,0,6),health:100};
 const combat=new CombatSystem(new THREE.Scene(),physics,{}, {getTargets:()=>[target]});
 combat.mode='combat';combat.gunEquipped=true;assert(combat.attack());
 combat.before(.08,null,{});combat.after(.08);target.position.x=0;
 combat.before(.03,null,{});combat.after(.03);
 assert.equal(target.health,100,'a missed shot must not be re-evaluated');
 console.log('PASS misses resolve once even when a target enters the cone later');
}

// Once the trigger has fired, interrupting the pose must not erase the shot.
for(const state of ['JUMPING','FALLING','ROLLING']){
 const physics={state:'IDLE',position:new THREE.Vector3(),velocity:new THREE.Vector3(),facingAngle:0,city:{raycast:()=>null}};
 const target={position:new THREE.Vector3(0,0,6),health:100};let shots=0;
 const combat=new CombatSystem(new THREE.Scene(),physics,{}, {getTargets:()=>[target],audio:{playGunshot:()=>shots++}});
 combat.mode='combat';combat.gunEquipped=true;assert(combat.attack());
 assert.equal(target.health,78,'hitscan must resolve with the shot sound');
 physics.state=state;combat.before(1/60,null,{});combat.after(1/60);
 assert.equal(shots,1);assert.equal(combat.magazines.pistol,11);assert.equal(target.health,78);
}
console.log('PASS fired shots survive jump, fall and roll interruptions without duplicate damage');
