import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HongKongMinimap, isInsideMinimap, worldToHongKongCoordinates, worldToMinimap } from '../src/Minimap.js';

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
