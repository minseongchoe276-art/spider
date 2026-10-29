import fs from 'node:fs';
import assert from 'node:assert/strict';
import {isKTX2,decodeRGBKTX2,createTileTexturePlugin} from '../src/TileTextures.js';
const magic=Uint8Array.from([171,75,84,88,32,50,48,187,13,10,26,10]);
assert(isKTX2(magic.buffer));assert(!isKTX2(new Uint8Array(4).buffer));assert(!isKTX2(Uint8Array.from([255,216,0,0,0,0,0,0,0,0,0,0]).buffer));
let passed=0;
for(const [bytes,mime,expected] of [[magic,'image/png','ktx'],[Uint8Array.from([255,216,1,2]),'image/jpeg','native']]) {
 const calls=[],native={type:'native'},ktx={type:'ktx'},parser={json:{images:[{bufferView:0,mimeType:mime}]},options:{path:'public-tile/'},getDependency:async()=>bytes.buffer,loadTextureImage:async(...args)=>{calls.push(args);return {texture:true};}},city={textureDiagnostics:[]};
 createTileTexturePlugin(parser,ktx,city).beforeRoot();await parser.loadTextureImage(0,0,native);assert.equal(calls[0][2].type,expected);assert.equal(city.textureDiagnostics.length,0);passed++;
}
console.log(`PASS: ${passed} tile texture routing paths, including extension-based loading and mislabeled embedded KTX2`);
const raw=fs.readFileSync('docs/qa/hong-kong/failed-texture.ktx2');
const buffer=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);const texture=decodeRGBKTX2(buffer);assert(texture);assert.equal(texture.image.width,1);assert.deepEqual([...texture.image.data],[151,151,151,255]);texture.dispose();
const invalid=buffer.slice(0);new DataView(invalid).setUint32(20,65535,true);assert.equal(decodeRGBKTX2(invalid),null);assert.equal(decodeRGBKTX2(buffer.slice(0,200)),null);
console.log('PASS: actual Hong Kong RGB KTX2 color preserved as RGBA; oversized and truncated payloads rejected');

// Exercise the real GLTF parser: keep its sampler/cache/transform semantics
// while proving embedded KTX2 never reaches the Blob/object-URL path.
const THREE=await import('three');
const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
function embeddedGLB(bytes){
 const json={asset:{version:'2.0'},extensionsUsed:['KHR_texture_transform'],buffers:[{byteLength:bytes.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:bytes.length}],images:[{bufferView:0,mimeType:'image/png',extras:{survey:'Hong Kong'}}],samplers:[{wrapS:33071,wrapT:33071,minFilter:9728,magFilter:9728},{wrapS:10497,wrapT:10497,minFilter:9729,magFilter:9729}],textures:[{source:0,sampler:0,name:'clamped'},{source:0,sampler:1,name:'repeated'}],materials:[{pbrMetallicRoughness:{baseColorTexture:{index:0,extensions:{KHR_texture_transform:{offset:[.2,.3],scale:[2,3]}}}}}]};
 const text=new TextEncoder().encode(JSON.stringify(json)),jsonSize=Math.ceil(text.length/4)*4,bodySize=Math.ceil(bytes.length/4)*4,result=new ArrayBuffer(28+jsonSize+bodySize),view=new DataView(result),data=new Uint8Array(result);
 view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,result.byteLength,true);view.setUint32(12,jsonSize,true);view.setUint32(16,0x4e4f534a,true);data.fill(32,20,20+jsonSize);data.set(text,20);view.setUint32(20+jsonSize,bodySize,true);view.setUint32(24+jsonSize,0x004e4942,true);data.set(bytes,28+jsonSize);return result;
}
const originalObjectURL=URL.createObjectURL;let objectURLs=0,parses=0;
URL.createObjectURL=()=>{objectURLs++;throw new Error('Embedded KTX2 must not allocate an object URL');};
try{
 const loader={parse(bytes,onLoad){parses++;const owned=structuredClone(bytes,{transfer:[bytes]});assert.equal(owned.byteLength,magic.byteLength);queueMicrotask(()=>onLoad(new THREE.DataTexture(new Uint8Array([31,63,95,255]),1,1)));}};
 const city={textureDiagnostics:[]},gltf=await new GLTFLoader().register(parser=>createTileTexturePlugin(parser,loader,city)).parseAsync(embeddedGLB(magic),'');
 const [clamped,repeated]=await Promise.all([gltf.parser.getDependency('texture',0),gltf.parser.getDependency('texture',1)]);
 assert(clamped&&repeated);assert.equal(parses,1);assert.notEqual(clamped,repeated);assert.equal(clamped.image,repeated.image);assert.equal(clamped.wrapS,THREE.ClampToEdgeWrapping);assert.equal(repeated.wrapS,THREE.RepeatWrapping);assert.equal(clamped.minFilter,THREE.NearestFilter);assert.equal(repeated.minFilter,THREE.LinearFilter);assert.equal(clamped.flipY,false);assert.equal(clamped.name,'clamped');assert.equal(clamped.userData.survey,'Hong Kong');assert.deepEqual(gltf.parser.associations.get(clamped),{textures:0});
 const originalBytes=await gltf.parser.getDependency('bufferView',0);assert.equal(originalBytes.byteLength,magic.byteLength);assert.deepEqual([...new Uint8Array(originalBytes)],[...magic]);
 const material=await gltf.parser.getDependency('material',0);assert.equal(material.map.colorSpace,THREE.SRGBColorSpace);assert.deepEqual(material.map.offset.toArray(),[.2,.3]);assert.deepEqual(material.map.repeat.toArray(),[2,3]);assert.equal(clamped.offset.x,0);assert.equal(objectURLs,0);assert.equal(city.textureDiagnostics.length,0);
 clamped.dispose();repeated.dispose();material.map.dispose();material.dispose();
 const rgbCity={textureDiagnostics:[]},rgb=await new GLTFLoader().register(parser=>createTileTexturePlugin(parser,{parse(){assert.fail('RGB KTX2 should use the lossless RGB adapter');}},rgbCity)).parseAsync(embeddedGLB(new Uint8Array(buffer)),'');
 const rgbTexture=await rgb.parser.getDependency('texture',0);assert.deepEqual([...rgbTexture.image.data],[151,151,151,255]);assert.equal(objectURLs,0);rgbTexture.dispose();
 const badCity={textureDiagnostics:[]},bad=await new GLTFLoader().register(parser=>createTileTexturePlugin(parser,{parse(bytes,onLoad,onError){onError(new Error('Controlled decoder failure'));}},badCity)).parseAsync(embeddedGLB(magic),'');assert.equal(await bad.parser.getDependency('texture',0),null);assert.equal(badCity.textureDiagnostics.length,1);
}finally{URL.createObjectURL=originalObjectURL;}
console.log('PASS: actual GLTF parser decodes embedded KTX2 once without Blob URLs, preserves shared bytes, independent samplers, transforms, color space and failure diagnostics');
