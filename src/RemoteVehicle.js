import * as T from 'three';
import {loadVehicle,disposeVehicleAsset,poseWheels} from './VehicleAsset.js';
import {sanitizeVehicle} from './VehicleNetwork.js';
import {poseDriver,prepareDriver,releaseDriver} from './DrivingPose.js';
const smooth=t=>T.MathUtils.smoothstep(t,0,1),lerpAngle=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
export class RemoteVehicle{
 constructor(scene,character,{loadAsset=loadVehicle}={}){Object.assign(this,{scene,character,loadAsset});this.samples=[];this.sequence=-1;this.generation=0;this.retryAt=0;this.failures=0;}
 receive(snapshot,now){
  const v=sanitizeVehicle(snapshot);if(!v||v.sequence<=this.sequence)return false;this.sequence=v.sequence;
  if(v.phase==='NONE'){this.snapshot=v;this.samples=[];this.generation++;if(this.asset)disposeVehicleAsset(this.asset);this.asset=null;this.loading=false;this.endDriver();return true;}
  if(this.snapshot?.model!==v.model){this.generation++;if(this.asset)disposeVehicleAsset(this.asset);this.asset=null;this.loading=false;this.samples=[];this.failures=0;}
  this.snapshot=v;this.samples.push({v,at:now});if(this.samples.length>12)this.samples.shift();return true;
 }
 async ensureAsset(now){
  if(this.asset||this.loading||!this.snapshot||this.snapshot.phase==='NONE'||now<this.retryAt||this.failures>=3)return;
  this.loading=true;const generation=this.generation,model=this.snapshot.model;
  try{const asset=await this.loadAsset(model);if(this.disposed||generation!==this.generation){disposeVehicleAsset(asset);return;}this.asset=asset;this.scene.add(asset.frame);}
  catch(error){this.failures++;this.retryAt=now+5000;this.lastError=error;}
  finally{if(generation===this.generation)this.loading=false;}
 }
 sample(now){
  const time=now-100,samples=this.samples;let a=samples[0],b=a;for(const sample of samples){if(sample.at<=time)a=sample;if(sample.at>=time){b=sample;break;}b=sample;}
  if(!a)return null;const t=b.at>a.at?T.MathUtils.clamp((time-a.at)/(b.at-a.at),0,1):1,base=t<1?a:b,v={...base.v};v.position=new T.Vector3().copy(a.v.position).lerp(b.v.position,t);v.yaw=lerpAngle(a.v.yaw,b.v.yaw,t);
  for(const k of ['pitch','roll','speed','steering'])v[k]=T.MathUtils.lerp(a.v[k],b.v[k],t);
  const radius=this.asset?.wheels[0]?.radius||.38,expected=(a.v.speed+b.v.speed)*.5/radius*(b.at-a.at)/1000,raw=b.v.spin-a.v.spin,spinDelta=raw+Math.round((expected-raw)/(Math.PI*2))*Math.PI*2;
  v.wheelDrops=a.v.wheelDrops.map((n,i)=>T.MathUtils.lerp(n,b.v.wheelDrops[i],t));v.spin=a.v.spin+spinDelta*t;v.elapsed=Math.min(1.5,base.v.elapsed+Math.max(0,time-base.at)/1000);if(now-samples.at(-1).at>350)v.speed=0;return v;
 }
 endDriver(){if(this.driver){releaseDriver(this.character,this.lastYaw||0);this.driver=false;}this.character.group.visible=true;}
 update(delta,now,target){
  if(!this.snapshot||this.snapshot.phase==='NONE')return false;this.ensureAsset(now);const c=this.character,v=this.sample(now),active=v&&v.phase!=='PARKED';
  if(!this.asset){if(active&&this.failures<3){c.group.visible=false;return true;}this.endDriver();return false;}
  const asset=this.asset;asset.frame.position.copy(v.position);asset.frame.rotation.y=v.yaw;asset.visual.rotation.set(v.pitch,0,v.roll);asset.frame.updateMatrixWorld(true);poseWheels(asset,v.spin,v.steering);asset.wheels.forEach((wheel,i)=>{wheel.drop=v.wheelDrops[i];wheel.pivot.position.y=wheel.restY-wheel.drop;});
  const open=v.phase==='ENTERING'?v.elapsed<.65:v.phase==='EXITING';asset.door.rotation.y=T.MathUtils.damp(asset.door.rotation.y,open?-.95:0,10,delta);this.lastYaw=v.yaw;
  if(!active){if(this.driver){this.endDriver();c.group.position.copy(target);}return false;}
  if(!c.isLoaded||!c.model){c.group.visible=false;return true;}
  if(!this.driver){prepareDriver(c);c.webAttachments=[];c.updateWeb?.(false,null);this.driver=true;}
  c.group.visible=true;let blend=1,standing=null;if(v.phase==='ENTERING'){blend=smooth(v.elapsed/.9);standing=new T.Vector3().copy(v.start);}else if(v.phase==='EXITING'){blend=1-smooth(v.elapsed/.75);standing=new T.Vector3().copy(v.exit);}
  poseDriver(c,asset,v.steering,blend,standing,v.phase==='ENTERING'?v.startYaw:v.yaw);return true;
 }
 dispose(){this.disposed=true;this.generation++;if(this.asset)disposeVehicleAsset(this.asset);this.asset=null;this.endDriver();}
}
