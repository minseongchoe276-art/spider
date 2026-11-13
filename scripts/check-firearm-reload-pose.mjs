import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadMotionRig,point,disposeRig} from './lib/motion-rig.mjs';
import {FIREARMS} from '../src/Combat.js';
const {actor}=await loadMotionRig();
for(const type of ['pistol','sniper-rifle'])for(const fps of [24,60,144]){
 const c=actor();try{
  const weapon=new THREE.Group();c.rightHand.add(weapon);
  if(type==='pistol')c.gunModel=weapon;else {c.extraWeapon=type;c.extraWeaponVisible=true;c.extraWeapons={[type]:weapon};}
  c.gunVisible=true;c.combatStance=true;
  for(let i=0;i<fps;i++){c.combatAction={key:'gunIdle'};c.update(1/fps,'IDLE',new THREE.Vector3(),null);}
  const aimAction=c.activeAction,aimTime=aimAction.time;
  let start,mid,end;
  const duration=FIREARMS[type].reload,frames=Math.round(duration*fps);
  for(let i=0;i<=frames;i++){
   c.combatAction={id:1,key:'gunReload',time:duration*i/frames,duration};c.update(1/fps,'IDLE',new THREE.Vector3(),null);c.group.updateMatrixWorld(true);
   if(i===0){assert.equal(c.activeAction,aimAction);assert(c.activeAction.time>aimTime,'reload must not rewind the aiming animation');}
   const hand=point(c,'lefthand').sub(point(c,'righthand'));
   if(i===0)start=hand.clone();if(i===Math.floor(frames/2))mid=hand.clone();if(i===frames)end=hand.clone();
   for(const b of Object.values(c.bones))assert(b.quaternion.toArray().every(Number.isFinite));
  }
  assert(mid.distanceTo(start)>.05,`${type} reload hand must move`);
  assert(end.distanceTo(start)<.12,`${type} support hand should return`);
  console.log(`PASS ${type} reload pose ${fps}fps`);
 }finally{disposeRig(c);}
}
