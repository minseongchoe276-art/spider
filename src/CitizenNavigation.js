import * as T from 'three';
const up=new T.Vector3(0,1,0);
function facadeHit(manager,origin,direction,max=18){
 const dir=direction.clone();if(dir.lengthSq()<1e-8)return null;dir.normalize();
 let traveled=0;const from=origin.clone();
 for(let hop=0;hop<4&&traveled<max-.05;hop++){
  const hit=manager.ray(from,dir,max-traveled);
  if(!hit?.normal)return null;
  const kind=hit.mesh?.userData?.surfaceType,wall=Math.abs(hit.normal.y)<.42;
  // Poles and railings are not a sidewalk. Only a building face anchors the route.
  const facade=wall&&(manager.city?.isStreamed?kind==='building':kind!=='infrastructure');
  if(facade){hit.distance+=traveled;return hit;}
  const advance=Math.max(.35,hit.distance+.35);traveled+=advance;from.copy(origin).addScaledVector(dir,traveled);
 }
 return null;
}
function nearestFacade(manager,point,max){
 const origin=point.clone();origin.y=(Number.isFinite(point.y)?point.y:0)+1.05;
 let best=null;
 for(let i=0;i<8;i++){
  const angle=i*Math.PI/4,hit=facadeHit(manager,origin,new T.Vector3(Math.sin(angle),0,Math.cos(angle)),max);
  if(hit&&(!best||hit.distance<best.distance))best=hit;
 }
 if(!best)return null;
 const normal=best.normal.clone();normal.y=0;if(normal.lengthSq()<1e-6)return null;normal.normalize();
 const toward=origin.clone().sub(best.point);toward.y=0;if(normal.dot(toward)<0)normal.negate();
 const stand=best.point.clone().addScaledVector(normal,1.2);stand.y=point.y;
 return {stand,normal,tangent:new T.Vector3(-normal.z,0,normal.x),distance:Math.abs(toward.dot(normal))};
}
export function sidewalkAnchor(manager,point){
 const key=`${Math.round(point.x*10)}:${Math.round(point.y*10)}:${Math.round(point.z*10)}`;
 const cache=manager.sidewalkCache||=new Map();
 if(cache.size>900)cache.clear();
 if(cache.has(key))return cache.get(key);
 const found=nearestFacade(manager,point,16);
 const anchor=found&&found.distance>=.65&&found.distance<=1.8?found:null;
 cache.set(key,anchor);return anchor;
}
export function projectSidewalk(manager,point){
 const found=nearestFacade(manager,point,20);
 if(!found||found.distance<.55||found.distance>18)return null;
 return found.stand;
}
function alignTangent(tangent,desired){
 const forward=new T.Vector3(Math.sin(desired),0,Math.cos(desired));
 return tangent.dot(forward)<0?tangent.clone().negate():tangent.clone();
}
function marked(point){
 const copy=point.clone();
 if(point.cross===true)copy.cross=true;
 if(point.recover===true)copy.recover=true;
 return copy;
}
function acceptStep(manager,from,to){
 const dir=to.clone().sub(from);dir.y=0;const distance=dir.length();
 if(distance<.05)return false;dir.multiplyScalar(1/distance);
 const height=manager.floor(to);
 if(height==null||!manager.open(from,dir,distance+.25))return false;
 // Validate the whole segment, including corners between valid endpoints.
 const samples=Math.max(1,Math.ceil(distance/.25));
 for(let i=1;i<=samples;i++){
  const point=from.clone().lerp(to,i/samples);
  if(!sidewalkAnchor(manager,point)||manager.floor(point)==null)return false;
 }
 to.y=height+.01;return true;
}
// Stay on the frontage ribbon. Unmarked gaps never authorize road crossings.
export function traceSidewalk(manager,n,desired){
 let anchor=sidewalkAnchor(manager,n.position),pos=n.position.clone();
 if(!anchor)return [];
 let tangent=alignTangent(anchor.tangent,desired);const route=[];
  for(let step=0;step<8&&route.length<6;step++){
  const ahead=pos.clone().addScaledVector(tangent,1.35);
  let nextAnchor=sidewalkAnchor(manager,ahead),next=ahead.clone();
  if(nextAnchor){
   const pull=nextAnchor.stand.clone().sub(ahead);pull.y=0;next.add(pull.multiplyScalar(.7));
   tangent=alignTangent(nextAnchor.tangent,Math.atan2(tangent.x,tangent.z));
  }else{
   let turned=null;
   for(const side of [-1.6,-2.4,1.6,2.4]){
    if(turned)break;
    for(const forward of [.8,1.8]){
     const probe=pos.clone().addScaledVector(tangent,forward).addScaledVector(anchor.normal,side);
     const found=sidewalkAnchor(manager,probe);
     if(!found||!acceptStep(manager,pos,probe))continue;
     turned={probe,found,dir:anchor.normal.clone().multiplyScalar(Math.sign(side)||1)};
     break;
    }
   }
   if(turned){
    next=turned.probe;nextAnchor=turned.found;
    tangent=alignTangent(turned.found.tangent,Math.atan2(turned.dir.x,turned.dir.z));
   }else break;
  }
  if(!acceptStep(manager,pos,next))break;
  if(!sidewalkAnchor(manager,next))break;
  route.push(marked(next));pos=next;if(nextAnchor)anchor=nextAnchor;
 }
 return route;
}
// Bounded local route search over actual streamed collision, never a flat proxy.
export function citizenRoute(manager,n,desired){
 if(manager.city?.isStreamed&&!manager.city?.footpaths)return traceSidewalk(manager,n,desired);
 const paths=manager.city?.footpaths;
 if(paths){
  const points=paths.route(n.position.x,n.position.z,desired,(x,z,x2,z2)=>{
   const from=new T.Vector3(x,n.position.y,z),to=new T.Vector3(x2,n.position.y,z2),dir=to.clone().sub(from);
   dir.y=0;const distance=dir.length();if(distance<.05)return true;dir.multiplyScalar(1/distance);
   return manager.floor(to)!=null&&manager.open(from,dir,distance+.25)&&!manager.lane?.(to);
  });
  return points.map(point=>new T.Vector3(point.x,n.position.y,point.z));
 }
 const step=1.5,queue=[{point:n.position.clone(),x:0,z:0,parent:null,cost:0}],seen=new Set(['0,0']);let best=null,bestScore=-Infinity;
 const forward=new T.Vector3(Math.sin(desired),0,Math.cos(desired));
 for(let cursor=0;cursor<queue.length&&cursor<48;cursor++){
  const node=queue[cursor];if(node.cost>=6)continue;
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const x=node.x+dx,z=node.z+dz,key=x+','+z;if(seen.has(key))continue;seen.add(key);
   const direction=new T.Vector3(dx,0,dz),point=node.point.clone().addScaledVector(direction,step);
   const height=manager.floor(point);if(height==null||!manager.open(node.point,direction,step+.35)||manager.lane?.(point))continue;
   // Sample the middle as well so a narrow gap cannot be crossed.
   const middle=node.point.clone().addScaledVector(direction,step*.5);
   if(manager.floor(middle)==null||manager.lane?.(middle))continue;
   point.y=height+.01;const next={point,x,z,parent:node,cost:node.cost+1};queue.push(next);
   const displacement=point.clone().sub(n.position),score=displacement.dot(forward)-next.cost*.12;
   if(score>bestScore){bestScore=score;best=next;}
  }
 }
 if(!best)return [];
 const route=[];while(best.parent){route.unshift(best.point);best=best.parent;}return route;
}
