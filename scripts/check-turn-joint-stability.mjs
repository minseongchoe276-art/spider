import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadMotionRig,joint,point,disposeRig} from './lib/motion-rig.mjs';
import {GROUND_SOLE_SPEED,soleSamples} from '../src/CharacterPose.js';
import {JOINT_SPEEDS} from '../src/JointConstraints.js';

// A turn keeps the root still but rotates the body through 90 degrees. This
// exercises releasing/reacquiring a world-space plant, then returning to idle.
// Checking only local ankle rotation misses the resulting calf twist.
const folder=process.env.TURN_JOINT_AUDIT_DIR || 'docs/qa/turn-joints-2026-10-20';
fs.mkdirSync(folder,{recursive:true});
const {actor}=await loadMotionRig(),results=[];
function axialRate(last,q,axis,dt){
  const transported=new T.Quaternion().setFromUnitVectors(last.axis,axis).multiply(last.q);
  const d=q.clone().multiply(transported.invert()).normalize();
  const angle=2*Math.atan2(new T.Vector3(d.x,d.y,d.z).dot(axis),d.w);
  return Math.abs(Math.atan2(Math.sin(angle),Math.cos(angle)))*180/Math.PI/dt;
}
async function skin(mode){
  const raw=fs.readFileSync(`public/models/appearance-${mode}.glb`),length=raw.readUInt32LE(12),json=JSON.parse(raw.subarray(20,20+length));
  json.buffers[0].uri='data:application/octet-stream;base64,'+raw.subarray(28+length).toString('base64');
  delete json.images;delete json.textures;json.materials=[];
  for(const m of json.meshes)for(const p of m.primitives)delete p.material;
  return (await new GLTFLoader().parseAsync(JSON.stringify(json),'')).scene.getObjectByProperty('isSkinnedMesh',true).geometry;
}
for(const mode of ['web','combat']){
  const geometry=await skin(mode);
  for(const fps of [24,30,60,144])for(const heading of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(const direction of ['left','right']){
    const c=actor(),dt=1/fps,v=new T.Vector3(),key=direction==='left'?'turnLeft':'turnRight';
    c.model.getObjectByProperty('isSkinnedMesh',true).geometry=geometry;
    c.visualYaw=c.targetFacingAngle=heading;
    const previous=new Map(),previousJoints=new Map(),previousTargets=new Map();
    const metrics={maxCalfAxialSpeed:0,maxSupportSpeed:0,minBootClearance:Infinity,maxWristBend:0,frames:0};
    try{
      for(let i=0;i<Math.ceil(.4*fps);i++)c.update(dt,'IDLE',v);
      const duration=c.actions[key].getClip().duration;
      c.requestTurn(direction);
      for(let i=0;i<=Math.ceil((duration+.7)*fps);i++){
        const t=i/fps,phase=Math.min(1,t/duration);
        // Same sign and easing as SwingPhysics.turnOnSpot/update.
        c.targetFacingAngle=heading+(direction==='left'?-1:1)*Math.PI/2*phase*phase*(3-2*phase);
        c.update(dt,t<duration?'TURNING':'IDLE',v);
        c.group.updateMatrixWorld(true);metrics.frames++;
        for(const side of ['left','right']){
          const lower=joint(c,side+'leg'),q=lower.getWorldQuaternion(new T.Quaternion());
          const axis=point(c,side+'foot').sub(point(c,side+'leg')).normalize(),last=previous.get(side);
          if(last)metrics.maxCalfAxialSpeed=Math.max(metrics.maxCalfAxialSpeed,axialRate(last,q,axis,dt));
          previous.set(side,{q,axis});
          const support=c.groundSoleTargets?.[side],old=previousTargets.get(side);
          if(support && old)metrics.maxSupportSpeed=Math.max(metrics.maxSupportSpeed,old.angleTo(support)/dt*180/Math.PI);
          if(support)previousTargets.set(side,support.clone());
          const bend=point(c,side+'hand').sub(point(c,side+'forearm')).angleTo(point(c,side+'handmiddle1').sub(point(c,side+'hand')))*180/Math.PI;
          metrics.maxWristBend=Math.max(metrics.maxWristBend,bend);
          if(i%Math.max(1,Math.round(fps/12))===0)for(const {mesh,vertex} of soleSamples(c,side)){
            const p=mesh.localToWorld(mesh.applyBoneTransform(vertex,new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,vertex)));
            metrics.minBootClearance=Math.min(metrics.minBootClearance,p.y);
          }
        }
        for(const {bone,kind,rest,limit} of c.jointConstraints){
          assert(rest.angleTo(bone.quaternion)<=limit+1e-5,`${bone.name} exceeds its final articulation limit`);
          const last=previousJoints.get(bone);
          if(last)assert(last.angleTo(bone.quaternion)/dt*180/Math.PI<=JOINT_SPEEDS[kind]+.01,`${bone.name} local snap`);
          previousJoints.set(bone,bone.quaternion.clone());
        }
      }
      assert(metrics.maxCalfAxialSpeed<600,`Calf twist ${metrics.maxCalfAxialSpeed.toFixed(1)}deg/s`);
      assert(metrics.maxSupportSpeed<=GROUND_SOLE_SPEED+.01,'Support heading snapped');
      assert(metrics.minBootClearance>=-.005,'Actual boot penetrates the turn support');
      assert(metrics.maxWristBend<12.001,'Turn folds the wrist');
      assert.equal(c.activeAction,c.actions.idle,'Turn did not recover to idle');
      assert(!Object.values(c.groundSoleSettling || {}).some(Boolean),'Held pose froze the support before it settled');
      c.update(dt,'JUMPING',new T.Vector3(0,7,0));
      assert.equal(c.groundSoleTargets,null,'Takeoff kept a ground rotation target');
      c.update(dt,'IDLE',v);c.stopAnimation();
      assert.equal(c.groundSoleTargets,null,'Reset kept a ground rotation target');
      results.push({mode,fps,heading,direction,pass:true,...metrics});
    }catch(error){results.push({mode,fps,heading,direction,pass:false,error:error.message,...metrics});}
    finally{disposeRig(c);}
  }
  geometry.dispose();console.log('Completed turn/contact/recovery matrix:',mode);
}
const summary={passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,frames:results.reduce((n,r)=>n+r.frames,0),results,
  sourceHashes:Object.fromEntries(['src/Character.js','src/CharacterPose.js','src/JointConstraints.js'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]))};
fs.writeFileSync(folder+'/results.json',JSON.stringify(summary,null,2)+'\n');
for(const r of results.filter(r=>!r.pass))console.error('FAIL',r.mode,r.fps,r.heading,r.direction,r.error);
console.log(`Turn final-joint audit: ${summary.passed}/${results.length}; ${summary.frames} frames`);
if(summary.failed)process.exitCode=1;
