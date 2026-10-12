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
