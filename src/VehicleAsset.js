import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {fetchAsset} from './AssetLoader.js';
import {VEHICLE_IDS} from './VehicleNetwork.js';
const cache=new Map(),lateralAxle=new T.Vector3(1,0,0);
function normalize(model,length,rotation=0){
 const frame=new T.Group(),visual=new T.Group();frame.add(visual);visual.add(model);model.rotation.y=rotation;model.updateMatrixWorld(true);
 let box=new T.Box3().setFromObject(model),size=box.getSize(new T.Vector3());model.scale.multiplyScalar(length/size.z);model.updateMatrixWorld(true);box=new T.Box3().setFromObject(model);const center=box.getCenter(new T.Vector3());model.position.set(-center.x,-box.min.y,-center.z);frame.updateMatrixWorld(true);return {frame,visual,model,size:new T.Box3().setFromObject(model).getSize(new T.Vector3()),ownedGeometries:new Set()};
}
// The glTF wheel node also contains the caliper and control arm. Those are not
// round, so spinning them drops and lifts the contact patch every revolution.
function meshPoints(mesh){
  const position=mesh.geometry.attributes?.position;if(!position)return [];
  const step=Math.max(1,Math.floor(position.count/400)),points=[];
  mesh.updateWorldMatrix(true,false);
  for(let i=0;i<position.count;i+=step)points.push(mesh.localToWorld(new T.Vector3().fromBufferAttribute(position,i)));
  return points;
}
function rollsOnAxle(mesh,hub){
  const points=meshPoints(mesh);if(points.length<12)return false;
  const bins=Array(8).fill(0);let counted=0;
  for(const point of points){
    const radius=Math.hypot(point.y-hub.y,point.z-hub.z);if(radius<.08)continue;
    counted++;bins[(Math.round(Math.atan2(point.z-hub.z,point.y-hub.y)/(Math.PI/4))+8)%8]++;
  }
  if(counted<12)return false;
  const peak=Math.max(...bins);return Math.min(...bins)>=peak*.7;
}
// Vertex density on the sidewall pulls a centroid off the tread circle, and one
// stray vertex pulls a raw bounding box. The outer shell's box, with the
// furthest 2% dropped, is the circle the tyre actually rolls around.
function shellCenter(points,hint){
  if(points.length<12)return hint.clone();
  let center=hint.clone();
  for(let pass=0;pass<5;pass++){
    const radii=points.map(point=>Math.hypot(point.y-center.y,point.z-center.z)).sort((a,b)=>a-b);
    const limit=radii[Math.min(radii.length-1,Math.floor(radii.length*.98))];
    if(!(limit>.05))break;
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity,count=0;
    for(const point of points){
      const radius=Math.hypot(point.y-center.y,point.z-center.z);
      if(radius<limit*.94||radius>limit)continue;
      minX=Math.min(minX,point.x);maxX=Math.max(maxX,point.x);
      minY=Math.min(minY,point.y);maxY=Math.max(maxY,point.y);
      minZ=Math.min(minZ,point.z);maxZ=Math.max(maxZ,point.z);
      count++;
    }
    if(count<8)break;
    center=new T.Vector3((minX+maxX)/2,(minY+maxY)/2,(minZ+maxZ)/2);
  }
  return center.distanceTo(hint)>.04?hint.clone():center;
}
function treadAxle(points){
  if(points.length<12)return new T.Vector3(1,0,0);
  let mx=0,my=0,mz=0;
  for(const point of points){mx+=point.x;my+=point.y;mz+=point.z;}
  mx/=points.length;my/=points.length;mz/=points.length;
  let xx=0,yy=0,zz=0,xy=0,xz=0,yz=0;
  for(const point of points){
    const x=point.x-mx,y=point.y-my,z=point.z-mz;
    xx+=x*x;yy+=y*y;zz+=z*z;xy+=x*y;xz+=x*z;yz+=y*z;
  }
  const det=xx*(yy*zz-yz*yz)-xy*(xy*zz-xz*yz)+xz*(xy*yz-yy*xz);
  if(!(Math.abs(det)>1e-8))return new T.Vector3(1,0,0);
  let vx=1,vy=0,vz=0;
  for(let step=0;step<8;step++){
    const ixx=yy*zz-yz*yz,ixy=xz*yz-xy*zz,ixz=xy*yz-xz*yy,iyy=xx*zz-xz*xz,iyz=xy*xz-xx*yz,izz=xx*yy-xy*xy;
    const nx=(ixx*vx+ixy*vy+ixz*vz)/det,ny=(ixy*vx+iyy*vy+iyz*vz)/det,nz=(ixz*vx+iyz*vy+izz*vz)/det,len=Math.hypot(nx,ny,nz)||1;
    vx=nx/len;vy=ny/len;vz=nz/len;
  }
  const axle=new T.Vector3(vx,vy,vz);
  if(axle.x<0)axle.negate();
  return axle;
}
function contactSpan(spin,axle){
  let lo=Infinity,hi=-Infinity;
  for(let step=0;step<12;step++){
    spin.quaternion.setFromAxisAngle(axle,step/12*Math.PI*2);
    const y=lowestY(spin);
    if(y<lo)lo=y;if(y>hi)hi=y;
  }
  spin.quaternion.identity();spin.updateWorldMatrix(true,true);
  return hi-lo;
}
function vertexRadius(object,hub){
  let radius=0;
  object.updateWorldMatrix(true,true);
  object.traverse(node=>{
    if(!node.isMesh)return;
    for(const point of meshPoints(node))radius=Math.max(radius,Math.hypot(point.y-hub.y,point.z-hub.z));
  });
  return radius;
}
function lowestY(root,stride=0){
  let y=Infinity;const point=new T.Vector3();
  root.updateWorldMatrix(true,true);
  root.traverse(node=>{
    const position=node.isMesh&&node.geometry.attributes?.position;
    if(!position)return;
    node.updateWorldMatrix(true,false);
    const step=stride>0?stride:Math.max(1,Math.floor(position.count/300));
    for(let i=0;i<position.count;i+=step){
      node.localToWorld(point.fromBufferAttribute(position,i));
      if(point.y<y)y=point.y;
    }
  });
  return y;
}
function wheelPivots(asset,parts){return parts.map(part=>{
  part.updateWorldMatrix(true,true);const meshes=[];part.traverse(node=>{if(node.isMesh)meshes.push(node);});
  if(!meshes.length)return null;
  const assembly=new T.Box3().setFromPoints(meshes.flatMap(meshPoints)).getCenter(new T.Vector3());
  const fitted=meshes.map(mesh=>({mesh,points:meshPoints(mesh)}));
  for(const item of fitted)item.center=shellCenter(item.points,assembly);
  const rolling=fitted.filter(item=>rollsOnAxle(item.mesh,item.center));
  const movers=(rolling.length?rolling:fitted).map(item=>item.mesh);
  const shell=rolling.length?shellCenter(rolling.flatMap(item=>item.points),rolling[0].center):assembly;
  const hub=shell.distanceTo(assembly)<.04?shell:assembly;
  const steer=new T.Group(),spin=new T.Group();steer.position.copy(hub);asset.visual.add(steer);steer.add(spin);asset.frame.updateMatrixWorld(true);
  for(const mesh of meshes)(movers.includes(mesh)?spin:steer).attach(mesh);
  const fittedAxle=treadAxle(movers.flatMap(meshPoints));
  const axle=fittedAxle.angleTo(lateralAxle)<1.05&&contactSpan(spin,fittedAxle)<contactSpan(spin,lateralAxle)-.002?fittedAxle:lateralAxle.clone();
  const radius=Math.max(.2,vertexRadius(spin,steer.getWorldPosition(new T.Vector3())));
  return {pivot:steer,spin,front:hub.z>0,radius,restY:hub.y,hx:hub.x,hz:hub.z,axle};
}).filter(Boolean);}
// Authored bounds sit below the real tread, so the tire never meets the road and
// looks like it is hopping above it. Drop the shell, the wheels and the cabin
// anchors together once the tread bottom is known.
function seatOnTires(asset){
  asset.frame.updateMatrixWorld(true);
  let contact=Infinity;
  for(const wheel of asset.wheels)contact=Math.min(contact,lowestY(wheel.spin,1));
  if(Number.isFinite(contact)&&Math.abs(contact)>=.004){
    asset.model.position.y-=contact;
    for(const wheel of asset.wheels)wheel.pivot.position.y-=contact;
    asset.door.position.y-=contact;asset.seat.y-=contact;asset.wheel.y-=contact;
    for(const pedal of asset.pedals)pedal.y-=contact;
  }
  for(const wheel of asset.wheels){wheel.restY=wheel.pivot.position.y;wheel.hx=wheel.pivot.position.x;wheel.hz=wheel.pivot.position.z;wheel.drop=0;}
}
export function poseWheels(asset,spin,steering,ride=null){
  if(!asset?.wheels?.length)return;
  const mean=asset.wheels.reduce((sum,wheel)=>sum+wheel.radius,0)/asset.wheels.length||.38;
  const dt=ride?.dt>0?Math.min(ride.dt,.1):0;
  for(const wheel of asset.wheels){
    wheel.pivot.rotation.set(0,wheel.front?steering:0,0);
    wheel.spin.quaternion.setFromAxisAngle(wheel.axle||lateralAxle,spin*(mean/(wheel.radius||mean)));
    const rest=wheel.restY??wheel.pivot.position.y;
    let target=0;
    if(ride?.contacts&&Number.isFinite(ride.chassisY)){
      let best=null,bestD=Infinity;
      for(const contact of ride.contacts){
        const d=(contact.x-(wheel.hx??0))**2+(contact.z-(wheel.hz??0))**2;
        if(d<bestD){bestD=d;best=contact;}
      }
      if(best){
        const x=wheel.hx??0,z=wheel.hz??0;
        const groundY=best.y+(ride.plane?.slopeX||0)*(x-best.x)+(ride.plane?.slopeZ||0)*(z-best.z);
        const sole=asset.visual.localToWorld(new T.Vector3(x,rest-wheel.radius,z));
        const axisY=new T.Vector3(0,1,0).transformDirection(asset.visual.matrixWorld).y;
        target=T.MathUtils.clamp((sole.y-groundY)/Math.max(.5,axisY),-.1,.18);
      }
    }
    wheel.drop=dt?T.MathUtils.damp(wheel.drop||0,target,16,dt):target;
    wheel.pivot.position.y=rest-wheel.drop;
  }
}
function glass(model){model.traverse(n=>{if(n.isMesh){n.castShadow=false;n.receiveShadow=true;for(const m of Array.isArray(n.material)?n.material:[n.material]){if(/MI_Glass$|Window/i.test(m.name)){m.transmission=0;m.opacity=.22;m.transparent=true;m.depthWrite=false;}if(m.name==='CarPaint')m.roughness=Math.max(.25,m.roughness);}}});}
export function prepareBMW(model){
 const asset=normalize(model,4.7,-Math.PI/2);asset.frame.name='BMW330i';asset.wheels=wheelPivots(asset,['Object_13_169','Object_13004_172','Object_13001_173','Object_13002_174'].map(name=>model.getObjectByName(name)).filter(Boolean));
 const door=new T.Group();door.position.set(asset.size.x*.36,.6,.85);asset.visual.add(door);const parts=[];model.traverse(n=>{if(/^SK_Door_FL_/.test(n.name))parts.push(n);});for(const p of parts)door.attach(p);glass(model);
 const ready={...asset,door,modelId:'bmw',seat:new T.Vector3(.43,.62,.02),pedals:[new T.Vector3(.58,.32,.85),new T.Vector3(.27,.32,.9)],wheel:new T.Vector3(.43,1,.54)};
 seatOnTires(ready);return ready;
}
export function prepareCorvette(model){
 const asset=normalize(model,4.46);asset.frame.name='CorvetteC6ZR1';const wheels=[];model.traverse(n=>{if(n.isGroup&&/^Combined3DWheel/.test(n.name))wheels.push(n);});asset.wheels=wheelPivots(asset,wheels);
 const door=new T.Group();door.position.set(.89,.58,.36);asset.visual.add(door);const meshes=[];model.traverse(n=>{if(n.isMesh)meshes.push(n);});
 // The source merges door panels into material meshes. Split their spatial
 // triangle islands, preserving original UVs/materials, for an independent hinge.
 for(const mesh of meshes){
  if(!mesh.geometry.index||/^Combined3DWheel/.test(mesh.name))continue;
  const geometry=mesh.geometry,positions=geometry.attributes.position,matrix=asset.visual.matrixWorld.clone().invert().multiply(mesh.matrixWorld),closed=[],moving=[],v=new T.Vector3();
  for(let i=0;i<geometry.index.count;i+=3){let x=0,y=0,z=0,minX=Infinity,maxY=-Infinity;for(let k=0;k<3;k++){v.fromBufferAttribute(positions,geometry.index.getX(i+k)).applyMatrix4(matrix);x+=v.x/3;y+=v.y/3;z+=v.z/3;minX=Math.min(minX,v.x);maxY=Math.max(maxY,v.y);}const indices=x>.69&&minX>.53&&z>-.94&&z<.39&&y>.27&&maxY<1.16?moving:closed;for(let k=0;k<3;k++)indices.push(geometry.index.getX(i+k));}
  if(!moving.length)continue;
  const subset=indices=>{const g=new T.BufferGeometry();for(const [key,a]of Object.entries(geometry.attributes))g.setAttribute(key,a);g.setIndex(indices);g.computeBoundingBox();g.computeBoundingSphere();asset.ownedGeometries.add(g);return g;};
  const part=new T.Mesh(subset(moving),mesh.material);part.position.copy(mesh.position);part.quaternion.copy(mesh.quaternion);part.scale.copy(mesh.scale);mesh.parent.add(part);part.updateWorldMatrix(true,false);door.attach(part);mesh.geometry=subset(closed);
 }
 glass(model);
 const ready={...asset,door,modelId:'corvette',seat:new T.Vector3(.375,.35,-.46),pedals:[new T.Vector3(.52,.18,.33),new T.Vector3(.23,.18,.38)],wheel:new T.Vector3(.375,.73,-.03)};
 seatOnTires(ready);return ready;
}
export async function loadVehicle(id='bmw'){
 if(!VEHICLE_IDS.includes(id))throw Error('Unknown vehicle');
 if(!cache.has(id))cache.set(id,(async()=>{const name=id==='bmw'?'bmw-330i':'corvette-c6',bytes=await fetchAsset(`/vehicles/${name}.glb?v=2`,30000);return (await new GLTFLoader().parseAsync(bytes,'/vehicles/')).scene;})().catch(error=>{cache.delete(id);throw error;}));
 const model=clone(await cache.get(id));model.traverse(n=>{if(n.material)n.material=Array.isArray(n.material)?n.material.map(m=>m.clone()):n.material.clone();});const asset=id==='bmw'?prepareBMW(model):prepareCorvette(model);asset.shared=true;return asset;
}
export const loadBMW=()=>loadVehicle('bmw');
export function disposeVehicleAsset(asset){
 const geometries=new Set(asset.ownedGeometries||[]),materials=new Set(),textures=new Set();asset.frame.traverse(n=>{if(n.geometry&&!asset.shared)geometries.add(n.geometry);for(const m of n.material?(Array.isArray(n.material)?n.material:[n.material]):[]){materials.add(m);if(!asset.shared)for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});for(const item of [...geometries,...materials,...textures])item.dispose();asset.frame.removeFromParent();
}
