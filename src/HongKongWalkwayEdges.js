import * as T from 'three';
const key=p=>[p.x,p.y,p.z].map(n=>Math.round(n*20)).join(':');
const cell=(x,z)=>`${Math.floor(x/5)}:${Math.floor(z/5)}`;
export function collectWalkwayEdges(meshes,focus,{radius=95,maxEdges=40}={}){
  const faces=[],edges=new Map(),grid=new Map(),a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),ab=new T.Vector3(),ac=new T.Vector3();
  for(const mesh of meshes){
    if(mesh.userData.presentationRepair || mesh.isInstancedMesh || !mesh.visible)continue;
    const g=mesh.geometry,p=g?.attributes.position;if(!p)continue;
    const box=(g.boundingBox??new T.Box3().setFromBufferAttribute(p)).clone().applyMatrix4(mesh.matrixWorld);
    if(Math.hypot(Math.max(box.min.x-focus.x,0,focus.x-box.max.x),Math.max(box.min.z-focus.z,0,focus.z-box.max.z))>radius)continue;
    const index=g.index,count=index?.count??p.count;
    for(let i=0;i+2<count;i+=3){
      a.fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(mesh.matrixWorld);b.fromBufferAttribute(p,index?index.getX(i+1):i+1).applyMatrix4(mesh.matrixWorld);c.fromBufferAttribute(p,index?index.getX(i+2):i+2).applyMatrix4(mesh.matrixWorld);
      if(Math.hypot((a.x+b.x+c.x)/3-focus.x,(a.z+b.z+c.z)/3-focus.z)>radius)continue;
      const n=new T.Vector3().crossVectors(ab.subVectors(b,a),ac.subVectors(c,a));if(n.lengthSq()<.01 || Math.abs(n.y)/n.length()<.96)continue;
      const f=[a.clone(),b.clone(),c.clone()];faces.push(f);
      for(let x=Math.floor(Math.min(a.x,b.x,c.x)/5);x<=Math.floor(Math.max(a.x,b.x,c.x)/5);x++)for(let z=Math.floor(Math.min(a.z,b.z,c.z)/5);z<=Math.floor(Math.max(a.z,b.z,c.z)/5);z++){
        const id=`${x}:${z}`;if(!grid.has(id))grid.set(id,[]);grid.get(id).push(f);
      }
      if(Math.abs(n.y)/n.length()<.995 || Math.max(a.y,b.y,c.y)-Math.min(a.y,b.y,c.y)>.15)continue;
      for(const [u,v]of [[a,b],[b,c],[c,a]]){
        const id=[key(u),key(v)].sort().join('|');if(edges.has(id))edges.get(id).uses++;else edges.set(id,{a:u.clone(),b:v.clone(),uses:1});
      }
    }
  }
  const height=(x,z,ceiling)=>{
    let top=null;for(const [a,b,c]of grid.get(cell(x,z))??[]){
      const den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(den)<1e-8)continue;
      const u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/den,v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/den,w=1-u-v;
      if(Math.min(u,v,w)<-.005)continue;const y=u*a.y+v*b.y+w*c.y;if(y<=ceiling&&(top===null||y>top))top=y;
    }return top;
  };
  const result=[];
  for(const edge of edges.values()){
    if(edge.uses!==1)continue;
    const direction=edge.b.clone().sub(edge.a).setY(0),length=direction.length();if(length<3||length>50||edge.a.y<3)continue;
    direction.divideScalar(length);const side=new T.Vector3(-direction.z,0,direction.x);let good=0,orientation=0;
    for(const t of [.22,.5,.78]){
      const p=edge.a.clone().lerp(edge.b,t),y=p.y,near=[-1,1].map(s=>height(p.x+side.x*.7*s,p.z+side.z*.7*s,y+.3));
      const inside=near.map(h=>h!==null&&Math.abs(h-y)<.2);if(inside[0]===inside[1])continue;
      const sign=inside[0]?-1:1,far=height(p.x+side.x*6*sign,p.z+side.z*6*sign,y+.3),outside=near[inside[0]?1:0];
      if(far!==null&&Math.abs(far-y)<.2)continue;
      if(outside!==null&&outside>y-1.8)continue;
      // Require a genuine lower surface, so missing LODs cannot invent rails.
      const lower=height(p.x-side.x*2*sign,p.z-side.z*2*sign,y-1);
      if(lower===null||lower>y-1.8)continue;
      good++;orientation+=sign;
    }
    if(good<2)continue;
    const inward=side.multiplyScalar(Math.sign(orientation));result.push({...edge,length,inward,distance:edge.a.clone().lerp(edge.b,.5).distanceTo(focus)});
  }
  return result.sort((a,b)=>a.distance-b.distance).slice(0,maxEdges);
}
