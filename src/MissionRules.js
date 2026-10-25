import {GROUNDED} from './MotionCatalog.js';

export const MISSION_TYPES=Object.freeze(['rooftops','discover','travel','delivery','technique']);
export const targetedMission=type=>type==='rooftops'||type==='delivery';
const cell=p=>`${Math.floor(p.x/100)}:${Math.floor(p.z/100)}`;
export function createMission(type,city,position,points=[]){
  return {type,city,points,index:0,distance:0,elapsed:0,dwell:0,skillTime:0,
    // Each outing starts a fresh survey; an explored map can always be replayed.
    visited:new Set([cell(position)]),found:new Set()};
}
export function missionTarget(m){return m&&targetedMission(m.type)?m.points[m.index]:null;}
export function advanceMission(m,{position,state,webs=0,distance=0,safe=false},dt){
  if(!Number.isFinite(dt)||dt<=0||dt>.25||!position||![position.x,position.y,position.z].every(Number.isFinite)){
    m.dwell=0;m.skillTime=0;return false;
  }
  m.elapsed+=dt;
  if(Number.isFinite(distance)&&distance>0)m.distance+=distance;
  const grounded=GROUNDED.includes(state),target=missionTarget(m);
  if(m.type==='discover'&&distance>0&&!m.visited.has(cell(position)))m.found.add(cell(position));
  if(target){
    const close=Math.hypot(target.x-position.x,target.z-position.z)<3&&Math.abs(target.y-position.y)<.8;
    m.dwell=close&&grounded&&safe?m.dwell+dt:0;
    if(m.dwell>=.6){m.index++;m.dwell=0;}
  }
  if(m.type==='technique'){
    if(m.index===0){m.skillTime=state==='SWINGING'&&webs>0?m.skillTime+dt:0;if(m.skillTime>=3){m.index++;m.skillTime=0;}}
    else if(m.index===1){m.skillTime=state==='WALL_RUNNING'||state==='MANTLING'?m.skillTime+dt:0;if(m.skillTime>=1){m.index++;m.skillTime=0;}}
    else {m.dwell=grounded&&safe?m.dwell+dt:0;if(m.dwell>=.6)m.index=3;}
  }
  return targetedMission(m.type)?m.index>=m.points.length:
    m.type==='travel'?m.distance>=500:m.type==='discover'?m.found.size>=3:m.type==='technique'&&m.index>=3;
}
export function missionFraction(m){
  return Math.min(1,targetedMission(m.type)?m.index/m.points.length:m.type==='travel'?m.distance/500:m.type==='discover'?m.found.size/3:m.index/3);
}
export function completionRecord(m){return {type:m.type,distance:Math.round(m.distance),seconds:Math.round(m.elapsed),sectors:m.found.size};}
export function validCompletion(value){
  return value&&MISSION_TYPES.includes(value.type)&&['distance','seconds','sectors'].every(k=>Number.isSafeInteger(value[k])&&value[k]>=0&&value[k]<=1e12)
    ?{type:value.type,distance:value.distance,seconds:value.seconds,sectors:value.sectors}:null;
}
