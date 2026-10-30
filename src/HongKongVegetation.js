import * as T from 'three';

export function textureSample(image,u,v){
  if(!image?.data||!image.width||!image.height)return null;
  const x=Math.max(0,Math.min(image.width-1,Math.floor(u*image.width))),y=Math.max(0,Math.min(image.height-1,Math.floor(v*image.height))),i=(y*image.width+x)*4;
  return [image.data[i],image.data[i+1],image.data[i+2]];
}
export function isVegetationColor([r,g,b]){return g>45&&g>r*1.08&&g>b*1.03&&g-r>5;}
export function detectCanopyCandidates(mesh,image){
  const g=mesh.geometry,p=g?.attributes.position,uv=g?.attributes.uv;if(!p||!uv)return [];
  const index=g.index,count=index?.count??p.count,points=[],cells=new Map(),v=[new T.Vector3(),new T.Vector3(),new T.Vector3()],a=new T.Vector3(),b=new T.Vector3();
  for(let i=0;i+2<count;i+=3){
    const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),u=ids.reduce((s,id)=>s+uv.getX(id),0)/3,w=ids.reduce((s,id)=>s+uv.getY(id),0)/3;
    const color=textureSample(image,u,w);if(!color||!isVegetationColor(color))continue;
    ids.forEach((id,j)=>v[j].fromBufferAttribute(p,id).applyMatrix4(mesh.matrixWorld));
    const normal=new T.Vector3().crossVectors(a.subVectors(v[1],v[0]),b.subVectors(v[2],v[0]));if(normal.lengthSq()<.01||Math.abs(normal.y)/normal.length()>.94)continue;
    const point=v[0].clone().add(v[1]).add(v[2]).multiplyScalar(1/3),id=points.length;
    const entry={point,bounds:new T.Box3().setFromPoints(v)};points.push(entry);const key=`${Math.floor(point.x/3)}:${Math.floor(point.z/3)}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(id);
  }
  const visited=new Set(),candidates=[];
  for(let id=0;id<points.length;id++){
    if(visited.has(id))continue;
    const queue=[id],bounds=new T.Box3();let triangles=0;
    while(queue.length){const i=queue.pop();if(visited.has(i))continue;visited.add(i);const entry=points[i];bounds.union(entry.bounds);triangles++;
      const x=Math.floor(entry.point.x/3),z=Math.floor(entry.point.z/3);
      for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const j of cells.get(`${x+dx}:${z+dz}`)??[]){if(!visited.has(j)&&Math.abs(points[j].point.y-entry.point.y)<4.5)queue.push(j);}
    }
    const size=bounds.getSize(new T.Vector3());
    // Reject lawns, large forest hillsides, green walls and slender poles.
    if(triangles<6||size.x<2.5||size.z<2.5||size.x>24||size.z>24||size.y<2.2||size.y>25||Math.min(size.x,size.z)/Math.max(size.x,size.z)<.32)continue;
    const center=bounds.getCenter(new T.Vector3());candidates.push({x:center.x,z:center.z,minY:bounds.min.y,maxY:bounds.max.y,radius:Math.max(size.x,size.z)*.55,triangles});
  }
  return candidates;
}

export class PhotoTextureReader{
  constructor(renderer){this.renderer=renderer;this.cache=new WeakMap();this.target=new T.WebGLRenderTarget(128,128,{depthBuffer:false});this.target.texture.colorSpace=T.SRGBColorSpace;this.scene=new T.Scene();this.camera=new T.OrthographicCamera(-1,1,1,-1,0,2);this.camera.position.z=1;this.material=new T.MeshBasicMaterial({depthTest:false,depthWrite:false,toneMapped:false});this.geometry=new T.PlaneGeometry(2,2);this.scene.add(new T.Mesh(this.geometry,this.material));}
  read(texture){
    if(this.cache.has(texture))return this.cache.get(texture);
    const previous=this.renderer.getRenderTarget(),data=new Uint8Array(128*128*4);
    try{this.material.map=texture;this.material.needsUpdate=true;this.renderer.setRenderTarget(this.target);this.renderer.render(this.scene,this.camera);this.renderer.readRenderTargetPixels(this.target,0,0,128,128,data);}finally{this.renderer.setRenderTarget(previous);}
    const image={data,width:128,height:128};this.cache.set(texture,image);return image;
  }
  dispose(){this.target.dispose();this.geometry.dispose();this.material.dispose();}
}
