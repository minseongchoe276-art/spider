import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {HONG_KONG_FACADES} from '../src/data/HongKongFacades.js';
import {facadeWindows,facadePoint,HongKongDistrict,CENTRAL_TREES} from '../src/HongKongDistrict.js';
import {insideFacade,collectFacadeCandidates} from '../src/HongKongDistrictGeometry.js';
let total=0;
for(const face of HONG_KONG_FACADES){
 assert.equal(face.normal[1],0);
 const windows=facadeWindows(face);assert(windows.length>100);total+=windows.length;
 for(let i=0;i<face.vertices.length;i+=3)assert(Math.abs(face.vertices[i]*face.normal[0]+face.vertices[i+2]*face.normal[2]-face.distance)<.1,'Unreviewed non-planar wall entered the replacement set');
 for(const {u,y}of windows){
  for(const dx of [-1.32,0,1.32])for(const dy of [-1.35,0,1.35])assert(insideFacade(u+dx,y+dy,face));
  const p=facadePoint(face,u,y,.14);assert(Math.abs(p.dot(new T.Vector3(...face.normal))-face.distance-.14)<1e-8);
 }
}
assert.equal(HONG_KONG_FACADES.length,6);assert.equal(total,1967);
console.log('PASS six reviewed facade polygons: 1967 windows, all corners supported, plane error <10cm and intended 14cm visual relief');
const gap={normal:[0,0,1],distance:0,minU:0,maxU:10,minY:0,maxY:15,vertices:[0,0,0,4,0,0,4,15,0,0,0,0,4,15,0,0,15,0,6,0,0,10,0,0,10,15,0,6,0,0,10,15,0,6,15,0]};
assert(insideFacade(2,5,gap));assert(!insideFacade(5,5,gap));assert(!insideFacade(2,16,gap));
for(const p of facadeWindows(gap))assert(p.u+1.32<=4||p.u-1.32>=6,'Window bridged a real opening');
console.log('PASS polygon holes stay open instead of turning a bounding box into a solid facade');
const mesh=new T.Mesh(new T.BoxGeometry(12,30,10));mesh.position.y=15;mesh.updateMatrixWorld(true);
const before=mesh.geometry.attributes.position.array.slice(),faces=collectFacadeCandidates([mesh]);assert(faces.length>=2);assert.deepEqual(mesh.geometry.attributes.position.array,before);mesh.geometry.dispose();
console.log('PASS wall surveying uses world transforms without modifying source or collision vertices');
const d=Object.create(HongKongDistrict.prototype);Object.assign(d,{facePlanes:[],faceBounds:[],atlas:new T.Texture(),treeCenters:[],treeTops:[],treeActive:{value:0}});
const mat=new T.MeshStandardMaterial();let called=0;mat.onBeforeCompile=()=>called++;mat.customProgramCacheKey=()=> 'previous';d.applySourceMask(mat);const once=mat.onBeforeCompile;d.applySourceMask(mat);assert.equal(mat.onBeforeCompile,once);
const shader={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};mat.onBeforeCompile(shader);
assert.equal(called,1);assert(shader.fragmentShader.includes('abs(hkN.y)<0.2'));assert(shader.fragmentShader.includes('vHkDistrictWorld.y>t.y'));assert.equal(shader.uniforms.hkTreeActive,d.treeActive);assert(mat.customProgramCacheKey().startsWith('previous|'));
console.log('PASS source masks preserve existing shader hooks, exclude horizontal floors, and enable canopy removal only after model readiness');
assert(CENTRAL_TREES.every(t=>t.height>10&&t.base+1.5>t.base));assert.equal(CENTRAL_TREES.length,7);
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');assert.equal(hash('public/models/environment/hong-kong-pine.glb'),hash('SoldierThirdPersonThreeJS/public/models/environment/tree.glb'));
mat.dispose();d.atlas.dispose();console.log('PASS seven verified canopy sites reuse the existing workspace model without changing its embedded source pixels');
