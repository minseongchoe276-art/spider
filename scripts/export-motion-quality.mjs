import fs from 'node:fs';
import crypto from 'node:crypto';
import {gzipSync} from 'node:zlib';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadMotionRig,joint,point,disposeRig} from './lib/motion-rig.mjs';
import {boneId} from '../src/MotionRetarget.js';

const folder=process.env.MOTION_QUALITY_DIR || 'docs/qa/motion-quality-2026-10-20';fs.mkdirSync(folder,{recursive:true});
const tracked=['src/Character.js','src/CharacterPose.js','src/CharacterAppearance.js','src/MotionRetarget.js','src/JointConstraints.js',
 'public/models/shadow-pulse-rig.glb','public/models/appearance-web.glb',
 ...fs.readdirSync('public/motions').filter(f=>f.endsWith('.json')).map(f=>'public/motions/'+f)];
const fingerprint=()=>Object.fromEntries(tracked.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const sourceHashes=fingerprint();
const {actor,clips}=await loadMotionRig();
const fractions=[0,.12,.28,.45,.62,.8,.98],results=[];
const combat=new Set(['combatIdle','jab','cross','hook','heavy','special','rightHook','guard','hitHead','slamLand']);
const air=new Set(['jump','drop','jumpDown','jumpDownVariant','fall','fallIdle','fallVariant','airTrick','backTrick','slam','swing','zip']);
const keys=['head','hips','lefthand','righthand','leftfoot','rightfoot'];
for(const mode of ['web','combat']){
 // Both gameplay modes now use the same published skin. Keep two mode rows
 // for review compatibility, without measuring a removed character model.
 const b=fs.readFileSync('public/models/appearance-web.glb'),len=b.readUInt32LE(12),g=JSON.parse(b.subarray(20,20+len));
 g.buffers[0].uri='data:application/octet-stream;base64,'+b.subarray(28+len).toString('base64');
 delete g.images;delete g.textures;g.materials=[];for(const m of g.meshes)for(const p of m.primitives)delete p.material;
 const geometry=(await new GLTFLoader().parseAsync(JSON.stringify(g),'')).scene.getObjectByProperty('isSkinnedMesh',true).geometry;
 for(const item of clips.filter(c=>!c.archived)){
  const c=actor(),mesh=c.model.getObjectByProperty('isSkinnedMesh',true);mesh.geometry=geometry;
  const bones=Object.values(c.bones),speed={walk:1.6,regularRun:4.8,run:6.5}[item.key] || 0;
  const state=item.key==='wall'?'WALL_RUNNING':item.key==='swing'?'SWINGING':item.key==='zip'?'WEB_ZIP':item.key==='jump'?'JUMPING':air.has(item.key)?'FALLING':item.key==='roll'?'ROLLING':item.key==='land' || item.key==='slamLand'?'LANDING':item.key.startsWith('turn')?'TURNING':item.key==='run'?'SPRINTING':speed?'RUNNING':'IDLE';
  const wall=state==='WALL_RUNNING',ground=['IDLE','RUNNING','SPRINTING','TURNING','LANDING','ROLLING'].includes(state);
  const v=wall?new T.Vector3(0,2.8,0):state==='SWINGING'?new T.Vector3(0,-2,10):state==='WEB_ZIP'?new T.Vector3(0,6,12):state==='FALLING'?new T.Vector3(0,-15,0):state==='JUMPING'?new T.Vector3(0,7,0):new T.Vector3(0,0,speed),count=Math.ceil(item.clip.duration*60);
  c.group.position.set(0,wall?4:ground?.1:10,wall?.7:0);c.groundProbe=ground?()=>0:()=>null;
  c.wallNormal=new T.Vector3(0,0,1);c.wallDistance=.7;c.combatStance=combat.has(item.key);
  const anchor=new T.Vector3(0,18,5);c.webAttachments=['SWINGING','WEB_ZIP'].includes(state)?[{hand:'left',anchor}]:[];
  c.fadeToAction(item.key,0);c.fadeToAction=()=>{};
  const frames=fractions.map(f=>Math.round(count*f)),poses=[],timeline=[],previous=new Map(),metrics={maxPointSpeed:0,maxBoneSpeed:0,worstPoint:null,worstBone:null};
  const bounds=new T.Box3();let lastPositions;
  try{
   for(let frame=0;frame<=count;frame++){
    const dt=frame?1/60:0,t=Math.min(frame/60,item.clip.duration-1e-6);
    c.activeAction.enabled=true;c.activeAction.paused=false;c.activeAction.time=t;
    if(state==='TURNING'){c.pendingTurn=item.key==='turnLeft'?'left':'right';c.targetFacingAngle=(item.key==='turnLeft'?-1:1)*Math.PI/2*T.MathUtils.smoothstep(t/item.clip.duration,0,1);}
    if(combat.has(item.key) || item.key==='slam')c.combatAction={id:1,key:item.key,time:t,duration:item.clip.duration};
    c.group.position.addScaledVector(v,dt);c.update(dt,state,v,['SWINGING','WEB_ZIP'].includes(state)?anchor:null);c.group.updateMatrixWorld(true);
    const points=keys.map(id=>point(c,id));
    if(frame>15){
     for(let i=0;i<points.length;i++){const rate=points[i].distanceTo(lastPositions[i])*60;if(rate>metrics.maxPointSpeed){metrics.maxPointSpeed=rate;metrics.worstPoint={id:keys[i],phase:t/item.clip.duration};}}
     for(const bone of bones){const last=previous.get(bone);if(!last)continue;const rate=last.angleTo(bone.quaternion)*60*180/Math.PI;if(rate>metrics.maxBoneSpeed){metrics.maxBoneSpeed=rate;metrics.worstBone={id:boneId(bone.name),phase:t/item.clip.duration};}}
    }
    lastPositions=points;for(const bone of bones)previous.set(bone,bone.quaternion.clone());
    const origin=c.group.position.clone();origin.x=0;origin.z=wall?.7:0;origin.y=wall?0:ground?.1:0;
    const snapshot={time:t,root:origin.toArray(),model:{p:c.model.position.toArray(),q:c.model.quaternion.toArray()},bones:bones.map(b=>[b.name,...b.position.toArray(),...b.quaternion.toArray()])};
    timeline.push(snapshot);
    if(!frames.includes(frame))continue;
    const shift=origin.clone().sub(c.group.position);
    for(let i=0;i<geometry.attributes.position.count;i++)bounds.expandByPoint(mesh.localToWorld(mesh.applyBoneTransform(i,new T.Vector3().fromBufferAttribute(geometry.attributes.position,i))).add(shift));
    poses.push({phase:fractions[frames.indexOf(frame)],...snapshot});
   }
   results.push({mode,key:item.key,state,loop:item.loop,duration:item.clip.duration,frames:count+1,metrics,bounds:[bounds.min.toArray(),bounds.max.toArray()],poses});
   fs.mkdirSync(folder+'/timelines',{recursive:true});
   fs.writeFileSync(`${folder}/timelines/${mode}-${item.key}.bin`,gzipSync(JSON.stringify(timeline)));
   console.log('SAMPLED',mode,item.key,metrics.maxPointSpeed.toFixed(2)+'m/s',metrics.worstBone?.id,metrics.maxBoneSpeed.toFixed(0)+'deg/s');
  }finally{disposeRig(c);}
 }
 geometry.dispose();
}
const sourceAfter=fingerprint();if(tracked.some(p=>sourceHashes[p]!==sourceAfter[p]))throw new Error('Runtime changed during capture; export again');
fs.writeFileSync(folder+'/poses.json',JSON.stringify({fractions,views:['front','side','back'],sourceHashes,results}));
console.log('Exported',results.length,'timelines;',results.reduce((n,r)=>n+r.frames,0),'frames;',results.reduce((n,r)=>n+r.poses.length,0),'complete poses');
