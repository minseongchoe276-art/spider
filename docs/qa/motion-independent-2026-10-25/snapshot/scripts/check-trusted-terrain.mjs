import assert from 'node:assert/strict';
import * as THREE from 'three';
import {TrustedTerrain,terrainPermitsDamage} from './lib/trusted-terrain.mjs';

const wall=new THREE.Mesh(new THREE.BoxGeometry(1,20,8),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
wall.position.set(0,10,0);wall.updateMatrixWorld(true);
const from={x:-3,y:5,z:0},to={x:3,y:5,z:0};
for(const terrain of [null,new TrustedTerrain([wall]),new TrustedTerrain([wall],{complete:true,radius:100})])
  assert.equal(terrainPermitsDamage(terrain,from,to),false,'Missing coverage became a hit');
const verified=new TrustedTerrain([wall],{complete:true,radius:100,version:'isolated-wall-v1'});
assert.equal(verified.visibility(from,to).status,'BLOCKED');
assert.equal(terrainPermitsDamage(verified,from,to),false);
const clear={x:-3,y:5,z:3};assert.equal(terrainPermitsDamage(verified,from,clear),true);
assert.equal(verified.visibility(from,{x:300,y:5,z:0}).status,'UNKNOWN');
assert.equal(terrainPermitsDamage(verified,from,{x:NaN,y:5,z:0}),false);
wall.geometry.dispose();wall.material.dispose();
console.log('PASS trusted terrain contract: verified clear path only; wall, unknown, missing version, invalid and out-of-coverage paths reject damage');
