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
