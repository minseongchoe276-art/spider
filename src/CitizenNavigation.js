import * as T from 'three';
// Bounded local route search over actual streamed collision, never a flat proxy.
export function citizenRoute(manager,n,desired){
 const step=1.5,queue=[{point:n.position.clone(),x:0,z:0,parent:null,cost:0}],seen=new Set(['0,0']);let best=null,bestScore=-Infinity;
 const forward=new T.Vector3(Math.sin(desired),0,Math.cos(desired));
 for(let cursor=0;cursor<queue.length&&cursor<48;cursor++){
  const node=queue[cursor];if(node.cost>=6)continue;
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const x=node.x+dx,z=node.z+dz,key=x+','+z;if(seen.has(key))continue;seen.add(key);
   const direction=new T.Vector3(dx,0,dz),point=node.point.clone().addScaledVector(direction,step);
   const height=manager.floor(point);if(height==null||!manager.open(node.point,direction,step+.35))continue;
   // Sample the middle as well so a narrow gap cannot be crossed.
   if(manager.floor(node.point.clone().addScaledVector(direction,step*.5))==null)continue;
   point.y=height+.01;const next={point,x,z,parent:node,cost:node.cost+1};queue.push(next);
   const displacement=point.clone().sub(n.position),score=displacement.dot(forward)-next.cost*.12;
   if(score>bestScore){bestScore=score;best=next;}
  }
 }
 if(!best)return [];
 const route=[];while(best.parent){route.unshift(best.point);best=best.parent;}return route;
}
