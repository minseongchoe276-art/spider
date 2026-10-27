import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ATTACKS,CombatSystem} from '../src/Combat.js';
import {SwingPhysics} from '../src/SwingPhysics.js';
const scene=new THREE.Scene(),character={group:new THREE.Group(),targetFacingAngle:0},camera=new THREE.PerspectiveCamera();camera.lookAt(0,0,1);
let releases=0;const physics={position:new THREE.Vector3(0,0.1,0),velocity:new THREE.Vector3(),state:'IDLE',facingAngle:0,city:{colliders:[],raycast:()=>null},clearWebAnchor(){releases++;},clearPendingInput(){}};
const c=new CombatSystem(scene,physics,character),enemy=(x=0,z=1.8)=>({position:new THREE.Vector3(x,0.1,z),health:65,mesh:new THREE.Group(),body:new THREE.Mesh(new THREE.SphereGeometry(),new THREE.MeshStandardMaterial()),ring:new THREE.Group(),spawn:new THREE.Vector3(),cooldown:10,windup:0,flash:0,stagger:0});
let checks=0;function check(label,fn){fn();checks++;console.log('PASS COMBAT: '+label);}
check('Web is default; Q selects human combat and disables grounded web entry points',()=>{
 assert.equal(c.mode,'web');assert.equal(physics.webEnabled,true);assert.equal(character.combatStance,false);
 c.toggle();releases=0;assert.equal(c.mode,'combat');assert.equal(character.combatStance,true);assert.equal(physics.webEnabled,false);
 for(const name of ['startSwing','performWebPull','performAirJump'])assert.equal(SwingPhysics.prototype[name].call(physics,camera),false);
});
check('Toggle clears held fire and guard and releases with velocity preserved',()=>{
 const input={webTap:true,webFireHeld:true,webHold:true};physics.velocity.set(1,2,3);c.toggle(input);assert.equal(c.mode,'web');assert(physics.webEnabled);assert(!input.webTap&&!input.webHold&&!input.webFireHeld);
 assert(!c.attack(camera));assert(!c.heavy(camera));assert(!c.dodge({left:true},camera));c.guard(true);assert(!c.blocking);
 c.toggle(input);assert.equal(c.mode,'combat');assert.equal(releases,1);assert.deepEqual(physics.velocity.toArray(),[1,2,3]);
});
check('Left jab and right straight are distinct, grounded, guarded strikes',()=>{
 c.enemies=[];assert(c.attack(camera));assert.equal(c.action.key,'jab');c.before(0.4,camera);
 assert.equal(c.straight(camera),false);assert.equal(c.action.key,'jab');
 while(c.action)c.before(0.05,camera);assert.equal(c.action,null);
 assert(c.straight(camera));assert.equal(c.action.key,'cross');assert.equal(c.stamina,89);
 assert.equal(c.attack(camera),false);c.cancel();
 c.guard(true);assert.equal(c.straight(camera),false);c.guard(false);
 physics.state='FALLING';assert.equal(c.straight(camera),false);physics.state='IDLE';
 c.stamina=6;assert.equal(c.straight(camera),false);c.stamina=100;
 assert(c.heavy(camera));assert.equal(c.action.key,'heavy');
 c.before(0.4,camera);assert.equal(c.attack(camera),false);assert.equal(c.action.key,'heavy');c.cancel();
});
check('Damage has an active window and happens only once per target',()=>{
 physics.facingAngle=0;const e=enemy();c.enemies=[e];c.start('jab',ATTACKS.jab.duration,null);c.before(0.1);c.strike(c.action,{damage:12,reach:2.3});assert.equal(e.health,53);
 c.strike(c.action,{damage:12,reach:2.3});assert.equal(e.health,53);c.cancel();e.health=65;
 c.start('jab',ATTACKS.jab.duration,null);c.action.time=0.05;c.after(0);assert.equal(e.health,65);c.action.previous=0.05;c.action.time=0.18;c.after(0);assert.equal(e.health,53);
});
check('A wall, wrong height or rear position blocks an attack',()=>{
 for(const [pos,wall] of [[new THREE.Vector3(0,.1,-2),false],[new THREE.Vector3(0,5,2),false],[new THREE.Vector3(0,.1,2),true]]) {
  const e=enemy();e.position=pos;c.enemies=[e];physics.city.raycast=()=>wall?{}:null;c.strike({hits:new Set()},{damage:12,reach:2.5});assert.equal(e.health,65);
 }
 physics.city.raycast=()=>null;c.cancel();
});
check('Frontal guard spends stamina; rear attacks hurt; dodge grants temporary protection',()=>{
 physics.facingAngle=0;c.enemies=[];c.stamina=100;c.guard(true);const hp=c.health;assert.equal(c.receiveDamage(10,enemy()),4);assert.equal(c.health,hp-4);assert.equal(c.stamina,88);assert(c.blocking);
 assert.equal(c.receiveDamage(10,enemy(0,-2)),10);c.cancel();c.invulnerable=0;c.stamina=100;
 assert(c.dodge({left:true},camera));assert.equal(c.action.key,'dodgeLeft');assert.equal(c.receiveDamage(10,enemy()),0);c.cancel();
});
check('Every directional dodge uses its own take and stamina blocks spam',()=>{
 for(const [i,key] of [[{left:true},'dodgeLeft'],[{right:true},'dodgeRight'],[{forward:true},'dodgeForward'],[{},'dodgeBack']]) {
  c.cancel();c.stamina=100;assert(c.dodge(i,camera));assert.equal(c.action.key,key);assert(c.action.direction.toArray().every(Number.isFinite));assert(!c.dodge(i,camera));
 }
 c.cancel();c.stamina=0;assert(!c.dodge({},camera));assert(!c.heavy(camera));
});
check('Dashing uppercut loads before contact, respects cooldown and deals one heavy hit',()=>{
 c.cancel();c.stamina=100;c.specialCooldown=0;physics.state='IDLE';const e=enemy(0,1.8);e.health=100;c.enemies=[e];
 assert(c.special(camera));assert.equal(c.action.key,'special');assert.equal(c.stamina,65);assert.equal(c.specialCooldown,8);
 c.action.previous=0;c.action.time=.3;c.after(0);assert.equal(e.health,100,'Wind-up must not deal damage');
 c.action.previous=.3;c.action.time=(ATTACKS.special.from+ATTACKS.special.to)/2;c.after(0);assert.equal(e.health,52);c.after(0);assert.equal(e.health,52);
 c.cancel();assert(!c.special(camera));for(let i=0;i<81;i++)c.before(.1,camera);assert(c.special(camera));c.cancel();
});
check('Heavy is grounded and does not force an airborne dive',()=>{
 c.cancel();c.stamina=100;c.enemies=[];physics.state='FALLING';physics.velocity.y=-3;
 assert.equal(c.heavy(camera),false);assert.equal(c.action,null);assert.equal(physics.velocity.y,-3);assert.equal(c.stamina,100);
 physics.state='IDLE';assert(c.heavy(camera));assert.equal(c.action.key,'heavy');c.cancel();
});
check('No training drone factory remains; reset clears transient combat state',()=>{
 assert.equal(c.spawnTraining,undefined);c.cancel();c.stamina=100;c.attack(camera);physics.onReset();assert.equal(c.action,null);assert.equal(c.health,100);assert.equal(c.stamina,100);assert.equal(c.enemies.length,0);
});
check('Combat stance waits until movement stopping animation completes',()=>{
 c.cancel();physics.state='IDLE';physics.velocity.set(0,0,0);character.lastState='RUNNING';c.before(1/60,camera);assert.equal(character.combatAction,null);
 character.lastState='IDLE';character.actions={stop:{}};character.activeAction=character.actions.stop;character.activeAction.time=.1;character.activeAction.getClip=()=>({duration:.5});c.before(1/60,camera);assert.equal(character.combatAction,null);
 character.activeAction.time=.5;c.before(1/60,camera);assert.equal(character.combatAction.key,'combatIdle');
});
console.log(`PASS: ${checks} combat scenarios`);
