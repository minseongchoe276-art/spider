import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

export const HK_ROOTS=[
 'https://data.map.gov.hk/api/3d-data/3dtiles/f2/tileset.json',
 'https://data.map.gov.hk/api/3d-data/3dsd/WGS84/building/tileset.json',
 'https://data.map.gov.hk/api/3d-data/3dsd/WGS84/infrastructure/tileset.json',
];
const decoder=new TextDecoder(),encoder=new TextEncoder();
export function hkWorldToLocal(){
 const lat=22.2799955*Math.PI/180,lon=114.165495*Math.PI/180,a=6378137,b=6356752.314245179;
 const normal=new THREE.Vector3(Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat));
 const east=new THREE.Vector3(-Math.sin(lon),Math.cos(lon),0),north=new THREE.Vector3().crossVectors(normal,east);
 const radii=new THREE.Vector3(a*a,a*a,b*b),position=normal.clone().multiply(radii).divideScalar(Math.sqrt(normal.clone().multiply(radii).dot(normal)));
 const frame=new THREE.Matrix4().makeBasis(east,north,normal).setPosition(position);
 return frame.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-Math.PI/2,0,Math.PI))).invert();
}
function slab(a,b,min,max){let lo=0,hi=1;
 for(const k of ['x','y','z']){const d=b[k]-a[k];if(Math.abs(d)<1e-10){if(a[k]<min||a[k]>max)return false;}else{const p=(min-a[k])/d,q=(max-a[k])/d;lo=Math.max(lo,Math.min(p,q));hi=Math.min(hi,Math.max(p,q));if(lo>hi)return false;}}
 return true;
}
export function intersectsVolume(volume,matrix,from,to){
 if(volume?.box){const v=volume.box;if(v.length!==12||!v.every(Number.isFinite))throw Error('Invalid tile box');
  const box=new THREE.Matrix4().makeBasis(new THREE.Vector3(...v.slice(3,6)),new THREE.Vector3(...v.slice(6,9)),new THREE.Vector3(...v.slice(9,12))).setPosition(new THREE.Vector3(...v.slice(0,3)));
  const inverse=matrix.clone().multiply(box);if(Math.abs(inverse.determinant())<1e-14)throw Error('Degenerate tile volume');inverse.invert();
  return slab(from.clone().applyMatrix4(inverse),to.clone().applyMatrix4(inverse),-1.000001,1.000001);
 }
 if(volume?.sphere){const [x,y,z,r]=volume.sphere;if(![x,y,z,r].every(Number.isFinite)||r<0)throw Error('Invalid tile sphere');
  const center=new THREE.Vector3(x,y,z).applyMatrix4(matrix),radius=r*matrix.getMaxScaleOnAxis();
  const d=to.clone().sub(from),t=THREE.MathUtils.clamp(center.clone().sub(from).dot(d)/Math.max(d.lengthSq(),1e-20),0,1);
  return from.clone().addScaledVector(d,t).distanceToSquared(center)<=radius*radius;
 }
 throw Error('Unsupported or absent tile bounding volume');
}
function authorizedUrl(uri,base){const url=new URL(uri,base);if(url.origin!=='https://data.map.gov.hk'||!url.pathname.startsWith('/api/3d-data/')||url.search||url.hash)throw Error('Untrusted terrain URI');return url.href;}
async function digest(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');}
export async function geometryOnly(bytes,url,up='Y'){
 let rtc=[0,0,0],buffer=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 if(decoder.decode(buffer.subarray(0,4))==='b3dm'){
  const v=new DataView(buffer.buffer,buffer.byteOffset,buffer.byteLength);if(v.getUint32(4,true)!==1||v.getUint32(8,true)!==buffer.byteLength)throw Error('Invalid b3dm');
  const f=v.getUint32(12,true),fb=v.getUint32(16,true),b=v.getUint32(20,true),bb=v.getUint32(24,true);
  const feature=f?JSON.parse(decoder.decode(buffer.subarray(28,28+f))):{};
  if(feature.RTC_CENTER){const center=feature.RTC_CENTER;if(Array.isArray(center))rtc=center;else if(Number.isInteger(center.byteOffset)&&center.byteOffset>=0&&center.byteOffset+12<=fb){const data=new DataView(buffer.buffer,buffer.byteOffset+28+f+center.byteOffset,12);rtc=[0,4,8].map(n=>data.getFloat32(n,true));}else throw Error('Invalid RTC center');if(rtc.length!==3||!rtc.every(Number.isFinite))throw Error('Invalid RTC center');}
  buffer=buffer.subarray(28+f+fb+b+bb);
 }
 if(decoder.decode(buffer.subarray(0,4))!=='glTF')throw Error('Unsupported terrain geometry container');
 const view=new DataView(buffer.buffer,buffer.byteOffset,buffer.byteLength);
 if(view.getUint32(4,true)!==2||view.getUint32(8,true)!==buffer.byteLength)throw Error('Invalid glTF container');
 const n=view.getUint32(12,true),json=JSON.parse(decoder.decode(buffer.subarray(20,20+n)));
 delete json.images;delete json.textures;delete json.samplers;json.materials=[];
 for(const mesh of json.meshes||[])for(const primitive of mesh.primitives)delete primitive.material;
 // Geometry decoders must be explicitly supported; never interpret a failed decode as empty space.
 const required=(json.extensionsRequired||[]).filter(x=>!['KHR_texture_basisu','EXT_texture_webp'].includes(x));json.extensionsRequired=required;
 if(required.some(x=>!['KHR_mesh_quantization','KHR_materials_unlit','CESIUM_RTC'].includes(x)))throw Error('Unsupported required geometry extension: '+required.join(','));
 for(const buffer of json.buffers||[])if(buffer.uri)throw Error('External geometry buffers are not accepted');
 const raw=encoder.encode(JSON.stringify(json)),padded=(raw.length+3)&~3,binary=buffer.subarray(20+n);
 const out=new Uint8Array(20+padded+binary.length);out.set(buffer.subarray(0,12));const header=new DataView(out.buffer);header.setUint32(8,out.length,true);header.setUint32(12,padded,true);header.setUint32(16,0x4e4f534a,true);out.fill(32,20,20+padded);out.set(raw,20);out.set(binary,20+padded);
 globalThis.ProgressEvent ||= class {constructor(type,values){Object.assign(this,values);}};
 const center=json.extensions?.CESIUM_RTC?.center;if(center&&(!Array.isArray(center)||center.length!==3||!center.every(Number.isFinite)))throw Error('Invalid CESIUM RTC center');
 const scene=(await new GLTFLoader().parseAsync(out.buffer,new URL('.',url).href)).scene;
 if(center)scene.position.add(new THREE.Vector3(...center));
 const axis=up.toUpperCase();if(!['X','Y','Z'].includes(axis))throw Error('Unsupported glTF up axis');
 const rotation=axis==='Y'?new THREE.Matrix4().makeRotationX(Math.PI/2):axis==='X'?new THREE.Matrix4().makeRotationY(-Math.PI/2):new THREE.Matrix4();
 scene.position.add(new THREE.Vector3(...rtc));scene.updateMatrix();scene.matrix.multiply(rotation);scene.matrixAutoUpdate=false;scene.userData.contentMatrix=scene.matrix.clone();
 let triangles=0;const buffers=new Set();scene.traverse(mesh=>{if(mesh.isMesh){const p=mesh.geometry.attributes.position;if(!p||!p.array.every(Number.isFinite))throw Error('Invalid vertex positions');triangles+=(mesh.geometry.index?.count||p.count)/3;for(const attr of [...Object.values(mesh.geometry.attributes),mesh.geometry.index])if(attr?.array)buffers.add(attr.array.buffer);const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];for(const m of mats)m.side=THREE.DoubleSide;}});
 if(!triangles)throw Error('Terrain geometry has no triangles');scene.userData.triangles=triangles;scene.userData.geometryBytes=[...buffers].reduce((n,b)=>n+b.byteLength,0);return scene;
}
export class HongKongTerrain {
 constructor({fetcher=fetch,maxBytes=64*1024*1024,timeoutMs=15000}={}){this.fetcher=fetcher;this.cache=new Map();this.loading=new Map();this.bytes=0;this.maxBytes=maxBytes;this.timeoutMs=timeoutMs;this.worldToLocal=hkWorldToLocal();}
 async load(url,context,up){
  context.files.add(url);if(context.files.size>80)throw Error('Terrain traversal download limit');
  const old=this.cache.get(url);if(old&&Date.now()-old.time<600000){context.provenance.set(url,old.hash);return old;}
  const pending=this.loading.get(url);if(pending){const item=await pending;context.provenance.set(url,item.hash);return item;}
  const task=(async()=>{
   const response=await this.fetcher(url,{signal:context.signal});if(!response.ok)throw Error('Terrain HTTP '+response.status);
   const limit=16*1024*1024;if(Number(response.headers.get('content-length'))>limit)throw Error('Terrain response size limit');
   const reader=response.body?.getReader();if(!reader)throw Error('Missing terrain response');const chunks=[];let size=0;
   while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('Terrain response size limit');}chunks.push(value);}
   if(context.downloaded+size>32*1024*1024)throw Error('Terrain traversal byte limit');context.downloaded+=size;
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   const hash=await digest(bytes),item={time:Date.now(),hash,size:bytes.length};
   if(url.endsWith('.json'))item.json=JSON.parse(decoder.decode(bytes));else {item.scene=await geometryOnly(bytes,url,up);item.size=Math.max(item.size,item.scene.userData.geometryBytes);}
   if(item.size>this.maxBytes)throw Error('Decoded terrain cache size limit');
   if(old)this.remove(url);this.cache.set(url,item);this.bytes+=item.size;
   while(this.bytes>this.maxBytes&&this.cache.size>1)this.remove(this.cache.keys().next().value);
   return item;
  })();this.loading.set(url,task);
  try{const item=await task;context.provenance.set(url,item.hash);return item;}finally{this.loading.delete(url);}

 }
 remove(url){const item=this.cache.get(url);if(!item)return;this.bytes-=item.size;this.cache.delete(url);item.scene?.traverse(m=>{m.geometry?.dispose();for(const mat of Array.isArray(m.material)?m.material:[m.material])mat?.dispose();});}
 async visibility(from,to){
  const valid=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)&&Math.abs(p.x)<=2500&&Math.abs(p.z)<=2500&&p.y>=-100&&p.y<=1000;
  if(!valid(from)||!valid(to)||Math.hypot(to.x-from.x,to.y-from.y,to.z-from.z)>30)return {status:'UNKNOWN',reason:'Invalid authoritative attack segment'};
  const a=new THREE.Vector3(from.x,from.y+1,from.z),b=new THREE.Vector3(to.x,to.y+1,to.z),length=a.distanceTo(b);
  if(length<.1)return {status:'UNKNOWN',reason:'Degenerate attack segment'};
  const context={signal:AbortSignal.timeout(this.timeoutMs),files:new Set(),provenance:new Map(),downloaded:0,visited:0,triangles:0};let blocked=false;
  const ray=new THREE.Raycaster(a,b.clone().sub(a).normalize(),.01,Math.max(.01,length-.3));
  const visit=async(tile,parent,base,up,refine='REPLACE',depth=0)=>{
   if(depth>30||++context.visited>2000)throw Error('Terrain hierarchy limit');
   const matrix=parent.clone();if(tile.transform){if(tile.transform.length!==16||!tile.transform.every(Number.isFinite))throw Error('Invalid tile transform');matrix.multiply(new THREE.Matrix4().fromArray(tile.transform));}
   if(!intersectsVolume(tile.boundingVolume,matrix,a,b))return;
   if(tile.implicitTiling||tile.extensions?.['3DTILES_implicit_tiling'])throw Error('Implicit terrain coverage unsupported');
   const children=tile.children||[],mode=tile.refine||refine;
   const contents=tile.contents||(tile.content?[tile.content]:[]);
   for(const content of contents){const url=authorizedUrl(content.uri||content.url,base);
    if(url.endsWith('.json')){const data=await this.load(url,context,up);if(!data.json.root)throw Error('Missing external tileset root');await visit(data.json.root,matrix,url,data.json.asset?.gltfUpAxis||up,mode,depth+1);}
    else if(!children.length||mode==='ADD'){const data=await this.load(url,context,up);data.scene.matrix.copy(matrix).multiply(data.scene.userData.contentMatrix);data.scene.updateMatrixWorld(true);context.triangles+=data.scene.userData.triangles;if(ray.intersectObject(data.scene,true).length)blocked=true;}
   }
   for(const child of children)await visit(child,matrix,base,up,mode,depth+1);
  };
  const started=performance.now();
  try{
   for(const url of HK_ROOTS){const data=await this.load(url,context,'Y');if(!data.json.root)throw Error('Missing trusted root');await visit(data.json.root,this.worldToLocal,url,data.json.asset?.gltfUpAxis||'Y');}
   const version=await digest(encoder.encode(JSON.stringify([...context.provenance].sort())));
   return {status:blocked?'BLOCKED':'CLEAR',version,files:context.files.size,visited:context.visited,triangles:context.triangles,downloaded:context.downloaded,ms:performance.now()-started};
  }catch(error){return {status:'UNKNOWN',reason:error.message,files:context.files.size,ms:performance.now()-started};}
 }
}
