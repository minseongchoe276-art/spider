import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { Character } from '../src/Character.js';
import { MOTIONS } from '../src/MotionCatalog.js';
import { boneId } from '../src/MotionRetarget.js';
import { SwingPhysics } from '../src/SwingPhysics.js';
import { City } from '../src/City.js';
globalThis.ProgressEvent=class {constructor(type,values){Object.assign(this,values);}};
const raw=fs.readFileSync('public/models/spiderman.glb'),length=raw.readUInt32LE(12),json=JSON.parse(raw.subarray(20,20+length));
json.buffers[0].uri=`data:application/octet-stream;base64,${raw.subarray(28+length).toString('base64')}`;
delete json.images;delete json.textures;json.materials=[];json.meshes.forEach(m=>m.primitives.forEach(p=>delete p.material));
const template=(await new GLTFLoader().parseAsync(JSON.stringify(json),'')).scene;
function character(){const c=Object.create(Character.prototype);Object.assign(c,{model:clone(template),group:new THREE.Group(),actions:{},bones:{},activeAction:null,lastState:null,bodyPitch:0,targetFacingAngle:Math.PI,visualYaw:Math.PI,trickRotation:0,idleTime:0,webShotTimer:0,currentHand:'right',groundProbe:()=>0,updateWeb(){}});
  c.group.add(c.model);c.mixer=new THREE.AnimationMixer(c.model);c.model.traverse(b=>{if(b.isBone)c.bones[b.name]=b;});
  for(const m of MOTIONS){const data=JSON.parse(fs.readFileSync(`public/motions/${m.key}.json`)),clip=THREE.AnimationClip.parse(data);clip.userData=data.userData;
    const action=c.mixer.clipAction(clip);action.setLoop(m.loop?THREE.LoopRepeat:THREE.LoopOnce);action.clampWhenFinished=!m.loop;c.actions[m.key]=action;}
  return c;
}
const roof={minX:-5,maxX:5,minY:0,maxY:10,minZ:-12,maxZ:0},lip={minX:-5,maxX:5,minY:10,maxY:11.2,minZ:-.8,maxZ:0};
const results=[];let total=0;
for(const fps of [30,60,144]){
  const c=character(),city={colliders:[roof,lip],buildingMeshes:[],raycast:City.prototype.raycast,checkCollision:City.prototype.checkCollision},silent=new Proxy({},{get:()=>()=>{}}),p=new SwingPhysics(new THREE.Scene(),city,c,silent);
  p.position.set(0,7,.7);p.previousFixedPosition.copy(p.position);p.renderPosition.copy(p.position);p.wallNormal.set(0,0,1);c.wallNormal=p.wallNormal;p.state='WALL_RUNNING';
  const byId=id=>Object.values(c.bones).find(b=>boneId(b.name)===id),point=id=>byId(id).getWorldPosition(new THREE.Vector3());
  const lengths=new Map(Object.values(c.bones).map(b=>[b,b.position.length()]));let maxGrip=0,maxStep=0,maxDetail,last=null,saw=false,landed=false;
  for(let frame=0;frame<fps*5;frame++){
    p.update(1/fps,{forward:true,wallRun:true,strafe:0},new THREE.PerspectiveCamera());c.group.updateMatrixWorld(true);total++;
    const points=['head','lefthand','righthand','leftfoot','rightfoot'].map(point);
    for(const b of Object.values(c.bones)){assert(b.quaternion.toArray().every(Number.isFinite));assert(Math.abs(b.quaternion.length()-1)<1e-5);if(boneId(b.name)!=='hips')assert(Math.abs(b.position.length()-lengths.get(b))<1e-5,'A limb was stretched');}
    if(last && frame>fps*.3)for(const [i,v]of points.entries()){const step=v.distanceTo(last[i]);if(step>maxStep){maxStep=step;maxDetail={frame,state:p.state,phase:p.mantle?.elapsed/p.mantle?.duration,wallWeight:c.actions.wall.getEffectiveWeight(),idleWeight:c.actions.idle.getEffectiveWeight(),wallTime:c.actions.wall.time,idleTime:c.actions.idle.time,joint:['head','lefthand','righthand','leftfoot','rightfoot'][i],from:last[i].toArray(),to:v.toArray()};}}last=points;
    if(p.state==='MANTLING'){
      saw=true;const t=p.mantle.elapsed/p.mantle.duration;
      if(t>.2 && t<.42)for(const side of ['left','right'])maxGrip=Math.max(maxGrip,point(side+'hand').distanceTo(c.mantleHandTargets[side]));
      for(const side of ['left','right']){const foot=point(side+'foot');assert(!(foot.x>lip.minX && foot.x<lip.maxX && foot.z>lip.minZ+.02 && foot.z<lip.maxZ-.02 && foot.y<lip.maxY+.03 && foot.y>lip.minY),`Foot enters parapet at phase ${t.toFixed(3)}: ${foot.toArray()}`);}
      for(const joint of ['hips','leftleg','rightleg']){const v=point(joint);assert(!(v.x>lip.minX && v.x<lip.maxX && v.z>lip.minZ+.02 && v.z<lip.maxZ-.02 && v.y<lip.maxY-.02 && v.y>lip.minY),`${joint} enters parapet at phase ${t.toFixed(3)}: ${v.toArray()}`);}
    }
    assert.notEqual(p.state,'FALLING');if(saw && ['IDLE','RUNNING'].includes(p.state)){landed=true;break;}
  }
  assert(landed);assert(maxGrip<.06,`Roof hand grip error ${maxGrip.toFixed(3)}m`);if(maxStep>=15/fps)console.log(maxDetail);assert(maxStep<15/fps,`Pose transition exceeds 15m/s: ${(maxStep*fps).toFixed(2)}m/s`);
  for(let i=0;i<fps;i++){
    p.update(1/fps,{},new THREE.PerspectiveCamera());c.group.updateMatrixWorld(true);total++;
    const points=['head','lefthand','righthand','leftfoot','rightfoot'].map(point);
    maxStep=Math.max(maxStep,...points.map((v,j)=>v.distanceTo(last[j])));last=points;
  }
  assert(maxStep<15/fps,'Roof arrival/stop has an abrupt pose change');assert.equal(p.state,'IDLE');assert.equal(c.mantleHandTargets,null);
  results.push({fps,maxGrip,maxFrameStep:maxStep});console.log(`PASS ${fps}fps actual rig: grip ${(maxGrip*1000).toFixed(1)}mm, max extremity speed ${(maxStep*fps).toFixed(2)}m/s, no foot penetration or stretched limb`);
}
fs.mkdirSync('docs/qa/wall-ledge-2026-10-15',{recursive:true});fs.writeFileSync('docs/qa/wall-ledge-2026-10-15/rig-results.json',JSON.stringify({frames:total,results},null,2));
