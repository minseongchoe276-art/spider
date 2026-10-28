import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Share a material within one vehicle, while keeping different vehicles isolated.
export function cloneVehicleMaterials(model){
 const copies=new Map();
 const copy=material=>{if(!copies.has(material))copies.set(material,material.clone());return copies.get(material);};
 model.traverse(node=>{if(node.material)node.material=Array.isArray(node.material)?node.material.map(copy):copy(node.material);});
}

// Batch only rigid opaque parts with identical rendering state. The body, each
// wheel's rolling/fixed assembly and the moving door remain separate owners.
export function batchVehicleRendering(asset){
 if(asset.renderBatches)return asset;
 asset.frame.updateMatrixWorld(true);
 const owners=new Set([asset.visual,asset.door,...asset.wheels.flatMap(w=>[w.pivot,w.spin])]),buckets=new Map();
 asset.frame.traverse(mesh=>{
  if(!mesh.isMesh||mesh.isSkinnedMesh||mesh.isInstancedMesh||!mesh.visible||Array.isArray(mesh.material)||mesh.material.transparent||Object.keys(mesh.geometry.morphAttributes).length)return;
  const geometry=mesh.geometry;if(geometry.drawRange.start!==0||geometry.drawRange.count!==Infinity)return;
  let owner=mesh.parent;while(owner&&!owners.has(owner))owner=owner.parent;if(!owner)return;
  const attributes=Object.entries(geometry.attributes).sort(([a],[b])=>a.localeCompare(b)).map(([name,a])=>`${name}:${a.itemSize}:${a.normalized}:${a.gpuType??T.FloatType}:${a.array?.constructor.name||a.data?.array.constructor.name}`).join('|');
  const key=[owner.uuid,mesh.material.uuid,attributes,mesh.castShadow,mesh.receiveShadow,mesh.renderOrder,mesh.layers.mask].join(';');
  if(!buckets.has(key))buckets.set(key,{owner,meshes:[]});buckets.get(key).meshes.push(mesh);
 });
 asset.renderBatches=[];asset.ownedGeometries??=new Set();
 for(const {owner,meshes} of buckets.values()){
  if(meshes.length<2)continue;
  const inverse=owner.matrixWorld.clone().invert(),geometries=[];
  for(const mesh of meshes){
   const geometry=mesh.geometry.clone(),matrix=inverse.clone().multiply(mesh.matrixWorld);geometry.applyMatrix4(matrix);
   for(const attribute of Object.values(geometry.attributes))attribute.gpuType??=T.FloatType;
   if(!geometry.index)geometry.setIndex(Array.from({length:geometry.attributes.position.count},(_,i)=>i));
   // Baking a reflected node also bakes its winding; the owner's determinant
   // will no longer make WebGL flip front faces for that original mesh.
   if(matrix.determinant()<0){const index=geometry.index;for(let i=0;i<index.count;i+=3){const a=index.getX(i);index.setX(i,index.getX(i+2));index.setX(i+2,a);}}
   geometries.push(geometry);
  }
  const geometry=mergeGeometries(geometries,false);for(const item of geometries)item.dispose();if(!geometry)continue;
  geometry.computeBoundingBox();geometry.computeBoundingSphere();asset.ownedGeometries.add(geometry);
  const first=meshes[0],batch=new T.Mesh(geometry,first.material);batch.name='VehicleBatch-'+owner.name+'-'+asset.renderBatches.length;batch.castShadow=first.castShadow;batch.receiveShadow=first.receiveShadow;batch.renderOrder=first.renderOrder;batch.layers.mask=first.layers.mask;
  batch.userData.vehicleBatch=true;batch.userData.sourceNames=meshes.map(m=>m.name);batch.matrixAutoUpdate=false;batch.updateMatrix();owner.add(batch);
  // Keep named authoring nodes for existing wheel/door inspection and retain
  // their transforms; only the batched geometry is submitted to the renderer.
  for(const mesh of meshes)mesh.visible=false;
  asset.renderBatches.push(batch);
 }
 asset.frame.updateMatrixWorld(true);return asset;
}
