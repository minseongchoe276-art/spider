import assert from 'node:assert/strict';
import * as T from 'three';
import {repairTileGeometry} from '../src/TileGeometryIntegrity.js';
const make=ids=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));g.setIndex(ids);return g;};
let g=make([0,1,2,1,2,0,2,1,0]);let r=repairTileGeometry(g);assert.equal(r.duplicates,1);assert.equal(g.index.count,6,'Reverse-facing bridge/wall face was deleted');
g=make([0,1,2,0,1,9,0,0,1]);r=repairTileGeometry(g);assert.equal(r.invalid,1);assert.equal(r.degenerate,1);assert.equal(g.index.count,3);assert(Number.isFinite(g.boundingSphere.radius));
g=make([0,1,2,2,1,0]);g.addGroup(0,3,0);g.addGroup(3,3,1);assert.equal(repairTileGeometry(g).duplicates,0);
g=new T.BufferGeometry();
g.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,0,1,0,0,0,0,1,0,0,0,1,0,0,0,0,1,0,0,0,1,0],3));
g.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,0,1,0,0,1,0,0,1,.5,0,1,0,0,1],2));
g.setIndex([0,1,2,4,5,3,6,7,8]);r=repairTileGeometry(g);
assert.equal(r.duplicates,1);assert.deepEqual([...g.index.array],[0,1,2,6,7,8],'Coincident UV seam must remain while cyclic duplicates are removed');
console.log('PASS oriented duplicates, reverse faces, material boundaries, invalid indices, degenerate triangles and finite bounds');

const {prepareHongKongTile,hongKongRenderingProfile}=await import('../src/HongKongRendering.js');
for(const sharedBasic of [true,false]){
 const scene=new T.Group(),source=make([0,1,2]);let disposed=0;source.addEventListener('dispose',()=>disposed++);
 scene.add(new T.Mesh(source,new T.MeshStandardMaterial()),new T.Mesh(source,sharedBasic?new T.MeshBasicMaterial():new T.MeshStandardMaterial()));
 prepareHongKongTile(scene,'terrain',hongKongRenderingProfile(),8);
 assert.equal(disposed,sharedBasic?0:1,'Shared tile buffers retired before final reference or leaked');
 assert(scene.children[0].geometry.attributes.normal);
 if(sharedBasic)assert.equal(scene.children[1].geometry,source);
 else assert.equal(scene.children[0].geometry,scene.children[1].geometry,'Shared geometry must reuse the creased-normal result');
}
console.log('PASS mixed-material shared geometry survives; fully replaced geometry is disposed exactly once');

g=make([0,1,2]);g.setAttribute('uv',new T.Float32BufferAttribute([NaN,0,1,0,0,Infinity],2));g.setAttribute('normal',new T.Float32BufferAttribute([NaN,0,1,0,0,1,0,0,1],3));r=repairTileGeometry(g);assert.equal(r.repairedUVValues,2);assert(r.recomputedNormals);assert([...g.attributes.uv.array,...g.attributes.normal.array].every(Number.isFinite));console.log('PASS invalid UVs and normals cannot propagate NaNs into tile shaders');

// Later tile preparation calls computeBoundingBox() on the entire attribute,
// not just referenced indices. A removed or unused NaN must not poison it.
for(const indices of [[0,1,2,0,1,3],[0,1,2]]){
 g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([10,0,0,11,0,0,10,1,0,NaN,Infinity,0],3));g.setIndex(indices);
 r=repairTileGeometry(g);assert.deepEqual([...g.index.array],[0,1,2]);g.computeBoundingBox();g.computeBoundingSphere();
 assert([...g.attributes.position.array].every(Number.isFinite));assert(Number.isFinite(g.boundingSphere.radius));
 assert.deepEqual(g.boundingBox.min.toArray(),[10,0,0]);assert.deepEqual(g.boundingBox.max.toArray(),[11,1,0]);
 g.dispose();
}
console.log('PASS removed and unused invalid vertices cannot corrupt subsequent bounds');
