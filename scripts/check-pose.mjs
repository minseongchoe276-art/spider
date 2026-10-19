import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Character } from '../src/Character.js';
import { boneId } from '../src/MotionRetarget.js';
import { MOTIONS } from '../src/MotionCatalog.js';
import { planMantle, mantlePosition } from '../src/LedgeTraversal.js';
import { SwingPhysics } from '../src/SwingPhysics.js';
import { StreamedCollision } from '../src/StreamedCollision.js';

globalThis.ProgressEvent=class {constructor(type,values){Object.assign(this,values);}};
const data=fs.readFileSync('public/models/shadow-pulse-rig.glb'),length=data.readUInt32LE(12);
const json=JSON.parse(data.subarray(20,20+length));
json.buffers[0].uri=`data:application/octet-stream;base64,${data.subarray(28+length).toString('base64')}`;
delete json.images;delete json.textures;json.materials=[];
json.meshes.forEach(m=>m.primitives.forEach(p=>delete p.material));
const scene=(await new GLTFLoader().parseAsync(JSON.stringify(json),'')).scene;
const original=[];scene.traverse(n=>original.push({n,p:n.position.clone(),q:n.quaternion.clone()}));
function actor() {
  original.forEach(({n,p,q})=>{n.position.copy(p);n.quaternion.copy(q);});
  const c=Object.create(Character.prototype);
  Object.assign(c,{model:scene,group:new THREE.Group(),actions:{},bones:{},activeAction:null,
    lastState:null,bodyPitch:0,targetFacingAngle:0,trickRotation:0,idleTime:0,webShotTimer:0,
    currentHand:'right',groundProbe:()=>0,updateWeb(){}});
  c.group.add(scene);c.group.position.y=0.1;c.mixer=new THREE.AnimationMixer(scene);
  scene.traverse(b=>{if(b.isBone)c.bones[b.name]=b;});
  for(const m of MOTIONS) {
    const data=JSON.parse(fs.readFileSync(`public/motions/${m.key}.json`));
    const clip=THREE.AnimationClip.parse(data);clip.userData=data.userData;
    const a=c.mixer.clipAction(clip);a.setLoop(m.loop?THREE.LoopRepeat:THREE.LoopOnce);a.clampWhenFinished=!m.loop;c.actions[m.key]=a;
  }
  return c;
}
const bone=(c,id)=>Object.values(c.bones).find(b=>boneId(b.name)===id);
const position=(c,id)=>bone(c,id).getWorldPosition(new THREE.Vector3());
function finite(c) {
  for(const b of Object.values(c.bones)) {
    assert(b.position.toArray().every(Number.isFinite));assert(b.quaternion.toArray().every(Number.isFinite));
    assert(Math.abs(b.quaternion.length()-1)<1e-5,'Joint quaternion lost normalization');
  }
}
let checks=0;
const dualOnly=process.argv.includes('--dual-only');
for(const dt of (dualOnly?[]:[1/30,1/60,1/144])) {
  for(const [key,speed] of [['walk',1.6],['jog',3.4],['regularRun',4.8],['run',6.5]]) {
    const c=actor();let contacts=0,maxSlip=0,maxFootStep=0;const last=new Map(),lastFeet=new Map();
    for(let t=0;t<3;t+=dt) {
      c.group.position.z+=speed*dt;c.update(dt,key==='run'?'SPRINTING':'RUNNING',new THREE.Vector3(0,0,speed));finite(c);
      for(const side of ['left','right']) {
        const visibleFoot=position(c,side+'foot');
        if(lastFeet.has(side))maxFootStep=Math.max(maxFootStep,visibleFoot.distanceTo(lastFeet.get(side)));
        lastFeet.set(side,visibleFoot);
        const p=c.movingPlants?.[side];if(!p || p.age<0.08){last.delete(side);continue;}
        const foot=position(c,side+'foot');const prev=last.get(side);
        if(prev?.plant===p)maxSlip=Math.max(maxSlip,foot.distanceTo(prev.foot));
        last.set(side,{plant:p,foot});contacts++;
        assert(foot.y>=.095 && foot.y<.16,`${key}: stance ankle left the boot's ground clearance range`); // Curved sole clearance is measured on all boot vertices by check-silk-gait.
      }
    }
    assert(contacts>5,`${key}: no stance contacts`);assert(maxSlip<0.025,`${key}: planted foot slip ${maxSlip}`);
    assert(maxFootStep<=(10+2*speed)*dt+0.003,`${key}: discontinuous swing/release foot step ${maxFootStep}`);
    console.log(`PASS ${key} ${Math.round(1/dt)}fps: ${contacts} contact samples, max step slip ${(maxSlip*1000).toFixed(1)}mm, overall foot step ${(maxFootStep*1000).toFixed(1)}mm`);checks++;
    c.groundProbe=()=>null;c.update(dt,'RUNNING',new THREE.Vector3(0,0,speed));
    assert(Object.keys(c.movingPlants).length===0,'Feet pinned across unsupported ledge');
    c.update(dt,'JUMPING',new THREE.Vector3(0,10,0));assert.equal(c.movingPlants,null,'Airborne foot lock');
    c.mixer.stopAllAction();
  }
  const idle=actor();for(let t=0;t<1;t+=dt)idle.update(dt,'IDLE',new THREE.Vector3());
  for(const side of ['left','right'])assert(Math.abs(position(idle,side+'foot').y-0.11)<0.02,'Real groundProbe caused idle sole penetration');
  idle.mixer.stopAllAction();checks++;
  for(const normal of [new THREE.Vector3(0,0,1),new THREE.Vector3(1,0,0),new THREE.Vector3(1,0,1).normalize()]) {
    const c=actor();c.wallNormal=normal;c.group.position.copy(normal.clone().multiplyScalar(0.7));c.group.position.y=3;
    const authored=c.actions.wall.getClip().userData.authoredMixamo;
    let planted=0,maxError=0;const errors={},details={};
    for(let t=0;t<1;t+=dt) {
      c.group.position.y+=6.5*dt;c.update(dt,'WALL_RUNNING',new THREE.Vector3(0,6.5,0));finite(c);
      assert.equal(c.activeAction,c.actions.wall);
      assert(new THREE.Vector3(0,1,0).applyQuaternion(c.model.quaternion).y>0.99);
      if(t>0.3) {
        if(authored) {
          const plane=c.group.getWorldPosition(new THREE.Vector3()).addScaledVector(normal,-(c.wallDistance ?? .7)+.09);
          for(const id of ['lefthand','righthand','leftfoot','rightfoot']) {
            const error=Math.abs(position(c,id).sub(plane).dot(normal));maxError=Math.max(maxError,error);
            errors[id]=Math.max(errors[id]||0,error);planted++;
          }
        } else for(const [id,contact] of Object.entries(c.wallContacts))if(contact.stance) {
          const error=position(c,id).distanceTo(contact.target);maxError=Math.max(maxError,error);
          if(error>(errors[id]||0))details[id]={root:c.group.position.toArray(),actual:position(c,id).toArray(),target:contact.target.toArray(),shoulder:position(c,id.replace('hand','arm').replace('foot','upleg')).toArray()};
          errors[id]=Math.max(errors[id]||0,error);planted++;
        }
      }
    }
    console.log(`WALL ${Math.round(1/dt)}fps normal ${normal.toArray()}: ${planted} ${authored?'facade-contact':'planted'} samples, error ${maxError.toFixed(3)}m`,errors);
    if(maxError>=0.02)console.log(details);
    assert(planted>5);assert(maxError<(authored?.07:.02),authored?'Authored wall limb left the facade':'Wall limb cannot reach its planted target');
    c.update(dt,'FALLING',new THREE.Vector3(0,-10,0));assert.equal(c.wallContacts,null);
    c.mixer.stopAllAction();checks++;
  }
  for(const v of [new THREE.Vector3(0,4,30),new THREE.Vector3(30,8,0),new THREE.Vector3(0,30,1)]) {
    const c=actor();c.group.position.y=10;const anchor=c.group.position.clone().add(v.clone().multiplyScalar(3));
    for(let t=0;t<0.8;t+=dt)c.update(dt,'WEB_ZIP',v,anchor);
    assert.equal(c.activeAction,c.actions.zip);finite(c);
    assert(c.bodyPitch>=0 && c.bodyPitch<=1,'Pull leaned backward');
    for(const side of ['left','right']) {
      const shoulder=position(c,side+'arm'),wrist=position(c,side+'hand');
      assert(anchor.clone().sub(shoulder).normalize().dot(wrist.clone().sub(shoulder).normalize())>0.999,'Pull hand misses anchor direction');
    }
    c.update(dt,'IDLE',new THREE.Vector3());assert.equal(c.zipPoseWeight,0);
    c.mixer.stopAllAction();checks++;
  }
  const stop=actor();stop.update(dt,'RUNNING',new THREE.Vector3(0,0,1.6));
  stop.update(dt,'IDLE',new THREE.Vector3());assert.equal(stop.activeAction,stop.actions.stop);
  for(let t=0;t<1.5;t+=dt)stop.update(dt,'IDLE',new THREE.Vector3());
  assert.equal(stop.activeAction,stop.actions.idle);assert(stop.group.position.z===0,'Stop generated root travel');
  stop.mixer.stopAllAction();checks++;
}
if(!dualOnly)console.log(`PASS: ${checks} actual-rig pose cases, measured stance slip, real-ground sole clearance, ledge release, facade normals, directional web pulls and stop recovery`);

let dualHandChecks=0;
for(const dt of [1/30,1/60,1/144]) {
  const c=actor();c.webAttachments=[];c.group.position.y=10;
  const left=new THREE.Vector3(-7,22,8),right=new THREE.Vector3(9,24,5);
  c.fireWeb(left,'left');
  for(let t=0;t<0.6;t+=dt)c.update(dt,'SWINGING',new THREE.Vector3(0,0,5),left);
  assert(c.webHandWeights.left>0.99);assert.equal(c.webHandWeights.right,0);
  assert.equal(c.webAttachments.length,1);finite(c);dualHandChecks++;
  c.fireWeb(right,'right');
  for(let t=0;t<0.6;t+=dt)c.update(dt,'SWINGING',new THREE.Vector3(0,0,5),right);
  assert.equal(c.webAttachments.length,2);
  for(const [side,target] of [['left',left],['right',right]]) {
    const shoulder=position(c,side+'arm'),wrist=position(c,side+'hand');
    assert(target.clone().sub(shoulder).normalize().dot(wrist.clone().sub(shoulder).normalize())>0.998,'Hand points at the other strand instead of its own anchor');
  }
  const retained=c.webAttachments.find(w=>w.hand==='right');
  c.fireWeb(new THREE.Vector3(-12,20,-3),'left');
  assert.equal(c.webAttachments.find(w=>w.hand==='right'),retained);
  c.update(dt,'SWINGING',new THREE.Vector3(0,0,5),left);
  assert(c.webHandTargets.left.distanceTo(left)>0.1);
  assert(c.webHandTargets.left.distanceTo(new THREE.Vector3(-12,20,-3))>0.1,'Re-fired arm target snapped instantly');
  for(let t=0;t<0.6;t+=dt)c.update(dt,'SWINGING',new THREE.Vector3(0,0,5),left);
  finite(c);
  const releasePhysics=new SwingPhysics(new THREE.Scene(),{buildingMeshes:[],colliders:[]},c,{});
  releasePhysics.isSwinging=true;releasePhysics.state='SWINGING';
  const reachWeight=c.webHandWeights.left;
  releasePhysics.releaseSwing(false);
  assert.equal(c.webAttachments.length,0);
  assert.equal(c.webHandWeights.left,reachWeight,'Physics release snapped the IK pose before its fade');
  c.update(dt,'FALLING',new THREE.Vector3(0,-5,0),null);
  assert(c.webHandWeights.left>0 && c.webHandWeights.left<reachWeight,'Released reaching arm did not blend out');
  for(let t=0;t<0.8;t+=dt)c.update(dt,'FALLING',new THREE.Vector3(0,-5,0),null);
  assert(c.webHandWeights.left<0.001 && c.webHandWeights.right<0.001,'Released hand pose stayed locked');
  finite(c);dualHandChecks++;c.mixer.stopAllAction();
}
console.log(`PASS: ${dualHandChecks} actual-rig independent-hand shot, separate anchor reach, replacement and release cases`);
if(dualOnly)process.exit(0);

let terrainChecks=0;
for(const dt of [1/30,1/60,1/144]) {
  for(const [gx,gz] of [[0,0.3],[0,-0.3],[0.3,0],[0.4,0.2]]) {
    const c=actor(),normal=new THREE.Vector3(-gx,1,-gz).normalize();
    c.surfaceProbe=p=>({height:gx*p.x+gz*p.z,normal});
    let planted=0,maxHeightError=0;
    for(let t=0;t<2;t+=dt) {
      c.group.position.z+=1.6*dt;c.group.position.y=gz*c.group.position.z+0.1;
      c.update(dt,'RUNNING',new THREE.Vector3(0,gz*1.6,1.6));finite(c);
      for(const side of ['left','right']) {
        const plant=c.movingPlants?.[side];if(!plant || plant.age<0.1)continue;
        const foot=position(c,side+'foot');
        maxHeightError=Math.max(maxHeightError,Math.abs(foot.y-gx*foot.x-gz*foot.z-0.11));
        const neutral=c.model.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().fromArray(c.actions.wall.getClip().userData.soleRotations[side]));
        const sole=upVector().applyQuaternion(bone(c,side+'foot').getWorldQuaternion(new THREE.Quaternion()).multiply(neutral.invert()));
        assert(sole.dot(normal)>0.99,'Planted sole ignored the slope normal');planted++;
      }
    }
    assert(planted>5,'Slope gait never planted a foot');assert(maxHeightError<0.035,`Slope foot clearance ${maxHeightError}`);
    for(let t=0;t<1;t+=dt)c.update(dt,'IDLE',new THREE.Vector3());
    assert(c.terrainPelvis<=0 && c.terrainPelvis>=-0.22,'Pelvis offset escaped its safe range');
    c.surfaceProbe=()=>null;c.update(dt,'IDLE',new THREE.Vector3());
    assert(Object.keys(c.idleFootAnchors).length===0,'Idle foot remained pinned to an unloaded surface');
    c.mixer.stopAllAction();terrainChecks++;
  }
  for(const normal of [new THREE.Vector3(0,0,1),new THREE.Vector3(1,0,0)]) {
    const c=actor(),city={colliders:[{minX:-4,maxX:normal.x?0:4,minZ:-4,maxZ:normal.z?0:4,minY:0,maxY:10}]};
    const plan=planMantle(city,normal.clone().multiplyScalar(0.7).add(new THREE.Vector3(0,9.4,0)),normal,10);
    assert(plan,'Open ledge failed traversal planning');c.wallNormal=normal;
    let handContacts=0,maxHandError=0,gripDetail;
    for(let t=0;t<plan.duration;t+=dt) {
      plan.elapsed=t;c.mantle=plan;c.group.position.copy(mantlePosition(plan,t/plan.duration));
      c.update(dt,'MANTLING',new THREE.Vector3());finite(c);
      if(t/plan.duration>0.2 && t/plan.duration<0.5)for(const side of ['left','right']) {
        const error=position(c,side+'hand').distanceTo(c.mantleHandTargets[side]);
        if(error>maxHandError)gripDetail={t,side,shoulder:position(c,side+'arm').toArray(),wrist:position(c,side+'hand').toArray(),target:c.mantleHandTargets[side].toArray(),body:c.model.position.toArray()};
        maxHandError=Math.max(maxHandError,error);handContacts++;
      }
      if(t/plan.duration>0.7)for(const side of ['left','right']) {
        assert(position(c,side+'foot').y>plan.height+0.08,'Mantle foot penetrated the rooftop');
        assert(position(c,side+'leg').y>plan.height-0.02,'Mantle knee penetrated the rooftop');
      }
    }
    console.log(`MANTLE ${Math.round(1/dt)}fps: maximum grip error ${(maxHandError*1000).toFixed(1)}mm`);
    if(maxHandError>=0.07)console.log(gripDetail);
    assert(handContacts>5);assert(maxHandError<0.02,'Mantle hands cannot reach the roof grip');
    c.mantle=null;c.group.position.copy(plan.end);c.update(dt,'IDLE',new THREE.Vector3());
    assert.equal(c.mantleHandTargets,null);c.mixer.stopAllAction();terrainChecks++;
  }
}
function upVector(){return new THREE.Vector3(0,1,0);}
console.log(`PASS: ${terrainChecks} slope and mantle actual-rig cases, slope normals, pelvis limits, missing-support release and ledge hand grips`);

const terrainWorld=new StreamedCollision();await terrainWorld.initialized;
const terrainFloor=new THREE.Mesh(new THREE.BoxGeometry(40,1,40));terrainFloor.position.y=-0.5;terrainWorld.enqueue(terrainFloor);
const terrainRamp=new THREE.Mesh(new THREE.PlaneGeometry(6,12));terrainRamp.rotation.x=-Math.PI/2-Math.atan(0.3);terrainRamp.position.y=1.8;terrainWorld.enqueue(terrainRamp);
for(let i=0;i<6;i++) {
  const step=new THREE.Mesh(new THREE.BoxGeometry(3,(i+1)*0.2,0.65));step.position.set(8,(i+1)*0.1,1+i*0.65);terrainWorld.enqueue(step);
}
for(let n=0;n<30;n++)terrainWorld.update(new THREE.Vector3());
for(const fps of [30,60,144])for(const mode of ['slope','stairs']) {
  const c=actor(),city={colliders:[],buildingMeshes:[],collisionWorld:terrainWorld,checkCollision:()=>({collided:false}),
    resolveMovement:(a,b,v)=>terrainWorld.resolve(a,b,v),
    supportHeight:p=>{const h=terrainWorld.groundAt(p,0.5);return h!==null && Math.abs(p.y-h-0.1)<0.2?h:null;}};
  const silent=new Proxy({}, {get:()=>()=>{}}),p=new SwingPhysics(new THREE.Scene(),city,c,silent);
  p.position.set(mode==='stairs'?8:0,5,-3);p.position.y=terrainWorld.groundAt(p.position,8)+0.14;p.state='IDLE';
  p.previousFixedPosition.copy(p.position);p.renderPosition.copy(p.position);
  const camera=new THREE.PerspectiveCamera();camera.rotation.y=Math.PI;
  const i={forward:true,backward:false,left:false,right:false,wallRun:false,webHold:false,strafe:0};
  let contacts=0,maxError=0;
  for(let n=0;n<fps*3.5;n++) {
    p.update(1/fps,i,camera);finite(c);
    for(const side of ['left','right']) {
      const plant=c.movingPlants?.[side];if(!plant || plant.age<0.1)continue;
      const foot=position(c,side+'foot'),ground=c.surfaceProbe(new THREE.Vector3(foot.x,c.group.position.y+0.45,foot.z));
      if(ground){contacts++;maxError=Math.max(maxError,Math.abs(foot.y-ground.height-0.11));}
    }
  }
  assert(contacts>5,`${mode}: actual capsule gait lacked foot contacts`);
  assert(maxError<0.035,`${mode}: actual capsule/rig foot clearance ${maxError}`);
  i.forward=false;for(let n=0;n<fps*1.5;n++)p.update(1/fps,i,camera);
  assert.equal(p.state,'IDLE');assert(p.velocity.length()<0.02);finite(c);
  c.mixer.stopAllAction();terrainChecks++;
  console.log(`PASS actual capsule + rig ${mode} ${fps}fps: ${contacts} contacts, clearance error ${(maxError*1000).toFixed(1)}mm`);
}
terrainWorld.dispose();
const facadeWorld=new StreamedCollision();await facadeWorld.initialized;
const facade=new THREE.Mesh(new THREE.BoxGeometry(8,10,6));facade.position.set(0,5,-3);facadeWorld.enqueue(facade);
for(let n=0;n<4;n++)facadeWorld.update(new THREE.Vector3(0,9,0));
for(const fps of [30,60,144]) {
  const c=actor(),normal=new THREE.Vector3(0,0,1),city={collisionWorld:facadeWorld};
  const plan=planMantle(city,new THREE.Vector3(0,9.4,0.375),normal,10);
  assert(plan,'Real streamed facade traversal planning failed');assert(Math.abs(plan.gap-0.375)<0.01);
  assert(Math.abs(plan.edge.z)<0.01,'Streamed grip used procedural capsule distance rather than the actual facade');
  c.wallNormal=normal;c.wallDistance=plan.gap;let error=0;
  for(let t=0;t<plan.duration;t+=1/fps) {
    plan.elapsed=t;c.mantle=plan;c.group.position.copy(mantlePosition(plan,t/plan.duration));
    c.update(1/fps,'MANTLING',new THREE.Vector3());finite(c);
    if(t/plan.duration>0.2 && t/plan.duration<0.5)for(const side of ['left','right'])
      error=Math.max(error,position(c,side+'hand').distanceTo(c.mantleHandTargets[side]));
    if(t/plan.duration>0.7)for(const side of ['left','right'])assert(position(c,side+'foot').y>10.08);
  }
  assert(error<0.02,'Streamed facade grip out of reach');c.mixer.stopAllAction();terrainChecks++;
  console.log(`PASS streamed facade + rig mantle ${fps}fps: measured facade gap ${plan.gap.toFixed(3)}m, grip error ${(error*1000).toFixed(1)}mm`);
}
facadeWorld.dispose();
console.log(`PASS: ${checks+terrainChecks} actual-rig cases total, including 6 real capsule + rig slope/stair scenarios`);
