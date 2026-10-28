import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {cloneVehicleMaterials,batchVehicleRendering} from '../src/VehicleRender.js';
import {prepareBMW,prepareCorvette,poseWheels,disposeVehicleAsset} from '../src/VehicleAsset.js';
globalThis.ProgressEvent??=class{};
async function materialRig(file){const b=fs.readFileSync(file),length=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+length));j.buffers[0].uri='data:application/octet-stream;base64,'+b.subarray(28+length).toString('base64');delete j.images;delete j.textures;const strip=o=>{if(!o||typeof o!=='object')return;for(const [key,value]of Object.entries(o)){if(/Texture$/.test(key))delete o[key];else strip(value);}};strip(j);return (await new GLTFLoader().parseAsync(JSON.stringify(j),'')).scene;}
const triangles=mesh=>(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3;
const materials=root=>{const set=new Set();root.traverse(n=>{for(const m of n.material?(Array.isArray(n.material)?n.material:[n.material]):[])set.add(m);});return set;};
const results=[];
for(const [id,file,prepare]of [['bmw','bmw-330i',prepareBMW],['corvette','corvette-c6',prepareCorvette]]){
 const template=await materialRig('public/vehicles/'+file+'.glb'),model=clone(template),other=clone(template);cloneVehicleMaterials(model);cloneVehicleMaterials(other);
 const originalMaterials=materials(template),ownMaterials=materials(model);assert.equal(ownMaterials.size,originalMaterials.size);for(const material of ownMaterials){assert(!originalMaterials.has(material));assert(!materials(other).has(material));}
 const asset=prepare(model);let merged=0,sources=0,batchTriangles=0,sourceTriangles=0;
 for(const batch of asset.renderBatches){assert(!batch.material.transparent);assert(batch.userData.sourceNames.length>1);assert(batch.geometry.attributes.position.array.every(Number.isFinite));merged++;batchTriangles+=triangles(batch);for(const name of batch.userData.sourceNames){const source=asset.frame.getObjectByName(name);assert(source&&!source.visible);sources++;sourceTriangles+=triangles(source);}}
 assert(merged>0&&sources>merged);assert.equal(batchTriangles,sourceTriangles,'Batching dropped source triangles');
 asset.frame.traverse(n=>{for(const m of n.material?(Array.isArray(n.material)?n.material:[n.material]):[])assert(!(m.transmission>0),'A moved glass part re-enabled the full-scene transmission pass');});
 const count=asset.renderBatches.length;batchVehicleRendering(asset);assert.equal(asset.renderBatches.length,count,'Repeated preparation duplicated batches');
 for(const wheel of asset.wheels){let rendered=0;const names=new Set();wheel.pivot.traverse(n=>{if(n.isMesh){if(n.visible)rendered++;if(!n.userData.vehicleBatch)names.add(n.name);}});assert(rendered>0,'A wheel lost its render geometry');for(const batch of asset.renderBatches.filter(b=>b.parent===asset.visual))assert(!batch.userData.sourceNames.some(name=>names.has(name)),'A wheel was merged into the body');}
 poseWheels(asset,1.2,.3);asset.door.rotation.y=-.8;asset.frame.rotation.y=.4;asset.frame.position.set(3,2,7);asset.frame.updateMatrixWorld(true);
 for(const batch of asset.renderBatches){const position=batch.geometry.attributes.position,index=batch.geometry.index,offsets=batch.userData.sourceNames.map(name=>asset.frame.getObjectByName(name));let cursor=0;for(const source of offsets){const sourcePosition=source.geometry.attributes.position;for(let i=0;i<sourcePosition.count;i+=Math.max(1,Math.floor(sourcePosition.count/7))){const a=source.localToWorld(new T.Vector3().fromBufferAttribute(sourcePosition,i)),b=batch.localToWorld(new T.Vector3().fromBufferAttribute(position,cursor+i));assert(a.distanceTo(b)<.0005,'Baked geometry no longer follows its wheel/door transform');const uv=source.geometry.attributes.uv,bakedUV=batch.geometry.attributes.uv;if(uv){assert(Math.abs(uv.getX(i)-bakedUV.getX(cursor+i))<.00002);assert(Math.abs(uv.getY(i)-bakedUV.getY(cursor+i))<.00002,'Batching changed UV coordinates');}}cursor+=sourcePosition.count;}assert(index.count>0);}
 let disposed=0;for(const batch of asset.renderBatches)batch.geometry.addEventListener('dispose',()=>disposed++);asset.shared=true;disposeVehicleAsset(asset);assert.equal(disposed,count,'Owned batches leaked on switching vehicles');
 results.push({id,sharedMaterialCount:ownMaterials.size,batchedSources:sources,batches:merged,preservedTriangles:batchTriangles});
}
// Reflected source nodes need their winding flipped when baked into a rigid owner.
{const visual=new T.Group(),door=new T.Group(),frame=new T.Group();frame.add(visual);visual.add(door);const material=new T.MeshBasicMaterial();const a=new T.Mesh(new T.BoxGeometry(),material),b=new T.Mesh(new T.BoxGeometry(),material);b.scale.x=-1;b.position.x=2;visual.add(a,b);const asset={frame,visual,door,wheels:[],ownedGeometries:new Set()};batchVehicleRendering(asset);assert.equal(asset.renderBatches.length,1);const merged=asset.renderBatches[0].geometry,originalCount=a.geometry.attributes.position.count,indices=merged.index.array;assert(indices.some(i=>i>=originalCount));assert.equal(indices[a.geometry.index.count],b.geometry.index.getX(2)+originalCount);}
fs.mkdirSync('docs/qa/vehicle-fps-2026-10-28',{recursive:true});fs.writeFileSync('docs/qa/vehicle-fps-2026-10-28/render-validation.json',JSON.stringify({status:'PASS',results},null,2)+'\n');console.log('PASS vehicle material isolation, no transmission prepass, rigid batching, geometry/UV retention, independent wheels/doors, reflected winding and disposal',results);
