import assert from 'node:assert/strict';
import * as T from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {HongKongPresentation} from '../src/HongKongPresentation.js';

await RAPIER.init();
const ground=new T.Mesh(new T.PlaneGeometry(2000,2000).rotateX(-Math.PI/2),new T.MeshBasicMaterial());ground.material.map=new T.Texture();ground.updateMatrixWorld(true);
const city={buildingMeshes:[ground],district:{report:{treeStatus:'ready'},setTreeSites(sites){this.sites=sites;}},collisionWorld:{ready:false,colliderToMesh:new Map()}};
const p=Object.create(HongKongPresentation.prototype);
Object.assign(p,{city,sites:[{x:0,z:0,radius:5},{x:0,z:0,radius:5,automatic:true}],scanned:new WeakMap(),reader:{read(){return {data:new Uint8Array([80,80,80,255]),width:1,height:1};}},report:{scannedMeshes:0,automaticTrees:0},lastFocus:new T.Vector3(Infinity,0,Infinity),next:0,colliders:[],railBlocks:[],group:new T.Group(),buildRails(){},syncRailColliders(){}});
p.update(1,new T.Vector3(0,0,0));assert.equal(p.report.scannedMeshes,1);
p.update(5,new T.Vector3(5,0,0));assert.equal(p.report.scannedMeshes,1,'Same tile and cell should not be scanned repeatedly');
p.update(9,new T.Vector3(110,0,0));assert.equal(p.report.scannedMeshes,2,'A large tile must be reconsidered from a new area');
p.update(13,new T.Vector3(500,0,0));assert.equal(p.sites.length,1,'Distant automatic sites must release their budget');assert(!p.sites[0].automatic,'Reviewed sites must remain');
console.log('PASS: large tiles are rescanned by area; distant automatic sites release budget and reviewed sites remain');
p.city.district.report.treeStatus='failed';let railRefreshes=0;p.buildRails=()=>railRefreshes++;p.signature='different';
p.update(17,new T.Vector3(520,0,0));assert.equal(railRefreshes,1,'A failed tree asset must not prevent independent walkway repairs');
assert.equal(p.report.scannedMeshes,3,'Unavailable trees must not start vegetation scanning');
console.log('PASS: failed tree loading does not disable walkway repair');

const world=new RAPIER.World({x:0,y:-9.81,z:0}),mesh=new T.Mesh(new T.BoxGeometry(1,1,1));
const q=Object.create(HongKongPresentation.prototype);const group=new T.Group();group.add(mesh);
Object.assign(q,{city:{collisionWorld:{ready:false,world,colliderToMesh:new Map()},mapSurfaceMeshes:[]},group,colliders:[],railBlocks:[{center:new T.Vector3(0,1,0),size:[.1,.1,4],rotation:new T.Quaternion()}]});
q.syncRailColliders();assert.equal(q.colliders.length,0);q.city.collisionWorld.ready=true;q.syncRailColliders();assert.equal(q.colliders.length,1,'Rails built before physics initialization need collision after it becomes ready');q.syncRailColliders();assert.equal(q.colliders.length,1,'Repeated updates must not duplicate colliders');q.clearRails();assert.equal(q.colliders.length,0);assert.equal(q.city.collisionWorld.colliderToMesh.size,0);world.free();ground.geometry.dispose();ground.material.dispose();
console.log('PASS: late physics initialization creates rail collision once and cleanup removes it');
