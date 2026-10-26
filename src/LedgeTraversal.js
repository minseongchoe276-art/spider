import * as THREE from 'three';
import { resolveBody } from './MovementCollision.js';

const up=new THREE.Vector3(0,1,0);
const smooth=t=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};

export function groundSample(city,point,range=0.8) {
  if(city.collisionWorld) {
    if(city.collisionWorld.groundSample)return city.collisionWorld.groundSample(point,range);
    const height=city.collisionWorld.groundAt(point,range);
    return height===null?null:{height,normal:up.clone()};
  }
  let height=point.y>=0 && point.y<range?0:null;
  for(const box of city.colliders || [])if(point.x>=box.minX && point.x<=box.maxX &&
    point.z>=box.minZ && point.z<=box.maxZ && box.maxY<=point.y && box.maxY>=point.y-range)
    height=Math.max(height ?? -Infinity,box.maxY);
  return height===null?null:{height,normal:up.clone()};
}

export function mantlePosition(plan,progress) {
  if(plan.end.y<plan.height){
    const p=plan.start.clone();
    // Clear the parapet with the full capsule before moving across; lower
    // onto the real roof only after the body is safely behind the lip.
    p.y=THREE.MathUtils.lerp(plan.start.y,plan.height+.16,smooth(progress/.42));
    const across=smooth((progress-.42)/.36);
    p.x=THREE.MathUtils.lerp(plan.start.x,plan.end.x,across);
    p.z=THREE.MathUtils.lerp(plan.start.z,plan.end.z,across);
    if(progress>.78)p.y=THREE.MathUtils.lerp(plan.height+.16,plan.end.y,smooth((progress-.78)/.22));
    return p;
  }
  // Keep the full capsule outside the facade until its feet clear the edge.
  const p=plan.start.clone();
  p.y=THREE.MathUtils.lerp(plan.start.y,plan.height+0.16,smooth(progress/0.55));
  if(progress>0.55) {
    const across=smooth((progress-0.55)/0.45);
    p.x=THREE.MathUtils.lerp(plan.start.x,plan.end.x,across);
    p.z=THREE.MathUtils.lerp(plan.start.z,plan.end.z,across);
    p.y=THREE.MathUtils.lerp(plan.height+0.16,plan.end.y,across);
  }
  return p;
}

export function resolveTraversal(city,start,end) {
  const velocity=end.clone().sub(start);
  for(const box of city.colliders || [])if(end.y+1.8>box.minY+1e-6 && end.y-0.1<box.maxY-1e-6 &&
    end.x>box.minX-0.7+1e-6 && end.x<box.maxX+0.7-1e-6 &&
    end.z>box.minZ-0.7+1e-6 && end.z<box.maxZ+0.7-1e-6)
    return {position:start.clone(),contacts:[{normal:new THREE.Vector3(0,-1,0)}]};
  return city.resolveMovement?city.resolveMovement(start,end,velocity)
    :city.collisionWorld?.resolve?city.collisionWorld.resolve(start,end,velocity)
    :resolveBody(start,end,velocity,city.colliders);
}

export function planMantle(city,start,normal,height) {
  if(!Number.isFinite(height) || ![...start,...normal].every(Number.isFinite) || normal.lengthSq()<0.9)return null;
  if(Math.abs(normal.y)>0.2 || height-start.y>0.95 || height-start.y< -(city.collisionWorld?1.35:.2))return null;
  const origin=start.clone();origin.y=height-0.15;
  const hit=city.raycast?.(origin,normal.clone().negate(),1.2)
    || city.collisionWorld?.raycast?.(origin,normal.clone().negate(),1.2);
  const gap=hit?.distance ?? 0.7;
  // Streamed facades can leave the capsule only 0.375m from the edge.
  // A fixed 1.65m crossing then overshoots a usable balcony into its back
  // wall. Place the capsule and its support footprint beyond the measured lip
  // before considering deeper landings; all footprint/path checks still run.
  const landingInset=city.collisionWorld?.resolve ? .58 : .82;
  for(const depth of [gap+landingInset,gap+1.15,1.65,2.1,2.55,3,3.45]){
  const end=start.clone().addScaledVector(normal,-depth);end.y=height+.3;
  const support=groundSample(city,end,1.9);
  if(!support || support.normal.y<.85 || support.height>height+.16 || support.height<height-1.4)continue;
  end.y=support.height+.1;
  if(!hasMantleSupport(city,end,support.height))continue;
  if(city.raycast?.(end.clone().add(new THREE.Vector3(0,.15,0)),up,1.6))continue;
  // A railing can have open space at chest height and a bar above the roof.
  // Try reachable grips above that bar, still sweeping every capsule step.
  for(const lift of [0,.3,.6,.9,1.2]){
  const gripHeight=height+lift;
  if(gripHeight-start.y>1.25)continue;
  const plan={start:start.clone(),end,normal:normal.clone(),height:gripHeight,duration:end.y<gripHeight?1.2:.72,elapsed:0};
  plan.gap=gap;
  plan.edge=start.clone().addScaledVector(normal,-plan.gap);plan.edge.y=gripHeight+0.06;
  let previous=start.clone();
  let clear=true;
  for(let i=1;i<=36;i++) {
    const target=mantlePosition(plan,i/36);
    const resolved=resolveTraversal(city,previous,target);
    if(resolved.position.distanceTo(target)>0.075 || resolved.contacts.some(c=>c.normal.y< -0.5)){clear=false;break;}
    previous=resolved.position;
  }
  if(clear)return plan;
  }
  }
  return null;
}

export function hasMantleSupport(city,end,height) {
  // Centre-only probes allowed mantling onto narrow rails or missing tiles.
  for(const x of [-0.45,0,0.45])for(const z of [-0.45,0,0.45]) {
    const sample=groundSample(city,end.clone().add(new THREE.Vector3(x,0.25,z)),0.65);
    if(!sample || Math.abs(sample.height-height)>0.16 || sample.normal.y<0.85)return false;
  }
  return true;
}
