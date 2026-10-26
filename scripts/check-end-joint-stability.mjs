import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadMotionRig,point,disposeRig} from './lib/motion-rig.mjs';
import {JOINT_SPEEDS} from '../src/JointConstraints.js';
import {soleSamples} from '../src/CharacterPose.js';
import {boneId} from '../src/MotionRetarget.js';
import {MOTIONS} from '../src/MotionCatalog.js';

const folder=process.env.JOINT_AUDIT_DIR || 'docs/qa/joint-stability-2026-10-20';fs.mkdirSync(folder,{recursive:true});
const {actor,clips}=await loadMotionRig(),results=[];
const requestedKeys=process.argv.find(arg=>arg.startsWith('--keys='))?.slice(7).split(',');
const combat=new Set(['combatIdle','jab','cross','hook','heavy','special','rightHook','guard','hitHead','slamLand']);
const airborne=new Set(['jump','drop','jumpDown','jumpDownVariant','fall','fallIdle','fallVariant','airTrick','slam']);
async function appearance(mode){
  const raw=fs.readFileSync(`public/models/appearance-${mode}.glb`),size=raw.readUInt32LE(12),data=JSON.parse(raw.subarray(20,20+size));
  data.buffers[0].uri='data:application/octet-stream;base64,'+raw.subarray(28+size).toString('base64');
  delete data.images;delete data.textures;data.materials=[];
  for(const m of data.meshes)for(const p of m.primitives)delete p.material;
  return (await new GLTFLoader().parseAsync(JSON.stringify(data),'')).scene.getObjectByProperty('isSkinnedMesh',true).geometry;
}
function measure(c,dt,previous,metrics){
  c.group.updateMatrixWorld(true);
  for(const side of ['left','right']){
    const axis=point(c,side+'hand').sub(point(c,side+'forearm'));
    const fingers=point(c,side+'handmiddle1').sub(point(c,side+'hand'));
    const bend=axis.angleTo(fingers)*180/Math.PI;
    metrics.maxActualWrist=Math.max(metrics.maxActualWrist,bend);
    assert(bend<=12.001,`Actual wrist folds ${bend.toFixed(3)} degrees`);
  }
  for(const {bone,kind,rest,limit} of c.jointConstraints){
    const angle=rest.angleTo(bone.quaternion);assert(angle<=limit+1e-5,`${bone.name} exceeds its final bound`);
    metrics[kind]=Math.max(metrics[kind]||0,angle*180/Math.PI);
    const last=previous.get(bone);
    if(last && dt>0){
      const speed=last.angleTo(bone.quaternion)/dt*180/Math.PI;
      metrics[kind+'Speed']=Math.max(metrics[kind+'Speed']||0,speed);
      assert(speed<=JOINT_SPEEDS[kind]+.01,`${bone.name} snaps at ${speed.toFixed(2)}deg/s`);
    }
    previous.set(bone,bone.quaternion.clone());
  }
  for(const b of Object.values(c.bones)){
    assert(b.position.toArray().every(Number.isFinite),'Invalid bone position');
    assert(Math.abs(b.quaternion.length()-1)<1e-5,'Nonunit bone rotation');
  }
}
for(const mode of ['web','combat']){
  const geometry=await appearance(mode),positions=geometry.attributes.position,idx=geometry.index,edges=[];
  const reference=actor(),referenceMesh=reference.model.getObjectByProperty('isSkinnedMesh',true);
  referenceMesh.geometry=geometry;reference.group.updateMatrixWorld(true);
  const restVertices=Array.from({length:positions.count},(_,i)=>referenceMesh.localToWorld(referenceMesh.applyBoneTransform(i,new T.Vector3().fromBufferAttribute(positions,i))));
  for(let i=0;i<idx.count;i+=3)for(let k=0;k<3;k++){
    const a=idx.getX(i+k),b=idx.getX(i+(k+1)%3);
    edges.push([a,b,restVertices[a].distanceTo(restVertices[b])]);
  }
  disposeRig(reference);
  for(const fps of [24,30,60,144])for(const item of clips.filter(item=>!item.archived && (!requestedKeys || requestedKeys.includes(item.key)))){
    const c=actor(),mesh=c.model.getObjectByProperty('isSkinnedMesh',true);mesh.geometry=geometry;
    const speed={walk:1.6,regularRun:4.8,run:6.5}[item.key] || 0;
    const state=item.key==='wall'?'WALL_RUNNING':item.key==='swing'?'SWINGING':item.key==='zip'?'WEB_ZIP'
      :airborne.has(item.key)?'FALLING':item.key==='roll'?'ROLLING':item.key==='land'?'LANDING':speed?'RUNNING':'IDLE';
    const v=state==='WALL_RUNNING'?new T.Vector3(0,2.8,0):new T.Vector3(0,0,speed);
    c.group.position.set(0,state==='WALL_RUNNING'?4:airborne.has(item.key)?10:.1,state==='WALL_RUNNING'?.7:0);
    c.wallNormal=new T.Vector3(0,0,1);c.wallDistance=.7;
    c.combatStance=combat.has(item.key);c.groundProbe=state==='WALL_RUNNING' || airborne.has(item.key)?()=>null:()=>0;
    c.fadeToAction(item.key,0);c.fadeToAction=()=>{};
    const previous=new Map(),lengths=new Map(Object.values(c.bones).map(b=>[b,b.position.clone()]));
    const metrics={maxActualWrist:0,maxSkinGrowth:0,minSole:Infinity,minWallHand:Infinity,frames:0,skinFrames:0};
    const count=Math.ceil(item.clip.duration*fps),samples=new Set([.15,.5,.85].map(f=>Math.round(count*f)));
    try{
      for(let frame=0;frame<=count;frame++){
        const dt=frame?1/fps:0,t=Math.min(frame/fps,item.clip.duration-1e-6);
        c.activeAction.enabled=true;c.activeAction.paused=false;c.activeAction.time=t;
        if(combat.has(item.key))c.combatAction={id:1,key:item.key,time:t,duration:item.clip.duration};
        c.group.position.addScaledVector(v,dt);c.update(dt,state,v);
        measure(c,dt,previous,metrics);metrics.frames++;
        for(const [b,rest] of lengths){
          const id=boneId(b.name);if(id==='hips')continue;
          // The straight-punch balance solver translates the spine root by
          // up to 6cm to place the shoulder ahead of the capsule. Limb segment
          // lengths must remain fixed; this bounded torso lean is intentional.
          if(id==='spine')assert(b.position.clone().sub(rest).multiply(b.parent.getWorldScale(new T.Vector3())).length()<.061,'Torso lean exceeded 6cm');
          else assert(Math.abs(b.position.length()-rest.length())<1e-5,`Stretched limb: ${b.name}`);
        }
        if(fps===60 && samples.has(frame)){
          const posed=Array.from({length:positions.count},(_,i)=>mesh.localToWorld(mesh.applyBoneTransform(i,new T.Vector3().fromBufferAttribute(positions,i))));
          assert(posed.every(p=>p.toArray().every(Number.isFinite)),'Nonfinite skin');
          assert(new T.Box3().setFromPoints(posed).getSize(new T.Vector3()).length()<5.5,'Exploded skin');
          for(const [a,b,length] of edges)metrics.maxSkinGrowth=Math.max(metrics.maxSkinGrowth,posed[a].distanceTo(posed[b])-length);
          if(['IDLE','RUNNING','LANDING'].includes(state))for(const side of ['left','right'])for(const {vertex} of soleSamples(c,side))metrics.minSole=Math.min(metrics.minSole,posed[vertex].y);
          if(state==='WALL_RUNNING' && t>.4){
            const selected=mesh.skeleton.bones.map(b=>/^(left|right)hand/.test(boneId(b.name)));
            const weights=geometry.attributes.skinWeight,indices=geometry.attributes.skinIndex;
            for(let i=0;i<positions.count;i++){
              let weight=0;for(let k=0;k<4;k++)if(selected[indices.getComponent(i,k)])weight+=weights.getComponent(i,k);
              if(weight>.5)metrics.minWallHand=Math.min(metrics.minWallHand,posed[i].dot(c.wallNormal));
            }
          }
          metrics.skinFrames++;
        }
      }
      assert(metrics.maxSkinGrowth<.16,`Skin edge spikes ${metrics.maxSkinGrowth}m`);
      assert(metrics.minSole>=-.005,`Rendered boot penetrates floor ${metrics.minSole}m`);
      assert(metrics.minWallHand>=-.005,`Rendered hand penetrates wall ${metrics.minWallHand}m`);
      results.push({mode,fps,key:item.key,pass:true,...metrics});
    }catch(error){results.push({mode,fps,key:item.key,pass:false,error:error.message,...metrics});}
    finally{disposeRig(c);}
  }
  // Real controller selection and crossfades, including repeated wall exits,
  // two independent web arms, strikes, sprinting and return to idle.
  for(const fps of [24,30,60,144]){
    const c=actor();c.model.getObjectByProperty('isSkinnedMesh',true).geometry=geometry;
    const metrics={maxActualWrist:0},previous=new Map();let frames=0;
    try{
      const sequence=[['IDLE',0],['RUNNING',1.6],['RUNNING',4.8],['SPRINTING',6.5],['JUMPING',0],['FALLING',0],['LANDING',0],['IDLE',0],['WALL_RUNNING',2.8],['WALL_RUNNING',4.2],['FALLING',0],['SWINGING',0],['WEB_ZIP',0],['FALLING',0],['IDLE',0]];
      for(let repeat=0;repeat<2;repeat++)for(const [state,speed] of sequence){
        c.wallNormal=new T.Vector3(0,0,1);c.wallDistance=.7;
        if(state==='WALL_RUNNING' && c.lastState!=='WALL_RUNNING')c.group.position.set(0,4,.7);
        const v=state==='WALL_RUNNING'?new T.Vector3(0,speed,0):new T.Vector3(0,0,speed);
        c.combatStance=repeat===1 && ['IDLE','RUNNING','SPRINTING'].includes(state);
        const keys=['jab','cross','hook','special'];
        for(let frame=0;frame<fps*.5;frame++){
          const dt=1/fps;c.group.position.addScaledVector(v,dt);
          c.combatAction=c.combatStance?{id:state+repeat,key:keys[frames%keys.length],time:frame/fps,duration:.8}:null;
          const anchor=new T.Vector3(3,15,-4);
          c.webAttachments=['SWINGING','WEB_ZIP'].includes(state)?[{hand:'left',anchor},{hand:'right',anchor:anchor.clone().add(new T.Vector3(-6,2,0))}]:[];
          c.update(dt,state,v,['SWINGING','WEB_ZIP'].includes(state)?anchor:null);
          measure(c,dt,previous,metrics);frames++;
        }
      }
      results.push({mode,fps,key:'live-transitions',pass:true,frames,...metrics});
    }catch(error){results.push({mode,fps,key:'live-transitions',pass:false,error:error.message,frames,...metrics});}
    finally{disposeRig(c);}
  }
  geometry.dispose();
  console.log(`Completed final joint timelines and transitions for ${mode}`);
}
const failed=results.filter(r=>!r.pass),summary={motions:MOTIONS.map(m=>m.key),embedded:clips.filter(c=>c.key==='default').length,
  passed:results.length-failed.length,failed:failed.length,frames:results.reduce((n,r)=>n+(r.frames||0),0),results,
  sourceHashes:Object.fromEntries(['src/JointConstraints.js','src/Character.js','src/CharacterPose.js'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]))};
fs.writeFileSync(folder+'/results.json',JSON.stringify(summary,null,2)+'\n');
for(const r of failed)console.error('FAIL',r.mode,r.fps,r.key,r.error);
console.log(`End-joint final-output audit: ${summary.passed}/${results.length} passed; ${summary.frames} frames; ${MOTIONS.length} registered motions`);
if(failed.length)process.exitCode=1;
