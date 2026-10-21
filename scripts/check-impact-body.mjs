import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadMotionRig,disposeRig} from './lib/motion-rig.mjs';
const folder=process.env.IMPACT_REPORT_DIR || 'docs/qa/individual-motions-2026-10-21';fs.mkdirSync(folder,{recursive:true});
const {actor}=await loadMotionRig();
const raw=fs.readFileSync('public/models/appearance-web.glb'),size=raw.readUInt32LE(12),g=JSON.parse(raw.subarray(20,20+size));
g.buffers[0].uri='data:application/octet-stream;base64,'+raw.subarray(28+size).toString('base64');delete g.images;delete g.textures;g.materials=[];for(const mesh of g.meshes)for(const p of mesh.primitives)delete p.material;
const geometry=(await new GLTFLoader().parseAsync(JSON.stringify(g),'')).scene.getObjectByProperty('isSkinnedMesh',true).geometry,results=[];
for(const [fps,slope] of [[24,0],[60,0],[144,0],[60,.2],[60,-.2]])for(const key of ['roll','slamLand']){
 const c=actor(),mesh=c.model.getObjectByProperty('isSkinnedMesh',true);mesh.geometry=geometry;
 if(slope)c.surfaceProbe=p=>({height:p.z*slope,normal:new T.Vector3(0,1,-slope).normalize()});
 c.combatStance=key==='slamLand';c.fadeToAction(key,0);c.fadeToAction=()=>{};
 const clip=c.activeAction.getClip(),state=key==='roll'?'ROLLING':'LANDING',root=c.group.position.clone(),point=new T.Vector3();
 let minimum=Infinity,maxLift=0,maxLiftSpeed=0,lastLift=0,frames=0,worstPhase=0;
 try{
  for(let i=0;i<=Math.ceil(clip.duration*fps);i++){
   const t=Math.min(i/fps,clip.duration-1e-6),action=c.activeAction;action.time=t;action.paused=false;action.enabled=true;
   if(key==='slamLand')c.combatAction={id:1,key,time:t,duration:clip.duration};
   c.update(i?1/fps:0,state,new T.Vector3());c.group.updateMatrixWorld(true);
   const lift=c.model.position.y-(key==='roll'?0:-.1);maxLift=Math.max(maxLift,lift);if(i)maxLiftSpeed=Math.max(maxLiftSpeed,Math.abs(lift-lastLift)*fps);lastLift=lift;
   for(let v=0;v<geometry.attributes.position.count;v++){
    mesh.localToWorld(mesh.applyBoneTransform(v,point.fromBufferAttribute(geometry.attributes.position,v)));const y=point.y-point.z*slope;
    if(y<minimum){minimum=y;worstPhase=t/clip.duration;}
   }
   assert(c.group.position.equals(root),'Render clearance moved the physics capsule');frames++;
  }
  assert(minimum>=-.005,`${key} skin penetrated the floor ${(minimum*1000).toFixed(1)}mm at ${(worstPhase*100).toFixed(1)}%`);
  assert(maxLift<.25,`${key} floated more than 25cm`);
  assert(maxLiftSpeed<5,`${key} clearance snapped at ${maxLiftSpeed.toFixed(2)}m/s`);
  assert(c.impactVertices.length<2000,'Impact envelope skins too many vertices per frame');
  results.push({key,fps,slope,pass:true,minimum,maxLift,maxLiftSpeed,worstPhase,frames,skinVertices:geometry.attributes.position.count,envelopeVertices:c.impactVertices.length});
 }catch(error){results.push({key,fps,slope,pass:false,error:error.message,minimum,maxLift,maxLiftSpeed,worstPhase,frames});}
 finally{disposeRig(c);}
}
const transitions=[];
for(const fps of [24,60,144])for(const key of ['roll','slamLand'])for(const exit of ['RUNNING','JUMPING']){
 const c=actor();c.model.getObjectByProperty('isSkinnedMesh',true).geometry=geometry;
 try{
  c.fadeToAction(key,0);c.activeAction.time=c.activeAction.getClip().duration*.4;
  if(key==='slamLand')c.combatAction={id:1,key,time:c.activeAction.time,duration:c.activeAction.getClip().duration};
  c.update(1/fps,key==='roll'?'ROLLING':'LANDING',new T.Vector3());
  let last=c.impactLift,maxReleaseStep=0;c.combatAction=null;
  for(let frame=0;frame<fps*.6;frame++){
   c.update(1/fps,exit,new T.Vector3(0,exit==='JUMPING'?4:0,exit==='RUNNING'?1.6:0));
   maxReleaseStep=Math.max(maxReleaseStep,Math.abs(c.impactLift-last));last=c.impactLift;
   assert(Number.isFinite(c.model.position.y));
  }
  assert(c.impactLift<.0001,'Interrupted impact retained its floor offset');
  assert(maxReleaseStep<.09,'Interrupted impact dropped its support in one frame');
  transitions.push({fps,key,exit,maxReleaseStep,pass:true});
 }finally{disposeRig(c);}
}
const report={passed:results.filter(r=>r.pass).length,total:results.length,results,transitions};fs.writeFileSync(folder+'/impact-body.json',JSON.stringify(report,null,2)+'\n');
for(const r of results)console.log([r.pass?'PASS':'FAIL',r.key,r.fps,'FPS',r.minimum.toFixed(4)+'m',r.error].filter(v=>v!==undefined).join(' '));if(report.passed!==report.total)process.exitCode=1;
