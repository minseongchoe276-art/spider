import assert from 'node:assert/strict';
import * as T from 'three';
import {hongKongRenderingProfile,tuneHongKongTexture,updateHongKongSun,prepareHongKongTile,configureHongKongTiles,nextHongKongError} from '../src/HongKongRendering.js';
import {prepareCityFacade} from '../src/CityFacades.js';
import {TilesRenderer} from '3d-tiles-renderer/three';

for(const quality of ['low','balanced','high']){
  const profile=hongKongRenderingProfile(quality);
  assert(profile.errors.every(n=>Number.isFinite(n)&&n>0));
  assert(profile.anisotropy<=8);
}
assert(hongKongRenderingProfile('high').errors[0]<hongKongRenderingProfile('balanced').errors[0]);
assert(hongKongRenderingProfile('balanced').errors[0]<hongKongRenderingProfile('low').errors[0]);
assert.deepEqual(hongKongRenderingProfile('unknown'),hongKongRenderingProfile('balanced'));
console.log('PASS: quality presets refine photographic terrain instead of using one error target for every device');

const texture=new T.DataTexture(new Uint8Array([151,151,151,255]),1,1);
texture.colorSpace=T.SRGBColorSpace;texture.generateMipmaps=false;texture.flipY=false;
const image=texture.image,filter=texture.minFilter,version=texture.version;
assert(tuneHongKongTexture(texture,8,4));assert.equal(texture.anisotropy,4);
assert(!tuneHongKongTexture(texture,8,4));assert.equal(texture.version,version+1);
assert.equal(texture.image,image);assert.equal(texture.colorSpace,T.SRGBColorSpace);
assert.equal(texture.generateMipmaps,false);assert.equal(texture.flipY,false);assert.equal(texture.minFilter,filter);
assert(tuneHongKongTexture(texture,2,16));assert.equal(texture.anisotropy,2);
assert(!tuneHongKongTexture(null));texture.dispose();
console.log('PASS: anisotropic filtering respects GPU limits and quality changes without replacing authored pixels or mip chains');

const sun=new T.DirectionalLight();sun.shadow.mapSize.set(2048,2048);
for(const p of [new T.Vector3(0,20,0),new T.Vector3(1800,220,-1600)]){
  updateHongKongSun(sun,p);
  assert(sun.target.position.distanceTo(p)<.1);
  assert(sun.position.distanceTo(sun.target.position)>300);
  const first=sun.target.position.clone();
  updateHongKongSun(sun,first.clone().addScalar(.001));
  assert(sun.target.position.equals(first),'Tiny player movement moved the shadow map between texels');
  sun.shadow.updateMatrices(sun);
  assert(sun.shadow.getFrustum().containsPoint(p),'Player left the moving shadow volume');
}
console.log('PASS: contact shadow volume follows distant players, contains their ground and snaps sub-texel movement');

for(let index=0;index<3;index++){
  const tiles=new TilesRenderer('https://example.invalid/tileset.json');
  configureHongKongTiles(tiles,index,hongKongRenderingProfile());
  assert.equal(tiles.loadAncestors,index===0);assert.equal(tiles.loadSiblings,index===0);
  assert.equal(tiles.errorFalloff,0);
  tiles.dispose();
}
console.log('PASS: real tile renderers preserve photographic parent coverage and let independent structural overlays appear without sibling starvation');

const coarse=nextHongKongError(10,10,{full:true,refused:5,utilization:1});assert.equal(coarse,12.5);
assert.equal(nextHongKongError(coarse,10,{full:false,refused:0,utilization:.99}),coarse);
assert(nextHongKongError(coarse,10,{full:false,refused:0,utilization:.7})<coarse);
assert.equal(nextHongKongError(12,12,{full:true,refused:0,utilization:1}),12);
assert.equal(nextHongKongError(28,10,{full:true,refused:1,utilization:1}),28);
console.log('PASS: cache hysteresis prevents repeated blur/sharpen cycles and does not degrade a layer without refused requests');

const placeholder=new T.DataTexture(new Uint8Array([151,151,151,255]),1,1);
const photo=new T.DataTexture(new Uint8Array(16).fill(180),2,2);
const authored=new T.MeshStandardMaterial({map:photo}),flat=new T.MeshStandardMaterial({map:placeholder});
const geo=new T.BoxGeometry(5,12,5);geo.deleteAttribute('normal');
const root=new T.Group(),mesh=new T.Mesh(geo,[flat,authored]);root.add(mesh);
const sharedGeometry=new T.BoxGeometry(5,12,5);sharedGeometry.deleteAttribute('normal');
root.add(new T.Mesh(sharedGeometry,flat));
prepareHongKongTile(root,'building',hongKongRenderingProfile(),16);
assert(geo.attributes.normal&&sharedGeometry.attributes.normal);assert(flat.userData.cityFacade);assert(!authored.userData.cityFacade);
assert.equal(flat.map,placeholder);assert.equal(authored.map,photo);assert(mesh.castShadow&&mesh.receiveShadow);
assert.equal(mesh.userData.surfaceType,'building');
const shader={vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};
flat.onBeforeCompile(shader);assert(shader.fragmentShader.includes('wall*pane'));
flat.map=photo;assert.equal(flat.customProgramCacheKey(),'authored-city-material');
const late={vertexShader:'original',fragmentShader:'original'};flat.onBeforeCompile(late);assert.equal(late.fragmentShader,'original');
assert(!prepareCityFacade(new T.MeshStandardMaterial({map:placeholder})),'Placeholder opt-in leaked into other cities');
geo.dispose();sharedGeometry.dispose();flat.dispose();authored.dispose();placeholder.dispose();photo.dispose();
console.log('PASS: constant-grey building textures gain facades and normals; photos, late replacement textures and other maps remain protected');
