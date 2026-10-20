import assert from 'node:assert/strict';import fs from 'node:fs';import * as T from 'three';
import{loadMotionRig,joint,disposeRig}from'./lib/motion-rig.mjs';
import{SwingPhysics}from'../src/SwingPhysics.js';import{Multiplayer}from'../src/Multiplayer.js';import{sanitizePose}from'../src/RemoteMotion.js';
const{actor}=await loadMotionRig(),results=[];
for(const fps of [24,60,144])for(const guard of [false,true])for(const yaw of [0,Math.PI/2,Math.PI]){
 const c=actor();c.group.updateMatrixWorld(true);const bind=joint(c,'head').getWorldQuaternion(new T.Quaternion());
 c.combatStance=true;c.visualYaw=c.targetFacingAngle=yaw;const speed=guard?1.54:4.4,v=new T.Vector3(Math.sin(yaw),0,Math.cos(yaw)).multiplyScalar(speed);let firstLeg,lastLeg;
 try{for(let i=0;i<fps;i++){c.combatAction=guard?{key:'guard'}:null;c.group.position.addScaledVector(v,1/fps);c.update(1/fps,'RUNNING',v);if(i===Math.floor(fps*.5))firstLeg=joint(c,'leftupleg').quaternion.clone();}
 const forward=new T.Vector3(0,0,1).applyQuaternion(joint(c,'head').getWorldQuaternion(new T.Quaternion()).multiply(bind.invert())).normalize();
 const expected=v.clone().normalize(),flat=forward.clone().setY(0).normalize();const error=flat.angleTo(expected)*180/Math.PI;assert(error<3,`Head faces sideways: ${error}°`);assert(Math.abs(forward.y)<.2,'Guard looks at ground instead of ahead');
 assert(['walk','regularRun','run'].some(k=>c.activeAction===c.actions[k]),'Guard replaced moving legs with a static full-body pose');lastLeg=joint(c,'leftupleg').quaternion;assert(firstLeg.angleTo(lastLeg)>.03,'Moving guard did not step');
 results.push({fps,guard,yaw,headYawError:error,clip:c.activeAction.getClip().name});
 }finally{disposeRig(c);}
}
const silent=new Proxy({},{get:()=>()=>{}});let casts=0;
const p=new SwingPhysics(new T.Scene(),{colliders:[],buildingMeshes:[],checkCollision:()=>({collided:false})},{group:new T.Group(),update(){},fireWeb(){throw Error('Human fired');}},silent);
p.webEnabled=false;p.findBestAnchor=()=>{casts++;return new T.Vector3(0,25,20);};const camera=new T.PerspectiveCamera();
for(const state of ['IDLE','JUMPING','FALLING']){p.state=state;p.position.set(0,10,0);assert.equal(p.startSwing(camera),false);assert.equal(p.performWebPull(camera),false);assert.equal(p.performAirJump(camera),false);const input={webTap:true,webHold:true,webFireHeld:true,webTapRight:true,webHoldRight:true,webFireHeldRight:true,webZipHeld:true};p.update(1/60,input,camera);assert(!p.webs.length&&!input.webHold&&!input.webHoldRight&&!input.webZipHeld);}
assert.equal(casts,0);assert.equal(Multiplayer.prototype.attack.call({game:{combat:{mode:'combat'}}},'web'),false);assert.equal(Multiplayer.prototype.sendAttack.call({game:{combat:{mode:'combat'}}},'web',0),false);
const remote=sanitizePose({state:'FALLING',combatStance:true,velocity:{x:0,y:0,z:0},webs:[{hand:'left',anchor:{x:0,y:25,z:10}}],anchor:{x:0,y:25,z:10},webShot:{hand:'left',target:{x:0,y:25,z:10},remaining:.3}});assert.deepEqual(remote.webs,[]);assert.equal(remote.anchor,null);assert.equal(remote.webShot,null);
fs.mkdirSync('docs/qa/human-combat-2026-10-21',{recursive:true});fs.writeFileSync('docs/qa/human-combat-2026-10-21/results.json',JSON.stringify({status:'PASS',results},null,2)+'\n');console.log('PASS human mode: 18 real-rig forward-gaze/guard gait cases at 24/60/144 FPS, all-state physics/input/network web exclusion, remote pose cleanup');
