import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HongKongMinimap, collectTerrainMeshes, configureTerrainCamera, isInsideMinimap, worldToHongKongCoordinates, worldToMinimap } from '../src/Minimap.js';

const center = { x: 100, z: -50 };
assert.deepEqual(worldToMinimap(center, center, 600, 100), { x: 100, y: 100 });
assert.deepEqual(worldToMinimap({ x: 700, z: -50 }, center, 600, 100), { x: 0, y: 100 });
assert.deepEqual(worldToMinimap({ x: 100, z: 550 }, center, 600, 100), { x: 100, y: 0 });
assert.deepEqual(worldToMinimap(center, center, 600, 95, 100), { x: 100, y: 100 });
assert.equal(isInsideMinimap({ x: 700, z: -50 }, center, 600), true);
assert.equal(isInsideMinimap({ x: 701, z: -50 }, center, 600), false);
const origin = worldToHongKongCoordinates({ x: 0, z: 0 });
assert.equal(origin.latitude, 22.2799955);
assert.equal(origin.longitude, 114.165495);
assert.ok(worldToHongKongCoordinates({ x: 100, z: 100 }).longitude < origin.longitude);
assert.ok(worldToHongKongCoordinates({ x: 100, z: 100 }).latitude > origin.latitude);
const local=Object.create(HongKongMinimap.prototype);
local.range=240;local.city={isStreamed:false,buildings:[
  {x:10,z:0,size:20,height:80},{x:500,z:0,size:20,height:80},
]};
assert.equal(local.collectFootprints({x:0,z:0}).length,1);
assert.equal(local.collectFootprints({x:500,z:0}).length,1);
const near=new THREE.Mesh(new THREE.BoxGeometry(12,40,12));near.position.set(20,20,0);
const far=Array.from({length:500},(_,i)=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(12,40,12));mesh.position.set(1000+i*20,20,0);return mesh;
});
const streamed=Object.create(HongKongMinimap.prototype);
streamed.range=600;streamed.city={isStreamed:true,collisionWorld:{meshes:new Map([...far,near].map((mesh,i)=>[i,{mesh}]))}};
const footprints=streamed.collectFootprints({x:0,z:0});
assert.equal(footprints.length,1,'Nearby streamed building was lost while sampling distant tiles');
assert(Math.abs(footprints[0].minX-14)<.001);
console.log('Minimap projection checks passed.');

const camera=new THREE.OrthographicCamera();
const focus=new THREE.Vector3(100,90,-50);
configureTerrainCamera(camera,focus,240);
const screen=p=>p.clone().project(camera);
const ground=screen(new THREE.Vector3(100,0,-50));
const roof=screen(new THREE.Vector3(100,100,-50));
assert(roof.y>ground.y+.1,'Height disappeared from terrain projection');
assert(screen(new THREE.Vector3(80,0,-50)).x>ground.x,'East points left');
assert(screen(new THREE.Vector3(100,0,-30)).y>ground.y,'North points down');
assert(roof.toArray().every(Number.isFinite));
const group=new THREE.Group();group.position.set(20,0,30);group.add(near);
const hidden=new THREE.Mesh(new THREE.BoxGeometry(20,20,20));hidden.visible=false;group.add(hidden);
const terrain=collectTerrainMeshes({isStreamed:true,buildingMeshes:[...far,group]}, {x:0,z:0},600);
assert.deepEqual(terrain,[near],'Group terrain lost its real geometry or included distant/hidden meshes');
const map=Object.create(HongKongMinimap.prototype);
Object.assign(map,{range:600,city:{isStreamed:true,buildingMeshes:[group]},mapScene:new THREE.Scene(),
  terrainCopies:new Map(),terrainMaterial:new THREE.MeshLambertMaterial()});
let disposed=0;near.geometry.addEventListener('dispose',()=>disposed++);
map.syncTerrain({x:0,z:0});
const copy=map.terrainCopies.get(near);
assert.equal(copy.geometry,near.geometry,'Terrain triangles were replaced by tile boxes');
assert.deepEqual(copy.matrix.elements,near.matrixWorld.elements,'Nested tile transform lost');
map.syncTerrain({x:4000,z:0});
assert.equal(map.terrainCopies.size,0);assert.equal(disposed,0,'Streaming out disposed the main city');
console.log('PASS 3D minimap: height, compass, nested real terrain, distance filtering, shared geometry lifecycle');
