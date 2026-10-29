import * as T from 'three';

// Offline/editor survey of actual planar walls. Returned coordinates are local
// Hong Kong metres, independent of the streamed tile's ECEF node hierarchy.
export function collectFacadeCandidates(meshes,{radius=140}={}) {
  const groups=new Map(),a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),ab=new T.Vector3(),ac=new T.Vector3();
  for(const mesh of meshes){
    if(!mesh.geometry?.attributes.position)continue;
    mesh.updateWorldMatrix(true,false);
    const bounds=new T.Box3().setFromObject(mesh);
    if(bounds.distanceToPoint(new T.Vector3(0,30,0))>radius)continue;
    const p=mesh.geometry.attributes.position,index=mesh.geometry.index,count=index?.count||p.count;
    for(let i=0;i+2<count;i+=3){
      a.fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(p,index?index.getX(i+1):i+1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(p,index?index.getX(i+2):i+2).applyMatrix4(mesh.matrixWorld);
      if(Math.min(Math.hypot(a.x,a.z),Math.hypot(b.x,b.z),Math.hypot(c.x,c.z))>radius)continue;
      ab.subVectors(b,a);ac.subVectors(c,a);const normal=new T.Vector3().crossVectors(ab,ac),area=normal.length()/2;
      if(area<2)continue;normal.normalize();if(Math.abs(normal.y)>.035)continue;
      normal.y=0;normal.normalize();const distance=normal.dot(a);
      const key=[Math.round(normal.x*100),Math.round(normal.z*100),Math.round(distance*2)].join(':');
      let g=groups.get(key);
      if(!g){g={normal:normal.toArray(),distance,vertices:[],area:0};groups.set(key,g);}
      for(const v of [a,b,c])g.vertices.push(...v.toArray().map(n=>+n.toFixed(4)));
      g.area+=area;
    }
  }
  const result=[];
  for(const g of groups.values()){
    const n=new T.Vector3(...g.normal),right=new T.Vector3(n.z,0,-n.x),bounds=new T.Box3();let minU=Infinity,maxU=-Infinity;
    for(let i=0;i<g.vertices.length;i+=3){a.fromArray(g.vertices,i);bounds.expandByPoint(a);const u=a.dot(right);minU=Math.min(minU,u);maxU=Math.max(maxU,u);}
    const width=maxU-minU,height=bounds.max.y-bounds.min.y;
    if(width<8||width>130||height<12||height>220||g.area/(width*height)<.65||bounds.max.y<25)continue;
    result.push({...g,minU,maxU,minY:bounds.min.y,maxY:bounds.max.y,width,height,min:bounds.min.toArray(),max:bounds.max.toArray()});
  }
  return result.sort((a,b)=>b.area-a.area).slice(0,40);
}

const projectedFaces=new WeakMap();
export function insideFacade(u,y,face,margin=0) {
  let triangles=projectedFaces.get(face);
  if(!triangles){
    triangles=[];const vertices=face.vertices;
    for(let i=0;i<vertices.length;i+=9){
      const p=[];for(let j=0;j<3;j++){const k=i+j*3;p.push(vertices[k]*face.normal[2]-vertices[k+2]*face.normal[0],vertices[k+1]);}
      triangles.push(p);
    }
    projectedFaces.set(face,triangles);
  }
  for(const p of triangles){
    const a=(p[2]-p[0])*(y-p[1])-(p[3]-p[1])*(u-p[0]);
    const b=(p[4]-p[2])*(y-p[3])-(p[5]-p[3])*(u-p[2]);
    const c=(p[0]-p[4])*(y-p[5])-(p[1]-p[5])*(u-p[4]);
    if((a>=-margin&&b>=-margin&&c>=-margin)||(a<=margin&&b<=margin&&c<=margin))return true;
  }
  return false;
}
