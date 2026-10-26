import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadMotionRig,point,disposeRig} from './lib/motion-rig.mjs';
import {soleSamples} from '../src/CharacterPose.js';
import {boneId} from '../src/MotionRetarget.js';

const folder='docs/qa/natural-wall-motion-2026-10-20';
fs.mkdirSync(folder,{recursive:true});
const {actor}=await loadMotionRig(),results=[];
const up=new T.Vector3(0,1,0),ids=['lefthand','righthand','leftfoot','rightfoot'];
async function appearance(mode){
  const raw=fs.readFileSync(`public/models/appearance-${mode}.glb`),length=raw.readUInt32LE(12);
  const data=JSON.parse(raw.subarray(20,20+length));
  data.buffers[0].uri='data:application/octet-stream;base64,'+raw.subarray(28+length).toString('base64');
  delete data.images;delete data.textures;data.materials=[];
  for(const mesh of data.meshes)for(const primitive of mesh.primitives)delete primitive.material;
  return (await new GLTFLoader().parseAsync(JSON.stringify(data),'')).scene.getObjectByProperty('isSkinnedMesh',true).geometry;
}
for(const mode of ['web','combat']){
  const geometry=await appearance(mode);
  for(const fps of [24,30,60,144])for(const yaw of [0,90,180,270]){
    const c=actor(),normal=new T.Vector3(0,0,1).applyAxisAngle(up,yaw*Math.PI/180);
    const lateral=new T.Vector3().crossVectors(up,normal),dt=1/fps;
    const mesh=c.model.getObjectByProperty('isSkinnedMesh',true);mesh.geometry=geometry;
    c.wallNormal=normal;c.wallDistance=.7;c.groundProbe=()=>null;
    c.group.position.copy(normal).multiplyScalar(.7).setY(4);
    const lengths=new Map(Object.values(c.bones).map(b=>[b,b.position.length()]));
    let minBootClearance=Infinity,maxContactError=0,maxSupportSlip=0,maxKneeWidth=0,maxToeSide=0;
    let maxWrist=0,maxAnkle=0,maxToe=0,maxStepSpeed=0,heldDrift=0,maxBackwardKnee=0;
    const supports=Object.fromEntries(ids.map(id=>[id,0])),previous={},plants={};
    let held=null,frozenPhase=null;
    try{
      for(let frame=0;frame<fps*4;frame++){
        const t=frame*dt;
        const v=t<1.2?up.clone().multiplyScalar(2.8):t<1.8?up.clone().multiplyScalar(4.2)
          :t<2.4?up.clone().multiplyScalar(2.8).addScaledVector(lateral,2.4)
          :t<3?up.clone().multiplyScalar(2.8).addScaledVector(lateral,-2.4)
          :t<3.5?new T.Vector3():up.clone().multiplyScalar(2.8);
        c.group.position.addScaledVector(v,dt);c.update(dt,'WALL_RUNNING',v);c.group.updateMatrixWorld(true);
        for(const b of Object.values(c.bones)){
          assert(b.quaternion.toArray().every(Number.isFinite),'Nonfinite joint');
          assert(Math.abs(b.quaternion.length()-1)<1e-5,'Nonunit rotation');
          if(boneId(b.name)!=='hips')assert(Math.abs(b.position.length()-lengths.get(b))<1e-5,'Stretched bone');
        }
        for(const {bone,kind,rest,limit} of c.jointConstraints){
          const angle=rest.angleTo(bone.quaternion);assert(angle<=limit+1e-5,`Joint limit: ${bone.name}`);
          if(kind==='hand')maxWrist=Math.max(maxWrist,angle*180/Math.PI);
          if(kind==='foot')maxAnkle=Math.max(maxAnkle,angle*180/Math.PI);
          if(kind==='toebase')maxToe=Math.max(maxToe,angle*180/Math.PI);
        }
        for(const id of ids){
          const contact=c.wallContacts[id],p=point(c,contact?.effectorId || id);
          if(previous[id] && t>.5)maxStepSpeed=Math.max(maxStepSpeed,p.distanceTo(previous[id])*fps);
          previous[id]=p;
          if(contact?.stance && contact.age>.08 && t>.5){
            supports[id]++;maxContactError=Math.max(maxContactError,p.distanceTo(contact.position));
            if(plants[id]?.anchor===contact.position)maxSupportSlip=Math.max(maxSupportSlip,p.distanceTo(plants[id].point));
            plants[id]={anchor:contact.position,point:p};
          }else delete plants[id];
        }
        if(t>.5)for(const side of ['left','right']){
          const knee=point(c,side+'leg').sub(c.group.position);
          maxKneeWidth=Math.max(maxKneeWidth,Math.abs(knee.dot(lateral)));
          const toe=point(c,side+'toebase').sub(point(c,side+'foot')).normalize();
          maxToeSide=Math.max(maxToeSide,Math.abs(toe.dot(lateral)));
          assert(toe.dot(normal)<-.35,'Forefoot points away from the facade');
          const hip=point(c,side+'upleg'),ankle=point(c,side+'foot'),shin=ankle.clone().sub(hip);
          const along=point(c,side+'leg').sub(hip).dot(shin)/shin.lengthSq();
          const bend=point(c,side+'leg').sub(hip.addScaledVector(shin,along));
          maxBackwardKnee=Math.max(maxBackwardKnee,bend.dot(normal));
          if(frame%Math.max(1,Math.floor(fps/12))===0)for(const {mesh,vertex} of soleSamples(c,side)){
            const p=mesh.localToWorld(mesh.applyBoneTransform(vertex,new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,vertex)));
            minBootClearance=Math.min(minBootClearance,p.dot(normal));
          }
        }
        if(t>=3 && frozenPhase===null)frozenPhase=c.wallPhase;
        if(t>=3 && t<3.5)assert(Math.abs(c.wallPhase-frozenPhase)<1e-8,'Stopped body continues cycling');
        if(t>=3.35 && !held)held=ids.map(id=>point(c,id));
        if(t>=3.45 && t<3.5)heldDrift=Math.max(heldDrift,...ids.map((id,i)=>point(c,id).distanceTo(held[i])));
      }
      assert(Object.values(supports).every(n=>n>2),'A limb never supports the body');
      assert(maxContactError<.025,`Hold error ${maxContactError}m`);
      assert(maxSupportSlip<.025,`Sliding support ${maxSupportSlip}m/frame`);
      assert(minBootClearance>=-.005,`Actual boot penetrates wall ${minBootClearance}m`);
      assert(maxBackwardKnee<.03,`Knee bends away from facade ${maxBackwardKnee}m`);
      assert(maxKneeWidth<.55,`Excessive knee splay ${maxKneeWidth}m`);
      assert(maxToeSide<.6,`Foot twists across the facade ${maxToeSide}`);
      assert(maxStepSpeed<24,`Limb discontinuity ${maxStepSpeed}m/s`);
      assert(heldDrift<.005,`Held crawl drifts ${heldDrift}m`);
      const phaseBefore=c.wallPhase;
      c.group.position.addScaledVector(normal,3);c.update(dt,'WALL_RUNNING',new T.Vector3());
      assert.equal(c.wallPhase,0,'Teleport retains stale anchors');
      c.update(dt,'FALLING',new T.Vector3(0,-5,0));
      assert.equal(c.wallContacts,null);assert.equal(c.wallTravelDirection,null);
      results.push({mode,fps,yaw,pass:true,frames:fps*4,supports,minBootClearance,maxContactError,maxSupportSlip,
        maxKneeWidth,maxBackwardKnee,maxToeSide,maxWrist,maxAnkle,maxToe,maxStepSpeed,heldDrift,phaseBeforeTeleport:phaseBefore});
    }catch(error){results.push({mode,fps,yaw,pass:false,error:error.message});}
    finally{disposeRig(c);}
  }
  const positions=geometry.attributes.position,index=geometry.index,edges=[];
  for(let i=0;i<index.count;i+=3)for(let k=0;k<3;k++){
    const a=index.getX(i+k),b=index.getX(i+(k+1)%3);
    edges.push({a,b,length:new T.Vector3().fromBufferAttribute(positions,a).distanceTo(new T.Vector3().fromBufferAttribute(positions,b))});
  }
  for(const speed of [2.8,4.2]){
    const c=actor(),mesh=c.model.getObjectByProperty('isSkinnedMesh',true);mesh.geometry=geometry;
    c.wallNormal=new T.Vector3(0,0,1);c.wallDistance=.7;c.groundProbe=()=>null;c.group.position.set(0,4,.7);
    let maxEdgeGrowth=0,skinFrames=0;
    try{
      for(let frame=0;frame<120;frame++){
        c.group.position.y+=speed/60;c.update(1/60,'WALL_RUNNING',new T.Vector3(0,speed,0));
        if(frame<30 || frame%6!==0)continue;
        const scale=mesh.getWorldScale(new T.Vector3());
        assert(Math.max(scale.x,scale.y,scale.z)-Math.min(scale.x,scale.y,scale.z)<1e-6,'Nonuniform skin scale');
        const posed=Array.from({length:positions.count},(_,v)=>mesh.localToWorld(mesh.applyBoneTransform(v,new T.Vector3().fromBufferAttribute(positions,v))));
        for(const p of posed)assert(p.toArray().every(Number.isFinite),'Invalid skin vertex');
        for(const {a,b,length} of edges)maxEdgeGrowth=Math.max(maxEdgeGrowth,posed[a].distanceTo(posed[b])-length*scale.x);
        skinFrames++;
      }
      assert(maxEdgeGrowth<.16,`Skin triangle spikes by ${maxEdgeGrowth}m`);
      results.push({mode,speed,kind:'skin',pass:true,frames:120,skinFrames,vertices:positions.count,maxEdgeGrowth});
    }catch(error){results.push({mode,speed,kind:'skin',pass:false,error:error.message});}
    finally{disposeRig(c);}
  }
  geometry.dispose();
}
const failed=results.filter(r=>!r.pass);
fs.writeFileSync(folder+'/results.json',JSON.stringify({passed:results.length-failed.length,failed:failed.length,results},null,2)+'\n');
for(const r of failed)console.error('FAIL',r.mode,r.fps,r.yaw,r.error);
console.log(`Natural crawl: ${results.length-failed.length}/${results.length} appearance/frame-rate/facade and skin cases passed`);
if(failed.length)process.exitCode=1;
