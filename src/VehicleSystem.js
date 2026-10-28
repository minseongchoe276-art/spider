import * as T from 'three';
import {loadVehicle,disposeVehicleAsset,poseWheels} from './VehicleAsset.js';
import {poseDriver,prepareDriver,releaseDriver} from './DrivingPose.js';
import {VEHICLE_IDS,VEHICLE_LABELS,sanitizeVehicle,vehicleOverlap} from './VehicleNetwork.js';
import {VehicleController} from './VehicleController.js';
const up=new T.Vector3(0,1,0),smooth=t=>T.MathUtils.smoothstep(t,0,1);
export class VehicleSystem{
 constructor({scene,city,physics,character,cameraRig,combat,onNotice=()=>{},allowed=()=>true,getCitizens=()=>[],loadAsset=loadVehicle,getOtherVehicles=()=>[],onControlReset=()=>{}}){
  Object.assign(this,{scene,city,physics,character,cameraRig,combat,onNotice,allowed,getCitizens,loadAsset,getOtherVehicles,onControlReset});this.selected='bmw';this.sequence=0;this.restoreEpoch=0;this.physics.vehicleSystem=this;this.state='EMPTY';this.time=0;this.brakeHeld=false;this.cameraTarget=new T.Vector3();this.createUI();
 }
 get driving(){return ['ENTERING','DRIVING','EXITING'].includes(this.state);}
 createUI(){
  if(!globalThis.document?.createElement)return;
  const root=document.createElement('aside');root.id='vehicle-ui';root.hidden=true;root.setAttribute('aria-label','차량 선택 및 탑승');
  const select=document.createElement('select');select.setAttribute('aria-label','차량 선택');for(const id of VEHICLE_IDS){const option=document.createElement('option');option.value=id;option.textContent=VEHICLE_LABELS[id];select.append(option);}select.addEventListener('change',()=>{if(!this.selectVehicle(select.value))select.value=this.selected;});
  const label=document.createElement('span'),button=document.createElement('button'),brake=document.createElement('button');button.type=brake.type='button';button.textContent='BMW 불러오기 · B';brake.textContent='브레이크';brake.hidden=true;
  button.addEventListener('click',()=>this.interact());
  const release=()=>{this.brakeHeld=false;};brake.addEventListener('pointerdown',e=>{e.preventDefault();this.brakeHeld=true;brake.setPointerCapture?.(e.pointerId);});for(const type of ['pointerup','pointercancel','lostpointercapture'])brake.addEventListener(type,release);root.append(select,label,button,brake);document.body.append(root);this.ui={root,label,button,brake,select};
 }
 syncUI(active){
  if(!this.ui)return;const {root,label,button,brake,select}=this.ui;select.disabled=this.driving||!!this.loading;select.value=this.selected;const name=VEHICLE_LABELS[this.selected];document.body.classList.toggle('vehicle-driving',this.driving);root.hidden=!active||!this.allowed();if(root.hidden){this.brakeHeld=false;return;}
  const distance=this.asset?this.physics.position.distanceTo(this.doorPoint()):0;
  const direction=this.asset?this.doorPoint().sub(this.physics.position):new T.Vector3(),angle=Math.atan2(direction.x,direction.z)-(this.cameraRig?.yaw||0),arrow=['↑','↖','←','↙','↓','↘','→','↗'][((Math.round(angle/(Math.PI/4))%8)+8)%8];
  label.textContent=this.state==='DRIVING'?`${Math.round(Math.abs(this.controller.speed)*3.6)} km/h · W/S 가속·후진 · A/D 조향 · Space 브레이크`:this.state==='ENTERING'?'탑승 중…':this.state==='EXITING'?'하차 중…':this.asset?.frame.visible?`${name} · 운전석 ${Math.round(distance)} m ${arrow}`:this.loading?`${name} 준비 중…`:name;
  button.disabled=!!this.loading||['ENTERING','EXITING'].includes(this.state);
  button.textContent=this.driving?'하차 · B':this.asset?.frame.visible&&distance<25?'탑승 · B':`${name} 불러오기 · B`;brake.hidden=this.state!=='DRIVING';
 }
 doorPoint(){return this.asset.frame.localToWorld(new T.Vector3(1.65,.1,.15));}
 async interact(){
  if(this.loading||['ENTERING','EXITING'].includes(this.state))return false;
  if(!this.allowed()){this.onNotice('게임이 진행 중일 때 차량을 이용할 수 있습니다.');return false;}
  if(this.state==='DRIVING')return this.exit();
  if(!this.asset){
   this.loading=true;this.onNotice(`${VEHICLE_LABELS[this.selected]}를 준비하고 있습니다…`);
   try{const asset=await this.loadAsset(this.selected);if(this.disposed){this.releaseAsset(asset);return false;}this.asset=asset;this.scene.add(asset.frame);asset.frame.visible=false;}
   catch(error){this.onNotice('차량을 불러오지 못했습니다. 다시 시도해 주세요.');this.lastError=error;return false;}
   finally{this.loading=false;}
  }
  if(!this.allowed())return false;
  if(!this.asset.frame.visible||this.physics.position.distanceTo(this.asset.frame.position)>25){
   const found=this.findParking();if(!found){this.onNotice(this.playerSupport()==null?'발밑의 바닥이 확인되지 않아 차량을 놓을 수 없습니다. 땅에 선 뒤 다시 불러주세요.':'지금 서 있는 층에는 차량이 설 자리가 없습니다. 더 넓은 곳으로 이동한 뒤 다시 불러주세요.');return false;}
   this.controller=new VehicleController(this.city,found.position,found.yaw);this.controller.wheelRadius=this.asset.wheels.reduce((sum,w)=>sum+w.radius,0)/this.asset.wheels.length||.38;this.controller.occupied=(p,yaw)=>this.citizenInBody(p,yaw);this.asset.frame.visible=true;this.state='PARKED';this.syncCar(0);this.onNotice(`${VEHICLE_LABELS[this.selected]}가 도착했습니다. 운전석 옆에서 B를 눌러 탑승하세요.`);return true;
  }
  const entry=this.doorPoint(),offset=entry.clone().sub(this.physics.position),distance=offset.length();
  if(distance>2.3||Math.abs(offset.y)>1.2||!['IDLE','RUNNING','SPRINTING'].includes(this.physics.state)||Math.abs(this.physics.velocity.y)>1){this.onNotice('운전석 옆에 서서 B를 눌러주세요.');return false;}
  const line=offset.clone().setY(0);if(line.length()>.01&&this.city.raycast?.(this.physics.position.clone().addScaledVector(up,.8),line.clone().normalize(),line.length())){this.onNotice('운전석으로 가는 길이 막혀 있습니다.');return false;}
  this.onControlReset();this.combat?.cancel();this.physics.clearWebAnchor?.();this.physics.clearPendingInput?.();prepareDriver(this.character);
  this.savedCamera=this.cameraRig?Object.fromEntries(['targetDistance','maxDistance','minDistance','mode','pitch','followMovement','lockBehind'].map(k=>[k,this.cameraRig[k]])):null;
  if(this.cameraRig){Object.assign(this.cameraRig,{targetDistance:8.5,maxDistance:12,minDistance:3.5,mode:'follow',pitch:.23,followMovement:true,lockBehind:true});}
  this.entryFacing=this.physics.facingAngle;this.entryStart=this.character.group.position.clone();this.state='ENTERING';this.time=0;this.onNotice('W/S 가속·제동·후진 · A/D 조향 · Space 브레이크 · B 하차');return true;
 }
 // The surface under the player's feet. A long downward ray used to miss a
 // roof and report the street at y=0. This look is only a few metres, so a
 // lower road cannot win.
 playerSupport(){
  const p=this.physics.position,origin=p.clone();origin.y+=.35;
  const hit=this.city.raycast?.(origin,new T.Vector3(0,-1,0),4);
  if(hit?.normal&&hit.normal.y>=.75&&p.y-hit.point.y<=3.2&&hit.point.y-p.y<=.45&&!this.insideSolid(p.x,hit.point.y+.4,p.z))return hit.point.y;
  if(!this.city.isStreamed&&p.y<2.5&&!this.insideSolid(p.x,.4,p.z))return 0;
  return null;
 }
 parkingHeight(x,z,floorY){
  const origin=new T.Vector3(x,floorY+1.2,z),hit=this.city.raycast?.(origin,new T.Vector3(0,-1,0),2.3);
  if(hit?.normal&&hit.normal.y>=.75&&Math.abs(hit.point.y-floorY)<=.45&&!this.insideSolid(x,hit.point.y+.4,z))return hit.point.y;
  if(!this.city.isStreamed&&floorY<2.5&&Math.abs(floorY)<=.45&&!this.insideSolid(x,.4,z))return 0;
  return null;
 }
 insideSolid(x,y,z){
  return (this.city.colliders||[]).some(c=>x>c.minX+.05&&x<c.maxX-.05&&z>c.minZ+.05&&z<c.maxZ-.05&&y>c.minY+.15&&y<c.maxY-.08);
 }
 reachable(from,to){
  if(Math.abs(from.y-to.y)>1.2)return false;
  const start=from.clone();start.y+=.85;
  const end=new T.Vector3(to.x,start.y,to.z),delta=end.sub(start),distance=delta.length();
  if(distance<.4)return true;
  return !this.city.raycast?.(start,delta.multiplyScalar(1/distance),Math.max(0,distance-.6));
 }
 findParking(){
  const feet=this.physics.position,floorY=this.playerSupport();if(floorY==null)return null;
  const yaw=this.physics.facingAngle||0,probe=new VehicleController(this.city,feet,yaw);
  for(const radius of [7,11,17,25,35])for(const offset of [0,.65,-.65,1.3,-1.3,Math.PI]){
   const angle=yaw+offset,position=new T.Vector3(feet.x+Math.sin(angle)*radius,floorY,feet.z+Math.cos(angle)*radius);
   const height=this.parkingHeight(position.x,position.z,floorY);if(height==null||Math.abs(height-floorY)>.45)continue;
   position.y=height+.02;
   if(!probe.support(position,yaw)||!this.spaceClear(position,yaw)||this.citizenInBody(position,yaw)||!this.reachable(feet,position))continue;
   return {position,yaw};
  }return null;
 }
 spaceClear(position,yaw){
  const probe=new VehicleController(this.city,position,yaw),ground=probe.support(position,yaw);
  if(probe.overlapsBuildings(position,yaw)||this.city.collisionWorld?.vehicleBlocked?.(position,position,yaw,ground?.pitch,ground?.roll))return false;
  for(const x of [-1.33,0,1.33])for(const z of [-2.35,0,2.35]){
   const point=probe.local(x,z).addScaledVector(up,.25);if(this.city.raycast?.(point,up,1.5))return false;
  }
  for(const height of [.4,1])for(const x of [-1.33,0,1.33]){const from=probe.local(x,-2.35).addScaledVector(up,height),dir=new T.Vector3(Math.sin(yaw),0,Math.cos(yaw));if(this.city.raycast?.(from,dir,4.7))return false;}
  return true;
 }
 citizenInBody(position,yaw){
  const candidate={phase:'DRIVING',position,yaw};if(this.getOtherVehicles().some(other=>vehicleOverlap(candidate,other,.08)))return true;
  for(const n of this.getCitizens()){const p=n.position.clone().sub(position).applyAxisAngle(up,-yaw);if(Math.abs(p.x)<1.5&&Math.abs(p.z)<2.9&&Math.abs(p.y)<2)return true;}return false;
 }
 exit(){
  if(Math.abs(this.controller.speed)>1.2){this.onNotice('브레이크로 멈춘 뒤 하차하세요.');return false;}
  const point=this.findExit();if(!point){this.onNotice('차 옆이 막혀 있습니다. 넓은 곳에 주차한 뒤 하차하세요.');return false;}
  this.controller.speed=0;this.controller.velocity.set(0,0,0);this.exitPoint=point;this.state='EXITING';this.time=0;return true;
 }
 findExit(){
  for(const [x,z] of [[1.65,.15],[-1.65,.15],[1.65,-1.2],[-1.65,-1.2],[0,-3.2]]){
   const point=this.asset.frame.localToWorld(new T.Vector3(x,.1,z)),height=this.controller.ground(point);if(height==null||Math.abs(height-this.controller.position.y)>.5)continue;point.y=height+.1;
   const head=point.clone().addScaledVector(up,.2);if(this.city.raycast?.(head,up,1.8))continue;
   const center=this.controller.position.clone().addScaledVector(up,.9),line=point.clone().addScaledVector(up,.8).sub(center);if(this.city.raycast?.(center,line.clone().normalize(),line.length()))continue;
   let clear=true;for(const dir of [new T.Vector3(1,0,0),new T.Vector3(-1,0,0),new T.Vector3(0,0,1),new T.Vector3(0,0,-1)])if(this.city.raycast?.(point.clone().addScaledVector(up,.8),dir,.4))clear=false;
   if(clear&&!this.getCitizens().some(n=>n.position.distanceTo(point)<.8))return point;
  }return null;
 }
 finishExit(){
  this.onControlReset();const p=this.physics;p.position.copy(this.exitPoint);p.renderPosition.copy(this.exitPoint);p.previousFixedPosition?.copy(this.exitPoint);p.velocity.set(0,0,0);p.accumulator=0;p.state='IDLE';p.facingAngle=this.controller.yaw;p.clearPendingInput?.();
  releaseDriver(this.character,this.controller.yaw);this.character.group.position.copy(p.position);this.character.targetFacingAngle=this.controller.yaw;this.character.visualYaw=this.controller.yaw;this.character.combatStance=this.combat?.mode==='combat';
  if(this.savedCamera)Object.assign(this.cameraRig,this.savedCamera);this.cameraRig?.placeBehind(p.position,p.facingAngle,this.savedCamera?.pitch??.16);this.state='PARKED';this.brakeHeld=false;this.onNotice('하차했습니다.');
 }
 syncCar(delta){
  const {asset,controller:c}=this;if(!asset||!c)return;asset.frame.position.copy(c.position);asset.frame.rotation.y=c.yaw;asset.visual.rotation.x=T.MathUtils.damp(asset.visual.rotation.x,c.pitch||0,6,delta);asset.visual.rotation.z=T.MathUtils.damp(asset.visual.rotation.z,c.roll||0,6,delta);asset.frame.updateMatrixWorld(true);
  poseWheels(asset,c.spin,c.steering,{chassisY:c.position.y,contacts:c.contacts,dt:delta});
  const open=this.state==='ENTERING'?this.time<.65: this.state==='EXITING';asset.door.rotation.y=T.MathUtils.damp(asset.door.rotation.y,open?-.95:0,10,delta);this.cameraTarget.copy(c.position);
 }
 update(delta,input={},active=true){
  this.syncUI(active);if(!this.controller)return;
  if(!this.allowed()){if(this.driving){this.controller.speed=0;this.exitPoint=this.findExit()||this.city.getRooftopSpawn?.()||this.entryStart;this.finishExit();this.syncCar(delta);}this.asset.frame.visible=false;return;}
  if(!active)return;
  if(this.driving){
   this.time+=Math.min(delta,.1);if(this.state==='DRIVING')this.controller.update(delta,{...input,jump:input.jump||this.brakeHeld});this.syncCar(delta);
   const p=this.physics;p.position.copy(this.controller.position).addScaledVector(up,.1);p.renderPosition.copy(p.position);p.previousFixedPosition?.copy(p.position);p.velocity.copy(this.controller.velocity);p.accumulator=0;p.facingAngle=this.controller.yaw;p.state='DRIVING';this.city.playerPosition?.copy(p.position);
   let blend=1,standing=null;if(this.state==='ENTERING'){blend=smooth(this.time/.9);standing=this.entryStart;if(this.time>=.9)this.state='DRIVING';}else if(this.state==='EXITING'){blend=1-smooth(this.time/.75);standing=this.exitPoint;}
   poseDriver(this.character,this.asset,this.controller.steering,blend,standing,this.state==='ENTERING'?this.entryFacing:this.controller.yaw);if(this.state==='EXITING'&&this.time>=.75)this.finishExit();
  }else this.syncCar(delta);
 }
 bodies(){return [...(this.asset?.frame.visible&&this.controller?[{position:this.controller.position,yaw:this.controller.yaw}]:[]),...this.getOtherVehicles().filter(v=>v&&v.phase!=='NONE')];}
 blocksRay(origin,direction,distance){
  for(const body of this.bodies()){const inverse=new T.Matrix4().compose(new T.Vector3().copy(body.position),new T.Quaternion().setFromAxisAngle(up,body.yaw),new T.Vector3(1,1,1)).invert(),ray=new T.Ray(origin.clone(),direction.clone()).applyMatrix4(inverse),point=ray.intersectBox(new T.Box3(new T.Vector3(-1.33,.12,-2.35),new T.Vector3(1.33,1.56,2.35)),new T.Vector3());if(point&&point.distanceTo(ray.origin)<=distance)return true;}return false;
 }
 resolvePedestrian(){
  if(this.driving)return;
  for(const body of this.bodies()){
   const p=this.physics,local=p.position.clone().sub(body.position).applyAxisAngle(up,-body.yaw);if(local.y<-.2||local.y>1.5||Math.abs(local.x)>1.63||Math.abs(local.z)>2.67)continue;
   const candidates=[new T.Vector3(1.65,local.y,local.z),new T.Vector3(-1.65,local.y,local.z),new T.Vector3(local.x,local.y,2.7),new T.Vector3(local.x,local.y,-2.7)].sort((a,b)=>a.distanceToSquared(local)-b.distanceToSquared(local));
   for(const candidate of candidates){const world=candidate.applyAxisAngle(up,body.yaw).add(body.position),line=world.clone().sub(p.position).setY(0),distance=line.length();if(distance>.01&&this.city.raycast?.(p.position.clone().addScaledVector(up,.8),line.normalize(),distance+.3))continue;p.position.copy(world);p.renderPosition.copy(world);p.previousFixedPosition?.copy(world);this.character.group.position.copy(world);p.velocity.x=p.velocity.z=0;break;}
  }
 }

 releaseAsset(asset){disposeVehicleAsset(asset);}
 selectVehicle(id){
  if(!VEHICLE_IDS.includes(id)||this.driving||this.loading)return false;
  if(id===this.selected)return true;this.restoreEpoch++;if(this.asset)this.releaseAsset(this.asset);this.asset=null;this.controller=null;this.selected=id;this.state='EMPTY';this.sequence++;return true;
 }
 networkSnapshot(){
  const sequence=++this.sequence;if(!this.asset?.frame.visible||!this.controller)return {phase:'NONE',sequence};
  const c=this.controller,point=p=>({x:p.x,y:p.y,z:p.z}),angle=a=>Math.atan2(Math.sin(a||0),Math.cos(a||0));
  return sanitizeVehicle({wheelDrops:this.asset.wheels.map(w=>w.drop||0),sequence,model:this.selected,phase:this.state,position:point(c.position),yaw:angle(c.yaw),pitch:c.pitch||0,roll:c.roll||0,speed:this.state==='PARKED'?0:c.speed,steering:c.steering,spin:c.spin%(Math.PI*2),elapsed:['ENTERING','EXITING'].includes(this.state)?Math.min(1.5,this.time):0,start:point(this.entryStart||this.physics.position),startYaw:angle(this.entryFacing),exit:point(this.exitPoint||this.doorPoint())});
 }
 resetSession(){
  this.restoreEpoch++;if(this.driving){this.exitPoint=this.findExit()||this.city.getRooftopSpawn?.()||this.entryStart;this.finishExit();}
  if(this.asset)this.asset.frame.visible=false;this.controller=null;this.state='EMPTY';this.sequence++;
 }
 async restore(snapshot){
  const v=sanitizeVehicle(snapshot);if(!v||v.phase==='NONE')return;const epoch=++this.restoreEpoch;
  if(this.asset&&this.selected!==v.model){this.releaseAsset(this.asset);this.asset=null;}
  this.selected=v.model;if(!this.asset){const asset=await this.loadAsset(v.model);if(this.disposed||epoch!==this.restoreEpoch){this.releaseAsset(asset);return;}this.asset=asset;this.scene.add(asset.frame);}
  this.controller=new VehicleController(this.city,new T.Vector3().copy(v.position),v.yaw);this.controller.wheelRadius=this.asset.wheels.reduce((sum,w)=>sum+w.radius,0)/this.asset.wheels.length||.38;Object.assign(this.controller,{speed:0,steering:v.steering,spin:v.spin,pitch:v.pitch,roll:v.roll});this.controller.occupied=(p,yaw)=>this.citizenInBody(p,yaw);this.asset.frame.visible=true;this.sequence=Math.max(this.sequence,v.sequence);this.entryStart=new T.Vector3().copy(v.start);this.entryFacing=v.startYaw;this.exitPoint=new T.Vector3().copy(v.exit);this.time=v.elapsed;this.state=v.phase;
  if(this.driving){prepareDriver(this.character);this.combat?.cancel();this.physics.clearWebAnchor?.();if(this.cameraRig){this.savedCamera=Object.fromEntries(['targetDistance','maxDistance','minDistance','mode','pitch','followMovement','lockBehind'].map(k=>[k,this.cameraRig[k]]));Object.assign(this.cameraRig,{targetDistance:8.5,maxDistance:12,minDistance:3.5,mode:'follow',pitch:.23,followMovement:true,lockBehind:true});}}
  this.syncCar(0);
 }
 applyCorrection(data){
  if(!this.controller)return false;
  if(!Object.hasOwn(data,'vehicle')){if(!this.driving)return false;this.controller.position.set(data.x,data.y-.1,data.z);this.controller.speed=0;this.controller.velocity.set(0,0,0);this.syncCar(0);return true;}
  const v=sanitizeVehicle(data.vehicle);if(!v||v.phase==='NONE'){this.resetSession();return false;}
  if(v.model!==this.selected){this.resetSession();this.restore(v).catch(error=>{this.lastError=error;});return false;}
  const wasDriving=this.driving;this.controller.position.copy(v.position);this.controller.yaw=v.yaw;this.controller.speed=0;this.controller.velocity.set(0,0,0);this.sequence=Math.max(this.sequence,v.sequence);
  if(v.phase==='PARKED'){if(wasDriving){this.exitPoint=new T.Vector3(data.x,data.y,data.z);this.finishExit();}this.state='PARKED';this.syncCar(0);return false;}
  this.state=v.phase;if(!wasDriving)prepareDriver(this.character);this.syncCar(0);this.physics.position.copy(this.controller.position).addScaledVector(up,.1);this.physics.renderPosition.copy(this.physics.position);this.physics.previousFixedPosition?.copy(this.physics.position);this.physics.velocity.set(0,0,0);return true;
 }

 dispose(){this.disposed=true;this.ui?.root.remove();if(this.asset)this.releaseAsset(this.asset);}
}
