import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadMotionRig,joint,disposeRig} from './lib/motion-rig.mjs';

// Parallel transport removes the limb's swing/bend. What remains is axial
// skin twist, which a wrist/ankle-local clamp cannot detect.
function axialRate(last,q,axis,dt){
 const transported=new T.Quaternion().setFromUnitVectors(last.axis,axis).multiply(last.q);
 const d=q.clone().multiply(transported.invert()).normalize();
 const angle=2*Math.atan2(new T.Vector3(d.x,d.y,d.z).dot(axis),d.w);
 return Math.abs(Math.atan2(Math.sin(angle),Math.cos(angle)))*180/Math.PI/dt;
}
const {actor}=await loadMotionRig(),results=[],folder='docs/qa/motion-quality-2026-10-20';fs.mkdirSync(folder,{recursive:true});
for(const mode of ['web','combat']){
 const raw=fs.readFileSync(`public/models/appearance-${mode}.glb`),len=raw.readUInt32LE(12),json=JSON.parse(raw.subarray(20,20+len));
 json.buffers[0].uri='data:application/octet-stream;base64,'+raw.subarray(28+len).toString('base64');delete json.images;delete json.textures;json.materials=[];
 for(const m of json.meshes)for(const p of m.primitives)delete p.material;
 const geometry=(await new GLTFLoader().parseAsync(JSON.stringify(json),'')).scene.getObjectByProperty('isSkinnedMesh',true).geometry;
 for(const fps of [24,30,60,144])for(const key of ['runStop','slamLand','hook','wall-steering']){
  const c=actor();c.model.getObjectByProperty('isSkinnedMesh',true).geometry=geometry;
  const wall=key==='wall-steering',clip=c.actions[wall?'wall':key].getClip(),dt=1/fps,previous=new Map();let maximum=0,frames=0;
  const part=wall?'forearm':'leg',end=wall?'hand':'foot',duration=wall?4:clip.duration;
  c.group.position.set(0,wall?4:.1,wall?.7:0);c.wallNormal=new T.Vector3(0,0,1);c.wallDistance=.7;
  c.groundProbe=wall?()=>null:()=>0;c.combatStance=!wall && key!=='runStop';
  if(!wall){c.fadeToAction(key,0);c.fadeToAction=()=>{};}
  try{
   for(let i=0;i<Math.ceil(duration*fps);i++){
    const t=i/fps,v=wall?new T.Vector3(t<1?0:t<2?1.8:0,t<2?2.8:t<3?4.2:t<3.4?0:-1.6,0):new T.Vector3();
    if(!wall){c.activeAction.time=Math.min(t,clip.duration-1e-6);c.activeAction.enabled=true;c.activeAction.paused=false;if(key!=='runStop')c.combatAction={id:1,key,time:t,duration:clip.duration};}
    c.group.position.addScaledVector(v,dt);c.update(dt,wall?'WALL_RUNNING':key==='slamLand'?'LANDING':'IDLE',v);c.group.updateMatrixWorld(true);
    for(const side of ['left','right']){
     const b=joint(c,side+part),child=joint(c,side+end),q=b.getWorldQuaternion(new T.Quaternion());
     const axis=child.getWorldPosition(new T.Vector3()).sub(b.getWorldPosition(new T.Vector3())).normalize(),last=previous.get(side);
     if(last && t>.25)maximum=Math.max(maximum,axialRate(last,q,axis,dt));
     previous.set(side,{q,axis});
    }frames++;
   }
   assert(maximum<(wall?600:450),`${key} axial twist ${maximum.toFixed(1)}deg/s at ${fps}FPS`);
   results.push({mode,fps,key,pass:true,maxAxialDegreesPerSecond:maximum,frames});
  }catch(error){results.push({mode,fps,key,pass:false,maxAxialDegreesPerSecond:maximum,frames,error:error.message});}
  finally{disposeRig(c);}
 }
 geometry.dispose();
}
fs.writeFileSync(folder+'/limb-continuity.json',JSON.stringify({passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results},null,2)+'\n');
for(const r of results)console.log(r.pass?'PASS':'FAIL',r.mode,r.fps,r.key,r.maxAxialDegreesPerSecond.toFixed(1)+'deg/s');
if(results.some(r=>!r.pass))process.exitCode=1;
