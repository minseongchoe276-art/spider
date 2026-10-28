import * as T from 'three';
const up=new T.Vector3(0,1,0),down=new T.Vector3(0,-1,0);
export const VEHICLE=Object.freeze({length:4.7,width:2.65,wheelbase:2.8,maxSpeed:24,reverseSpeed:6,acceleration:5.8,brake:13,maxSlope:28*Math.PI/180,maxStep:.24,maxSupportWarp:.45,step:1/90});
export class VehicleController{
 constructor(city,position=new T.Vector3(),yaw=0){this.city=city;this.position=position.clone();this.yaw=yaw;this.speed=0;this.steering=0;this.spin=0;this.accumulator=0;this.velocity=new T.Vector3();this.occupied=()=>false;
  const ground=this.support(this.position,yaw);if(ground){this.position.y=ground.height+.02;this.rideY=ground.height;this.pitch=ground.pitch;this.roll=ground.roll;this.contacts=ground.contacts;this.groundPlane=ground;this.supportPosition=this.position.clone();this.supportYaw=yaw;}
 }
 ground(point,spawn=false){return this.groundSample(point,spawn)?.height??null;}
 groundSample(point,spawn=false){
  const origin=point.clone();origin.y+=spawn?4:1.6;const hit=this.city.raycast?.(origin,down,spawn?140:3.6);
  if(hit){if(hit.normal?.y<.75||hit.mesh?.userData?.surfaceType==='building'||(spawn&&hit.building))return null;return {height:hit.point.y,normal:hit.normal};}
  return this.city.isStreamed?null:(spawn||point.y<2.5?{height:0,normal:up}:null);
 }
 local(x,z,position=this.position,yaw=this.yaw){return new T.Vector3(x,0,z).applyAxisAngle(up,yaw).add(position);}
 support(position,yaw){
  const extent=this.city.playableHalfExtent;if(extent&&(Math.abs(position.x)+2.7>extent||Math.abs(position.z)+2.7>extent))return null;
  const samples=[],normals=[];for(const [x,z] of [[0,0],[-.88,1.55],[.88,1.55],[-.88,-1.55],[.88,-1.55]]){const hit=this.groundSample(this.local(x,z,position,yaw));if(!hit)return null;samples.push(hit.height);normals.push(hit.normal);}
  // Fit a support plane before looking for discontinuities. Front/rear tyre
  // height differences are the road grade, not a step or a bad sample.
  const slopeZ=(samples[1]+samples[2]-samples[3]-samples[4])/6.2;
  const slopeX=(samples[2]+samples[4]-samples[1]-samples[3])/3.52;
  if(Math.hypot(slopeX,slopeZ)>Math.tan(VEHICLE.maxSlope))return null;
  if(Math.max(...samples)-Math.min(...samples)>VEHICLE.maxStep && normals.every(n=>n&&n.y>.999))return null;
  const offsets=[[0,0],[-.88,1.55],[.88,1.55],[-.88,-1.55],[.88,-1.55]];
  const bases=samples.map((y,i)=>y-slopeX*offsets[i][0]-slopeZ*offsets[i][1]);
  const median=[...bases].sort((a,b)=>a-b)[2];
  if(bases.some(y=>Math.abs(y-median)>VEHICLE.maxSupportWarp))return null;
  const height=bases.reduce((a,b)=>a+b,0)/bases.length;
  if(Math.abs(height-position.y)>.4)return null;
  return {height,pitch:-Math.atan(slopeZ),roll:Math.atan(slopeX),slopeX,slopeZ,contacts:offsets.slice(1).map(([x,z],i)=>({x,z,y:samples[i+1]}))};

 }
 overlapsBuildings(position,yaw){
  const forward=new T.Vector3(Math.sin(yaw),0,Math.cos(yaw)),right=new T.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  for(const box of this.city.colliders||[]){
   if(box.maxY<=position.y+.35||box.minY>=position.y+1.5)continue;
   const dx=(box.minX+box.maxX)/2-position.x,dz=(box.minZ+box.maxZ)/2-position.z,hx=(box.maxX-box.minX)/2,hz=(box.maxZ-box.minZ)/2;
   if(Math.abs(dx)>hx+3||Math.abs(dz)>hz+3)continue;
   const separated=[[1,0],[0,1],[right.x,right.z],[forward.x,forward.z]].some(([x,z])=>Math.abs(dx*x+dz*z)>1.33*Math.abs(right.x*x+right.z*z)+2.35*Math.abs(forward.x*x+forward.z*z)+hx*Math.abs(x)+hz*Math.abs(z)+.025);
   if(!separated)return true;
  }return false;
 }
 bodyPoint(x,height,z,position,yaw,pitch=0,roll=0){return new T.Vector3(x,height,z).applyEuler(new T.Euler(pitch,yaw,roll,'YXZ')).add(position);}
 clearMove(from,oldYaw,to,yaw,ground={}){
  const previous=this.supportPosition?.distanceToSquared(from)<1e-10 && this.supportYaw===oldYaw?this.groundPlane:this.support(from,oldYaw);if(!previous)return false;
  const start=from.clone();start.y=previous.height+.02;
  if(this.overlapsBuildings(to,yaw)||this.city.collisionWorld?.vehicleBlocked?.(start,to,yaw,ground.pitch,ground.roll,{yaw:oldYaw,pitch:previous.pitch,roll:previous.roll}))return false;
  for(const [x,z] of [[-1.33,-2.35],[1.33,-2.35],[-1.33,2.35],[1.33,2.35],[0,0]])for(const height of [.5,1.0]){
   const a=this.bodyPoint(x,height,z,start,oldYaw,previous.pitch,previous.roll),b=this.bodyPoint(x,height,z,to,yaw,ground.pitch,ground.roll),dir=b.sub(a),distance=dir.length();
   if(distance>.00001&&this.city.raycast?.(a,dir.divideScalar(distance),distance+.025))return false;
  }
  return !this.occupied(to,yaw);
 }

 update(delta,input={}){
  if(!Number.isFinite(delta)||delta<=0)return;this.accumulator+=Math.min(delta,.1);
  while(this.accumulator>=VEHICLE.step){this.tick(VEHICLE.step,input);this.accumulator-=VEHICLE.step;}
 }
 tick(dt,input){
  const steer=(input.left?1:0)-(input.right?1:0),target=steer*(.5/(1+Math.abs(this.speed)*.045));this.steering=T.MathUtils.damp(this.steering,target,7,dt);
  const throttle=(input.forward?1:0)-(input.backward?1:0),braking=(throttle&&Math.sign(throttle)!==Math.sign(this.speed)&&Math.abs(this.speed)>.15)||input.jump;
  if(input.jump)this.speed=T.MathUtils.damp(this.speed,0,12,dt);
  else if(braking){const step=VEHICLE.brake*dt;this.speed=Math.abs(this.speed)<=step?0:this.speed-Math.sign(this.speed)*step;}
  else if(throttle)this.speed+=throttle*VEHICLE.acceleration*dt;
  else this.speed=T.MathUtils.damp(this.speed,0,.7,dt);
  this.speed=T.MathUtils.clamp(this.speed,-VEHICLE.reverseSpeed,VEHICLE.maxSpeed);
  const yaw=this.yaw+this.speed/VEHICLE.wheelbase*Math.tan(this.steering)*dt,targetPosition=this.position.clone().addScaledVector(new T.Vector3(Math.sin(yaw),0,Math.cos(yaw)),this.speed*dt),ground=this.support(targetPosition,yaw);
  if(ground)targetPosition.y=ground.height+.02;
  if(!ground||!this.clearMove(this.position,this.yaw,targetPosition,yaw,ground)){this.speed=0;this.velocity.set(0,0,0);return;}
  // Physics follows the fitted road immediately. Only the rendered ride
  // height is damped, so suspension smoothing cannot block an uphill sweep.
  if(this.rideY==null)this.rideY=ground.height;
  const drop=Math.abs(ground.height-this.rideY);
  this.rideY=T.MathUtils.damp(this.rideY,ground.height,drop>.45?14:5.5,dt);
  this.rideY=T.MathUtils.clamp(this.rideY,ground.height-.12,ground.height+.12);
  this.pitch=ground.pitch;this.roll=ground.roll;this.groundPlane=ground;
  this.contacts=ground.contacts;
  const verticalSpeed=(targetPosition.y-this.position.y)/dt;this.position.copy(targetPosition);(this.supportPosition??=new T.Vector3()).copy(targetPosition);this.supportYaw=yaw;this.yaw=yaw;this.spin+=this.speed*dt/(this.wheelRadius||.38);this.velocity.set(Math.sin(yaw)*this.speed,verticalSpeed,Math.cos(yaw)*this.speed);
 }
}
