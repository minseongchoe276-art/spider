import * as THREE from 'three';
export function ghostAt(samples,time) {
  if(!samples?.length||time>samples.at(-1)[0])return null;
  let low=0,high=samples.length-1;
  while(low<high){const mid=(low+high)>>1;if(samples[mid][0]<time)low=mid+1;else high=mid;}
  const b=samples[low],a=samples[Math.max(0,low-1)],t=b[0]===a[0]?0:THREE.MathUtils.clamp((time-a[0])/(b[0]-a[0]),0,1);
  return [a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t,a[3]+(b[3]-a[3])*t,
    a[4]+Math.atan2(Math.sin(b[4]-a[4]),Math.cos(b[4]-a[4]))*t];
}
export class RaceGhost {
  constructor(scene){this.scene=scene;this.samples=[];this.splits=[];
    this.mesh=new THREE.Mesh(new THREE.CapsuleGeometry(.35,1,4,8),new THREE.MeshBasicMaterial({color:0x7efff0,transparent:true,opacity:.28,depthWrite:false}));
    this.mesh.visible=false;this.mesh.renderOrder=1;scene.add(this.mesh);}
  start(course,progress,position,facing){this.course=course;this.reference=progress.data.ghosts[course];this.samples=[[0,...position.toArray(),facing]];this.splits=[];this.lastIndex=0;this.nextSample=.1;}
  update(trial,position,facing,enabled=true) {
    this.mesh.visible=false;if(!trial.isActive||!this.course)return;
    if(trial.elapsedTime>=this.nextSample&&this.samples.length<3000){this.samples.push([trial.elapsedTime,...position.toArray(),facing]);this.nextSample=trial.elapsedTime+.1;}
    while(this.lastIndex<trial.currentIndex){this.splits.push(trial.splitTimes?.[this.lastIndex]??trial.elapsedTime);this.lastIndex++;}
    const p=enabled&&ghostAt(this.reference?.samples,trial.elapsedTime);
    if(p){this.mesh.visible=true;this.mesh.position.set(p[0],p[1]+.9,p[2]);this.mesh.rotation.y=p[3];}
  }
  get splitDelta(){const i=this.splits.length-1,other=this.reference?.splits?.[i];return Number.isFinite(other)?this.splits[i]-other:null;}
  finish(trial,position,facing){
    if(!this.course)return;
    const sample=[trial.elapsedTime,...position.toArray(),facing];
    if(this.samples.at(-1)?.[0]===trial.elapsedTime)this.samples[this.samples.length-1]=sample;
    else if(this.samples.length<3000)this.samples.push(sample);
    else this.samples[this.samples.length-1]=sample;
    while(this.lastIndex<trial.currentIndex){this.splits.push(trial.splitTimes?.[this.lastIndex]??trial.elapsedTime);this.lastIndex++;}
    this.mesh.visible=false;
  }
  stop(){this.mesh.visible=false;this.course=null;}
}
