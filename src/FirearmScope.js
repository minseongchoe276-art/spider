import * as THREE from 'three';

// Magnification is relative to the player's configured field of view.
export const SCOPE_ZOOMS={pistol:[1.5,2], 'sniper-rifle':[2,4,8]};
export function scopedFov(base,zoom){return THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(base)/2)/zoom));}

// Use visible character geometry when available; fixtures without geometry use
// a bounded body volume. Decorative health bars are outside the chosen root.
export function scopedTarget(camera,origin,targets,range,city){
 camera.updateMatrixWorld(true);
 const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,0),camera);ray.far=range;
 const direction=ray.ray.direction,eye=ray.ray.origin;
 let nearest=null;
 for(const target of targets){
  if(target.health<=0 || !target.position)continue;
  const p=target.position;
  const bounds=new THREE.Box3(new THREE.Vector3(p.x-.85,p.y-.1,p.z-.85),new THREE.Vector3(p.x+.85,p.y+2.15,p.z+.85));
  if(!ray.ray.intersectsBox(bounds))continue;
  const root=target.hitRoot || target.pose?.rig || target.actor?.group;
  let point;
  if(root){
   root.updateWorldMatrix(true,true);
   const hit=ray.intersectObject(root,true).find(item=>item.object.isMesh && item.object.visible);
   if(!hit)continue;point=hit.point;
  }else{
   const body=new THREE.Box3(new THREE.Vector3(p.x-.4,p.y,p.z-.4),new THREE.Vector3(p.x+.4,p.y+1.95,p.z+.4));
   point=ray.ray.intersectBox(body,new THREE.Vector3());if(!point)continue;
  }
  const distance=point.distanceTo(eye);if(distance>range || (nearest && distance>=nearest.distance))continue;
  const wall=city?.raycast?.(eye,direction,distance);
  if(wall && (!Number.isFinite(wall.distance)||wall.distance<distance))continue;
  const shot=point.clone().sub(origin),length=shot.length();
  const cover=length>.05?city?.raycast?.(origin,shot.normalize(),length):null;
  if(cover && (!Number.isFinite(cover.distance)||cover.distance<length))continue;
  nearest={target,point,distance};
 }
 return nearest;
}
