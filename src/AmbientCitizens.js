import * as T from 'three';
import {CitizenActor,loadCitizenAssets} from './CitizenActor.js';
import {citizenRoute} from './CitizenNavigation.js';
const up=new T.Vector3(0,1,0),down=new T.Vector3(0,-1,0);
export const CITIZEN_LIMITS=Object.freeze({
 count:10,
 spawnMin:18,
 spawnMax:55,
 retire:100,
 hardRetire:160,
 logicHz:10,
 streetCeiling:140,
 spawnAttempts:4,
 minGroundY:1.2,
 maxStepUp:0.42
});

// Local ambient population. Never enters combat.enemies or changes room scores.
export class AmbientCitizens{
 constructor({scene,city,player,camera,assets=null,random=Math.random,max=10,loadAssets=loadCitizenAssets,onError=()=>{},onPlayerHit=()=>{}}){
  Object.assign(this,{scene,city,player,camera,assets,random,loadAssets,onError,onPlayerHit});
  this.max=Math.min(CITIZEN_LIMITS.count,Math.max(0,max));
  this.slots=[];this.time=0;this.spawnAt=0;this.loadAt=2;this.loading=false;this.failed=false;this.disposed=false;this.serial=0;this.phase=0;
  this.frustum=new T.Frustum();this.view=new T.Matrix4();this.center=new T.Vector3();
  this.metrics={active:0,pool:0,updates:0,animations:0,raycasts:0,spawned:0,recycled:0,lastMs:0,maxMs:0};
 }

 get targets(){return this.slots.filter(n=>n.active);}

 visible(position){
  if(!this.camera)return false;
  return this.frustum.intersectsSphere(new T.Sphere(position.clone().addScaledVector(up,.9),1.2));
 }

 ray(origin,direction,distance){
  this.metrics.raycasts++;
  return this.city.raycast?.(origin,direction,distance) || null;
 }

 isStreetSurface(hit){
  if(!hit?.point || !hit.normal || !Number.isFinite(hit.point.y))return false;
  if(hit.normal.y<.72)return false;
  if(hit.point.y<CITIZEN_LIMITS.minGroundY)return false;
  const surfaceType=hit.mesh?.userData?.surfaceType;
  if(surfaceType==='building')return false;
  if(hit.collider?.building || hit.building)return false;
  return true;
 }

 floor(position,spawn=false){
  if(spawn){
   const searchTop=Math.max(position.y+8,50);
   const origin=new T.Vector3(position.x,Math.min(CITIZEN_LIMITS.streetCeiling,searchTop),position.z);
   const hit=this.ray(origin,down,origin.y+15);
   if(!this.isStreetSurface(hit))return null;
   const head=hit.point.clone().addScaledVector(up,.2);
   if(this.ray(head,up,2.5))return null;
   return hit.point.y;
  }else{
   const origin=new T.Vector3(position.x,position.y+.8,position.z);
   const hit=this.ray(origin,down,2.2);
   if(!this.isStreetSurface(hit))return null;
   if(Math.abs(hit.point.y-position.y)>CITIZEN_LIMITS.maxStepUp)return null;
   return hit.point.y;
  }
 }

 open(position,direction,distance=.75){
  const side=new T.Vector3(direction.z,0,-direction.x);
  for(const offset of [-.22,.22]){
   const from=position.clone().addScaledVector(side,offset);
   from.y+=.85;
   if(this.ray(from,direction,distance))return false;
  }
  return true;
 }

 streetPatch(point,direction){
  const side=new T.Vector3(direction.z,0,-direction.x);
  for(const [axis,distance] of [[direction,2.8],[direction,-2.8],[side,.85],[side,-.85]]){
   const sample=point.clone().addScaledVector(axis,distance);
   if(this.floor(sample)==null)return false;
  }
  for(const [x,z] of [[7,0],[-7,0],[0,7],[0,-7]]){
   const origin=point.clone().add(new T.Vector3(x,1,z)),hit=this.ray(origin,down,14);
   if(hit?.point && hit.normal?.y>.8 && hit.point.y<point.y-1.2)return false;
  }
  return true;
 }

 findOpenStreetYaw(n,baseAngle){
  const offsets=[0,.45,-.45,.9,-.9,1.4,-1.4,2.0,-2.0,Math.PI];
  let bestScore=-1,bestYaw=baseAngle;
  const chest=n.position.clone().addScaledVector(up,.85);
  for(const offset of offsets){
   const yaw=baseAngle+offset;
   const dir=new T.Vector3(Math.sin(yaw),0,Math.cos(yaw));
   const p1=n.position.clone().addScaledVector(dir,1.5);
   if(this.floor(p1)==null)continue;
   if(this.ray(chest,dir,1.6))continue;
   const p2=n.position.clone().addScaledVector(dir,3.0);
   const hasFloor2=this.floor(p2)!=null;
   const hasWall2=!hasFloor2||!!this.ray(chest,dir,3.2);
   const reach=!hasWall2?4.5:2.0;
   const directness=1-(Math.abs(offset)/(Math.PI*2));
   const score=reach*(.6+.4*directness);
   if(score>bestScore){
    bestScore=score;
    bestYaw=yaw;
   }
  }
  return bestYaw;
 }

 spawn(){
  if(!this.assets?.length || this.targets.length>=this.max)return false;
  const player=this.player.position;
  for(let attempt=0;attempt<CITIZEN_LIMITS.spawnAttempts;attempt++){
   const angle=this.random()*Math.PI*2,radius=CITIZEN_LIMITS.spawnMin+this.random()*(CITIZEN_LIMITS.spawnMax-CITIZEN_LIMITS.spawnMin);
   const point=new T.Vector3(player.x+Math.sin(angle)*radius,player.y,player.z+Math.cos(angle)*radius);
   const height=this.floor(point,true);
   if(height==null)continue;
   point.y=height+.01;
   if(this.visible(point) || this.targets.some(n=>n.position.distanceToSquared(point)<9))continue;
   const direction=new T.Vector3(Math.sin(angle+Math.PI/2),0,Math.cos(angle+Math.PI/2));
   if(!this.open(point,direction,1.2)||!this.streetPatch(point,direction))continue;
   const edge=point.clone().addScaledVector(direction,.8);
   if(this.floor(edge)==null)continue;
   let n=this.slots.find(n=>!n.active);
   if(!n){
    const actor=new CitizenActor(this.assets[this.slots.length%this.assets.length]);
    this.scene.add(actor.group);
    n={actor,mesh:actor.group,position:actor.group.position,nonCombatant:true,health:100};
    n.reactToAttack=(key,damage,origin)=>this.hit(n,key,damage,origin);
    this.slots.push(n);
   }else{
    n.actor.reset();
    this.metrics.recycled++;
   }
   const initialYaw=Math.atan2(direction.x,direction.z);
   Object.assign(n,{
    active:true,
    id:++this.serial,
    state:'WALK',
    stateUntil:this.time+4+this.random()*6,
    health:100,
    fearUntil:0,
    speed:0,
    targetYaw:initialYaw,
    yaw:initialYaw,
    logicTime:0,
    animationTime:this.random()*.04,
    blocked:0,
    hitSerial:0,
    moveAge:0,
    moveDuration:.1,
    route:[],
    routeAt:0,
    retaliates:false,
    attackAt:0
   });
   n.moveFrom=point.clone();
   n.moveTo=point.clone();
   n.position.copy(point);
   n.mesh.rotation.y=n.yaw;
   n.actor.play('walk',.1);
   this.metrics.spawned++;
   return true;
  }
  return false;
 }

 retire(n){
  n.active=false;
  n.mesh.visible=false;
  n.actor.mixer.stopAllAction();
 }

 change(n,state,duration=0){
  n.state=state;
  n.stateUntil=this.time+duration;
  const key={IDLE:'idle',WALK:'walk',STARTLED:'startle',HURT:n.hitKey||'hit',FLEE:'run',DEFEND:'idle',ATTACK:'jab'}[state];
  n.actor.play(key,.16,state==='HURT'||state==='STARTLED'||state==='ATTACK');
  if(!['WALK','FLEE'].includes(state)){
   n.speed=0;
   n.moveFrom?.copy(n.position);
   n.moveTo?.copy(n.position);
  }
 }

 alarm(origin,radius=14,except=null){
  for(const n of this.slots){
   if(!n.active || n===except || n.position.distanceTo(origin)>radius || ['HURT','DEFEND','ATTACK'].includes(n.state))continue;
   const line=origin.clone().sub(n.position);
   line.y=0;
   const distance=line.length();
   if(distance>.1 && this.ray(n.position.clone().addScaledVector(up,1),line.normalize(),distance))continue;
   n.threat=origin.clone();
   n.fearUntil=Math.max(n.fearUntil,this.time+9+this.random()*3);
   if(n.state!=='FLEE')this.change(n,'STARTLED',.55);
  }
 }

 hit(n,key,damage,origin){
  if(!n.active)return;
  n.health=Math.max(1,n.health-damage);
  n.hitSerial++;
  n.retaliates=n.hitSerial>=2;
  n.route=[];
  n.routeAt=0;
  n.threat=origin.clone();
  n.fearUntil=this.time+12;
  n.hitKey=key==='special'?'hitUppercut':damage>=24?'hitBody':'hit';
  this.change(n,'HURT',key==='special'?.75:.45);
  this.alarm(n.position,14,n);
 }

 think(n,dt){
  const player=this.player.position;
  if(n.state==='HURT' && this.time>=n.stateUntil)this.change(n,n.retaliates?'DEFEND':'STARTLED',.35);
  else if(n.state==='STARTLED' && this.time>=n.stateUntil)this.change(n,'FLEE',0);
  else if(n.state==='FLEE' && this.time>n.fearUntil && n.position.distanceTo(player)>15)this.change(n,'IDLE',1+this.random()*2);
  else if(['WALK','IDLE'].includes(n.state) && this.time>=n.stateUntil){
   if(n.state==='WALK'){
    this.change(n,'IDLE',1.5+this.random()*3);
   }else{
    n.targetYaw=this.findOpenStreetYaw(n,n.targetYaw+(this.random()-.5)*1.2);
    this.change(n,'WALK',4+this.random()*6);
   }
  }

  if(n.state==='ATTACK'){
   n.attackAge=this.time-n.attackStarted;
   if(!n.attackHit&&n.attackAge>=.3){
    n.attackHit=true;
    const line=player.clone().sub(n.position);
    line.y=0;
    const distance=line.length();
    if(distance<1.9&&Math.abs(player.y-n.position.y)<.9&&distance>.01&&line.normalize().dot(new T.Vector3(Math.sin(n.yaw),0,Math.cos(n.yaw)))>.35&&this.open(n.position,line,distance)){
     this.onPlayerHit(12,n);
    }
   }
   if(this.time>=n.stateUntil)this.change(n,'DEFEND',0);
  }

  if(n.state==='DEFEND'){
   const line=player.clone().sub(n.position);
   line.y=0;
   n.targetYaw=Math.atan2(line.x,line.z);
   if(line.length()>5||this.time>n.fearUntil){
    n.retaliates=false;
    this.change(n,'FLEE');
   }else if(line.length()<1.7&&Math.abs(player.y-n.position.y)<.9&&this.time>=n.attackAt){
    n.attackAt=this.time+1.7;
    n.attackStarted=this.time;
    n.attackHit=false;
    this.change(n,'ATTACK',1.2);
   }
  }

  const away=n.position.clone().sub(n.threat||player);
  away.y=0;
  if(n.state==='FLEE' && this.time>=(n.avoidUntil||0)){
   if(away.lengthSq()>.01)n.targetYaw=Math.atan2(away.x,away.z);
  }else if(n.state==='WALK' && n.position.distanceTo(player)<2.5){
   const avoid=n.position.clone().sub(player);
   avoid.y=0;
   n.targetYaw=this.findOpenStreetYaw(n,Math.atan2(avoid.x,avoid.z));
  }

  // Pedestrian separation
  const repel=new T.Vector3();
  for(const other of this.slots){
   if(other.active&&other!==n){
    const d=n.position.clone().sub(other.position);
    d.y=0;
    const l=d.length();
    if(l>.01 && l<1.3)repel.addScaledVector(d,(1.3-l)/l);
   }
  }
  if(['WALK','FLEE'].includes(n.state)&&repel.lengthSq()>.01){
   n.targetYaw=Math.atan2(Math.sin(n.targetYaw)+repel.x,Math.cos(n.targetYaw)+repel.z);
  }

  const speed=n.state==='FLEE'?4.6:n.state==='WALK'?1.2:0;
  n.speed=speed;
  n.moveFrom.copy(n.position);
  n.moveTo.copy(n.position);
  n.moveAge=0;
  n.moveDuration=dt;
  if(!speed)return;

  if(this.time>=n.routeAt){
   n.route=citizenRoute(this,n,n.targetYaw);
   n.routeAt=this.time+1.2;
  }
  while(n.route.length&&n.position.distanceTo(n.route[0])<.25)n.route.shift();
  if(!n.route.length){
   n.speed=0;
   n.targetYaw=this.findOpenStreetYaw(n,n.targetYaw+1.2);
   n.routeAt=0;
   n.actor.play('idle');
   return;
  }

  const direction=n.route[0].clone().sub(n.position);
  direction.y=0;
  const distance=direction.length();
  direction.normalize();
  n.targetYaw=Math.atan2(direction.x,direction.z);
  const travel=Math.min(distance,speed*dt);
  const target=n.position.clone().addScaledVector(direction,travel);
  const height=this.floor(target);
  if(height==null||!this.open(n.position,direction,travel+.35)){
   n.speed=0;
   n.route=[];
   n.targetYaw=this.findOpenStreetYaw(n,n.targetYaw+1.4);
   n.routeAt=0;
   n.actor.play('idle');
   return;
  }

  n.moveTo.copy(target);
  n.moveTo.y=height+.01;
  n.actor.play(n.state==='FLEE'?'run':'walk');
 }

 update(delta,active=true){
  if(this.disposed || !active || !Number.isFinite(delta)||delta<=0)return;
  const started=performance.now();
  delta=Math.min(delta,.1);
  this.time+=delta;
  this.metrics.updates=0;
  this.metrics.animations=0;
  this.metrics.raycasts=0;
  if(this.city.isStreamed && !this.city.collisionWorld?.ready)return;
  if(!this.assets){
   if(!this.loading&&!this.failed&&this.time>=this.loadAt){
    this.loading=true;
    this.loadAssets().then(assets=>{if(!this.disposed)this.assets=assets;})
     .catch(error=>{this.failures=(this.failures||0)+1;this.failed=this.failures>=3;this.loadAt=this.time+15;this.onError(error);})
     .finally(()=>this.loading=false);
   }
   return;
  }
  if(this.camera){
   this.camera.updateMatrixWorld();
   this.view.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse);
   this.frustum.setFromProjectionMatrix(this.view);
  }
  for(const n of this.slots){
   if(!n.active)continue;
   const distance=n.position.distanceTo(this.player.position),visible=this.visible(n.position);
   n.mesh.visible=!this.camera||visible;
   if(distance>CITIZEN_LIMITS.hardRetire || (distance>CITIZEN_LIMITS.retire&&!visible)){
    this.retire(n);
    continue;
   }
   n.logicTime+=delta;
   n.animationTime+=delta;
   if(n.logicTime>=1/CITIZEN_LIMITS.logicHz){
    this.think(n,Math.min(n.logicTime,.15));
    n.logicTime=0;
    this.metrics.updates++;
   }
   n.moveAge=Math.min(n.moveDuration,n.moveAge+delta);
   n.position.lerpVectors(n.moveFrom,n.moveTo,n.moveDuration>0?n.moveAge/n.moveDuration:1);
   const turn=Math.atan2(Math.sin(n.targetYaw-n.yaw),Math.cos(n.targetYaw-n.yaw));
   n.yaw+=turn*(1-Math.exp(-7*delta));
   n.mesh.rotation.y=n.yaw;
   const interval=n.state==='HURT'||n.state==='STARTLED'?1/30:this.camera&&!visible?1/8:distance<25?1/30:distance<55?1/15:1/8;
   if(n.animationTime>=interval){
    n.actor.update(n.animationTime,n.speed);
    n.animationTime=0;
    this.metrics.animations++;
   }
  }
  if(this.time>=this.spawnAt){
   this.spawnAt=this.time+.12;
   this.spawn();
  }
  this.metrics.active=this.targets.length;
  this.metrics.pool=this.slots.length;
  this.metrics.lastMs=performance.now()-started;
  this.metrics.maxMs=Math.max(this.metrics.maxMs,this.metrics.lastMs);
 }

 clear(){for(const n of this.slots)this.retire(n);this.spawnAt=this.time+.5;}
 dispose(){this.disposed=true;for(const n of this.slots)n.actor.dispose();this.slots=[];}
}
