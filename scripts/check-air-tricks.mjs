import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AIR_TRICKS, selectAirTrick, trickRotation } from '../src/AirTricks.js';
import { SwingPhysics } from '../src/SwingPhysics.js';
import { Character } from '../src/Character.js';
import { sanitizePose, capturePose } from '../src/RemoteMotion.js';

assert.equal(selectAirTrick(), 'front');
for (const [input,key] of [[{forward:true},'front'],[{backward:true},'front'],[{left:true},'front'],[{right:true},'front'],[{sprint:true,forward:true},'front']]) assert.equal(selectAirTrick(input),key);
function fixture() {
  const c=Object.create(Character.prototype);
  const model=new THREE.Group(),mixer=new THREE.AnimationMixer(model);
  Object.assign(c,{model,mixer,group:new THREE.Group(),actions:{},bones:{},bodyPitch:0,targetFacingAngle:0,idleTime:0,webShotTimer:0,contactTime:10,
    updateWeb(){},plantIdleFeet(){}});
  c.group.add(model);
  const p=new SwingPhysics(new THREE.Scene(),{buildingMeshes:[],colliders:[],getRooftopSpawn:()=>new THREE.Vector3(0,95,0)},c,{playTrickSound(){}});
  p.position.y=60;p.state='FALLING';
  return {c,p};
}
for (const fps of [30,60,144]) for(const key of Object.keys(AIR_TRICKS)) {
  const {c,p}=fixture();let rewards=0,completed=0;p.onStuntCallback=(_name,points)=>{if(points>0)rewards++;};c.onAirTrickComplete=()=>completed++;
  const before=p.velocity.clone();assert(p.performAirTrick(key));assert.equal(p.stuntScore,0);
  assert(!p.performAirTrick(key),'Cannot spam a running trick');
  for(let frame=0;frame<Math.ceil(AIR_TRICKS[key].duration*fps)+2;frame++) {
    c.update(1/fps,'FALLING',new THREE.Vector3(0,-3,0));
    assert(c.model.quaternion.toArray().every(Number.isFinite));
    assert(Math.abs(c.model.quaternion.length()-1)<1e-6);
  }
  assert.equal(completed,1);assert.equal(rewards,0);assert.equal(p.stuntScore,0);
  assert.equal(c.isTricking,false);assert(Math.abs(c.model.rotation.x)<1e-6);assert(Math.abs(c.model.rotation.z)<1e-6);
  assert(p.velocity.equals(before),'A visual trick cannot change momentum');
  const angles=trickRotation(key,AIR_TRICKS[key].duration);
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(angles.x,angles.y,angles.z,'YXZ'));
  assert(q.angleTo(new THREE.Quaternion())<1e-6);
}
const {c,p}=fixture();
for(const state of ['IDLE','SWINGING','WALL_RUNNING','MANTLING','WEB_ZIP']) {p.state=state;assert(!p.performAirTrick());}
p.state='FALLING';c.contactTime=.3;assert(!p.performAirTrick('cork'));
c.contactTime=10;assert(!p.performAirTrick('toString'));
assert(p.performAirTrick('front'));c.update(.2,'FALLING',p.velocity);c.update(.1,'LANDING',p.velocity);assert.equal(p.stuntScore,0);assert.equal(c.airTrick,null);
assert(p.performAirTrick('front'));c.update(.2,'FALLING',p.velocity);c.update(.1,'SWINGING',p.velocity);assert.equal(p.stuntScore,0);
function finish(key){assert(p.performAirTrick(key));c.update(AIR_TRICKS[key].duration+.01,'FALLING',p.velocity);}
finish('front');let score=p.stuntScore;finish('front');assert.equal(p.stuntScore-score,0);
for(const key of ['left','right','spin','cork'])assert(!p.performAirTrick(key));
assert(p.performAirTrick('front'));
const pose=capturePose(p,c);assert.equal(pose.airTrick.key,'front');
assert.equal(sanitizePose({...pose,airTrick:{key:'toString',elapsed:0}}).airTrick,null);
assert.equal(sanitizePose({...pose,airTrick:{key:'front',elapsed:NaN}}).airTrick,null);
p.resetPosition();assert.equal(c.airTrick,null);assert.equal(p.airTrickChain.size,0);
console.log('Air tricks: Front and back flips at 30/60/144 FPS, exactly-once completion without points, interruptions, selection, repeats and pose validation passed.');
