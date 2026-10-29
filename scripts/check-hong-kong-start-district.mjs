import assert from 'node:assert/strict';
import * as T from 'three';
import {prepareStartDistrict,startSurfaceKind,createStartSurfaceMaterial} from '../src/HongKongStartDistrict.js';
import {StreamedCollision} from '../src/StreamedCollision.js';
const v=(x,y,z)=>new T.Vector3(x,y,z);
assert.equal(startSurfaceKind([v(-2,20,-2),v(2,20,-2),v(2,20,2)],{facades:false}),'terrace');
for(const points of [ [v(40,20,0),v(42,20,0),v(40,20,2)], [v(0,5,0),v(2,5,0),v(0,5,2)], [v(0,20,0),v(0,23,0),v(0,20,2)] ])assert.equal(startSurfaceKind(points,{facades:false}),null);
assert.equal(startSurfaceKind([v(-22,20,-2),v(2,20,-2),v(2,20,2)]),'terrace','Cross-boundary triangles must be faded per pixel');
const scene=new T.Group(),source=new T.MeshBasicMaterial({map:new T.DataTexture(new Uint8Array(16),2,2)});
const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute([-2,0,-2,-2,0,2,2,0,2, 30,0,30,30,0,34,34,0,34],3));
geo.setAttribute('uv',new T.Float32BufferAttribute([0,0,0,1,1,1,0,0,0,1,1,1],2));
const mesh=new T.Mesh(geo,source);mesh.position.y=20;scene.add(mesh);scene.updateMatrixWorld(true);
const world=new StreamedCollision();await world.initialized;
function bake(meshes){world.setActiveMeshes(meshes);for(const m of meshes)world.enqueue(m);for(let i=0;i<20;i++)world.update(v(0,20.1,0));}
bake([mesh]);const before=world.groundAt(v(0,21,0),3);
prepareStartDistrict(scene,new T.Matrix4(),{facades:false});
assert.equal(mesh.geometry.index.count,3);assert.equal(mesh.children.length,1);assert.equal(mesh.children[0].geometry.attributes.position.count,3);
assert.equal(mesh.children[0].material.map,source.map);assert.equal(mesh.children[0].userData.surfaceType,'terrain');
scene.updateMatrixWorld(true);
// Compare the exact world-space triangle multiset, not just triangle counts.
const rows=[];scene.traverse(m=>{if(!m.isMesh)return;const p=m.geometry.attributes.position,index=m.geometry.index;for(let i=0;i<(index?.count??p.count);i++)rows.push(v(0,0,0).fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(m.matrixWorld).toArray().join(','));});
assert.deepEqual(rows.sort(),['-2,20,-2','-2,20,2','2,20,2','30,20,30','30,20,34','34,20,34'].sort());
prepareStartDistrict(scene,new T.Matrix4(),{facades:false});assert.equal(mesh.children.length,1,'Repeated preparation duplicated surface');
const afterWorld=new StreamedCollision();await afterWorld.initialized;const active=[mesh,...mesh.children];afterWorld.setActiveMeshes(active);for(const m of active)afterWorld.enqueue(m);for(let i=0;i<20;i++)afterWorld.update(v(0,20.1,0));
assert.equal(afterWorld.groundAt(v(0,21,0),3),before,'Replacement changed support');
const shader={vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};createStartSurfaceMaterial(source,'terrace').onBeforeCompile(shader);assert(shader.fragmentShader.includes('fwidth(cell)'));assert(shader.fragmentShader.includes('mix(diffuseColor.rgb,stone,mask*.92)'));
// A nontrivial source/root transform must classify in Hong Kong metres.
const ecef=new T.Matrix4().makeRotationX(.7);ecef.setPosition(1000000,2000000,3000000);
const transformed=new T.Group();transformed.matrixAutoUpdate=false;transformed.matrix.copy(ecef);
const transformedMesh=new T.Mesh(new T.PlaneGeometry(8,8),source);transformedMesh.rotation.x=-Math.PI/2;transformedMesh.position.y=20;transformed.add(transformedMesh);
prepareStartDistrict(transformed,ecef.clone().invert());assert.equal(transformedMesh.children.length,1);
world.dispose();afterWorld.dispose();
console.log('PASS: local scope, roads/walls excluded, exact triangle preservation, photographic map retention, idempotent reload and real Rapier support equality');
