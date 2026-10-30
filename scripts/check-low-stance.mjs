import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadMotionRig,point,joint,disposeRig} from './lib/motion-rig.mjs';
import {SwingPhysics} from '../src/SwingPhysics.js';
import {sanitizePose,capturePose} from '../src/RemoteMotion.js';
import {BINDINGS,cleanSettings,canonicalKey} from '../src/PlayerSettings.js';
assert.equal(BINDINGS.crouch,undefined);assert.equal(BINDINGS.recenter,'KeyZ');
const saved=cleanSettings({bindings:{...BINDINGS,recenter:'KeyC',crouch:undefined}});
const legacyBindings={...BINDINGS,forward:'KeyI',recenter:'KeyC'};delete legacyBindings.crouch;
const migrated=cleanSettings({bindings:legacyBindings});
assert.equal(migrated.bindings.forward,'KeyI','Stance upgrade erased an unrelated saved remap');
assert.equal(migrated.bindings.crouch,undefined);assert.equal(migrated.bindings.recenter,'KeyC');
assert.equal(canonicalKey('KeyC',saved),'KeyZ');assert.equal(canonicalKey('KeyZ',saved),null);
for(const state of ['FALLING','SWINGING','ROLLING'])assert.equal(sanitizePose({state,velocity:{x:0,y:0,z:0},lowStance:'crouch'}).lowStance,null);
assert.equal(sanitizePose({state:'IDLE',velocity:{x:0,y:0,z:0},lowStance:'invalid'}).lowStance,null);
const rig=await loadMotionRig(),results=[];
const raw=fs.readFileSync('public/models/appearance-web.glb'),length=raw.readUInt32LE(12),json=JSON.parse(raw.subarray(20,20+length));
json.buffers[0].uri='data:application/octet-stream;base64,'+raw.subarray(28+length).toString('base64');
delete json.images;delete json.textures;json.materials=[];
for(const mesh of json.meshes)for(const part of mesh.primitives)delete part.material;
const skin=(await new GLTFLoader().parseAsync(JSON.stringify(json),'')).scene.getObjectByProperty('isSkinnedMesh',true).geometry;
const actor=()=>{const c=rig.actor();c.model.getObjectByProperty('isSkinnedMesh',true).geometry=skin;return c;};
const camera=new T.PerspectiveCamera();camera.userData.movementYaw=0;
const silent=new Proxy({},{get:()=>()=>{}});
for(const fps of [24,60,144])for(const stance of ['crouch'])for(const moving of [false,true]){
 const c=actor(),p=new SwingPhysics(c.scene,{buildingMeshes:[],colliders:[],checkCollision(){return {collided:false};},getRooftopSpawn:()=>new T.Vector3(0,.1,0)},c,silent);
 p.state='IDLE';p.position.set(0,.1,0);p.renderPosition.copy(p.position);p.previousFixedPosition.copy(p.position);
 const dt=1/fps,tick=input=>p.update(dt,input,camera);
 try{
  for(let i=0;i<fps/2;i++)tick({});
  const standing=point(c,'head').y;
  assert(p.toggleLowStance(stance));
  let maxStep=0,last;
  for(let i=0;i<fps*2;i++){
   tick(moving?{forward:true,sprint:true}:{});
   const head=point(c,'head');if(last)maxStep=Math.max(maxStep,last.distanceTo(head));last=head;
   for(const bone of Object.values(c.bones))assert([...bone.position,...bone.quaternion].every(Number.isFinite));
   for(const {bone,rest,limit} of c.jointConstraints)assert(rest.angleTo(bone.quaternion)<=limit+1e-5,`${stance}: ${bone.name} exceeded joint limit`);
  }
  const height=point(c,'head').y,speed=Math.hypot(p.velocity.x,p.velocity.z);
  const mesh=c.model.getObjectByProperty('isSkinnedMesh',true),vertices=mesh.geometry.attributes.position;
  let minSkinY=Infinity;
  for(let vertex=0;vertex<vertices.count;vertex++)minSkinY=Math.min(minSkinY,mesh.localToWorld(mesh.applyBoneTransform(vertex,new T.Vector3().fromBufferAttribute(vertices,vertex))).y);
  assert(minSkinY>-.015,`${stance}: skin penetrated floor by ${-minSkinY}m`);
  assert(height<standing-.3,`${stance}: head did not lower (${height})`);
  assert(point(c,'leftfoot').x>point(c,'rightfoot').x+.15,'Crouching crossed the legs');
  assert(height>.08,`${stance}: head penetrated floor`);
  assert(speed<=1.51,'Sprint bypassed low-stance speed');
  assert(maxStep<6/fps,`${stance} ${fps}fps moving=${moving}: transition snapped ${maxStep}`);
  assert.equal(capturePose(p,c).lowStance,stance);
  const held=point(c,'hips');for(let i=0;i<fps;i++)tick({});
  if(!moving)assert(point(c,'hips').distanceTo(held)<.015,`${stance} ${fps}fps: held hips drifted ${point(c,'hips').distanceTo(held)}m`);
  assert(p.toggleLowStance(stance));assert.equal(p.lowStance,null);
  for(let i=0;i<fps;i++)tick({});
  assert(point(c,'head').y>standing-.05,'Stand did not recover');
  p.toggleLowStance(stance);for(let i=0;i<3;i++)tick({jump:true});assert.equal(c.lowStance,null);
  assert(!p.toggleLowStance(stance),'Airborne stance was accepted');
  p.state='IDLE';p.toggleLowStance(stance);c.combatAction={key:'jab',duration:.72,time:0};tick({});
  assert.equal(c.lowStance,null,'Attack did not stand up');
  p.resetPosition();assert.equal(c.crouchWeight,0);
  results.push({fps,stance,moving,standing,height,speed,maxStep,minSkinY});
 }finally{disposeRig(c);}
}
for(const fps of [24,144]){
 const c=actor(),dt=1/fps;let maxStep=0,last;
 try{
  for(let i=0;i<fps/2;i++)c.update(dt,'IDLE',new T.Vector3());
  for(const stance of ['crouch',null]){
   c.lowStance=stance;
   for(let i=0;i<fps;i++){
    c.update(dt,'IDLE',new T.Vector3());const head=point(c,'head');
    if(last)maxStep=Math.max(maxStep,last.distanceTo(head));last=head;
    assert(head.y>.08,'Direct crouch transition put the head underground');
    for(const {bone,rest,limit} of c.jointConstraints)assert(rest.angleTo(bone.quaternion)<=limit+1e-5,'Direct crouch transition violated joint limit');
   }
  }
  assert(maxStep<6/fps,`Direct crouch transition snapped ${maxStep}m`);
  assert(point(c,'head').y>1.55,'Direct transitions did not recover standing');
  results.push({fps,transition:'crouch-stand',maxStep});
 }finally{disposeRig(c);}
}
for(const fps of [24,60,144])for(const key of ['jab','cross','hook','heavy','special']){
 const a=actor(),b=actor(),dt=1/fps,v=new T.Vector3(0,0,4.4);
 try{
  for(let i=0;i<fps*.4;i++){a.update(dt,'RUNNING',v);b.update(dt,'RUNNING',v);}
  let maxFootDeviation=0;
  for(let i=0;i<fps*.8;i++){
   a.combatAction={id:1,key,time:i*dt,duration:.8};a.update(dt,'RUNNING',v);b.update(dt,'RUNNING',v);
   maxFootDeviation=Math.max(maxFootDeviation,...['leftfoot','rightfoot'].map(id=>point(a,id).distanceTo(point(b,id))));
  }
  if(key==='special')assert.equal(a.activeAction,a.actions.special,'The authored full-body uppercut must own its dash');
  else assert(maxFootDeviation<.08,`${key}: in-place attack moved the carrier feet ${maxFootDeviation}m`);
  results.push({fps,key,maxFootDeviation});
 }finally{disposeRig(a);disposeRig(b);}
}
fs.mkdirSync('docs/qa/stance-combat-2026-10-26',{recursive:true});
fs.writeFileSync('docs/qa/stance-combat-2026-10-26/results.json',JSON.stringify(results,null,2)+'\n');
console.log(`PASS ${results.length} rig cases: attack legs, crouch, input, sprint limits, jumps, interruptions, reset, network validation at 24/60/144 FPS`);
