import fs from 'node:fs';
import * as THREE from 'three';
import {loadMotionRig,joint,point,disposeRig} from '../../../scripts/lib/motion-rig.mjs';
const {actor}=await loadMotionRig(),rows=[];
for(const fps of [24,30,60,144])for(const [key,speed] of [['walk',1.6],['jog',3.4],['regularRun',4.8],['run',6.5]])for(const grade of [0,.3,-.3]){
 const c=actor(),normal=new THREE.Vector3(0,1,-grade).normalize();c.surfaceProbe=p=>({height:grade*p.z,normal});
 let minToe=Infinity,maxAnkle=0,maxAnkleSpeed=0,maxFlip=null,toeWorst=null,last={};
 for(let i=0;i<fps*3;i++){
  c.group.position.z+=speed/fps;c.group.position.y=.1+grade*c.group.position.z;
  c.update(1/fps,key==='run'?'SPRINTING':'RUNNING',new THREE.Vector3(0,grade*speed,speed));
  for(const side of ['left','right']){
   const foot=joint(c,side+'foot'),q=foot.getWorldQuaternion(new THREE.Quaternion()),ankle=point(c,side+'foot'),toe=point(c,side+'toebase');
   if(toe.y-grade*toe.z<minToe){minToe=toe.y-grade*toe.z;toeWorst={time:i/fps,side,plant:!!c.movingPlants?.[side],age:c.movingPlants?.[side]?.age,ankle:ankle.toArray()};}
   if(last[side] && i>fps/3){let turn=THREE.MathUtils.radToDeg(q.angleTo(last[side]));if(turn>maxAnkle){maxAnkle=turn;maxFlip={time:i/fps,side,action:c.activeAction.getClip().name,plant:!!c.movingPlants?.[side]};}maxAnkleSpeed=Math.max(maxAnkleSpeed,turn*fps);}
   last[side]=q;
  }
 }
 rows.push({fps,key,grade,minToe,maxAnkle,maxAnkleSpeed,maxFlip,toeWorst});disposeRig(c);
}
const file=process.argv[2] || 'gait-measurements.json';fs.writeFileSync(new URL(file,import.meta.url),JSON.stringify(rows,null,2));
console.log(rows.sort((a,b)=>b.maxAnkle-a.maxAnkle).slice(0,12));
