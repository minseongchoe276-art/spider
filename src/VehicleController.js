import * as T from 'three';
const up=new T.Vector3(0,1,0),down=new T.Vector3(0,-1,0);
export const VEHICLE=Object.freeze({length:4.7,width:2.65,wheelbase:2.8,maxSpeed:24,reverseSpeed:6,acceleration:5.8,brake:13,step:1/90});
export class VehicleController{
 constructor(city,position=new T.Vector3(),yaw=0){this.city=city;this.position=position.clone();this.yaw=yaw;this.speed=0;this.steering=0;this.spin=0;this.accumulator=0;this.velocity=new T.Vector3();this.occupied=()=>false;}
 ground(point,spawn=false){
  const origin=point.clone();origin.y+=spawn?4:1.1;const hit=this.city.raycast?.(origin,down,spawn?140:2.6);
  if(hit){if(hit.normal?.y<.75||hit.mesh?.userData?.surfaceType==='building'||(spawn&&hit.building))return null;return hit.point.y;}
  return this.city.isStreamed?null:(spawn||point.y<2.5?0:null);
 }
 local(x,z,position=this.position,yaw=this.yaw){return new T.Vector3(x,0,z).applyAxisAngle(up,yaw).add(position);}
 support(position,yaw){
  const extent=this.city.playableHalfExtent;if(extent&&(Math.abs(position.x)+2.7>extent||Math.abs(position.z)+2.7>extent))return null;
  const samples=[];for(const [x,z] of [[0,0],[-.88,1.55],[.88,1.55],[-.88,-1.55],[.88,-1.55]]){const point=this.local(x,z,position,yaw),y=this.ground(point);if(y==null||Math.abs(y-position.y)>.55)return null;samples.push(y);}
  if(Math.max(...samples)-Math.min(...samples)>1.0)return null;
  return {height:samples.reduce((a,b)=>a+b)/5,pitch:-Math.atan2((samples[1]+samples[2]-samples[3]-samples[4])*.5,3.1),roll:-Math.atan2((samples[1]+samples[3]-samples[2]-samples[4])*.5,1.76)};
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
 clearMove(from,oldYaw,to,yaw,ground={}){
  if(this.overlapsBuildings(to,yaw)||this.city.collisionWorld?.vehicleBlocked?.(from,to,yaw,ground.pitch,ground.roll))return false;
  for(const [x,z] of [[-1.33,-2.35],[1.33,-2.35],[-1.33,2.35],[1.33,2.35],[0,0]])for(const height of [.35,1.0]){
   const a=this.local(x,z,from,oldYaw).addScaledVector(up,height),b=this.local(x,z,to,yaw).addScaledVector(up,height),dir=b.sub(a),distance=dir.length();
   if(distance>.00001&&this.city.raycast?.(a,dir.divideScalar(distance),distance+.08))return false;
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
  if(!ground||!this.clearMove(this.position,this.yaw,targetPosition,yaw,ground)){this.speed=0;this.velocity.set(0,0,0);return;}
  targetPosition.y=ground.height+.02;this.position.copy(targetPosition);this.yaw=yaw;this.pitch=ground.pitch;this.roll=ground.roll;this.spin+=this.speed*dt/(this.wheelRadius||.38);this.velocity.set(Math.sin(yaw)*this.speed,0,Math.cos(yaw)*this.speed);
 }
}
