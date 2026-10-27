import assert from 'node:assert/strict';
import * as THREE from 'three';
import {forEachConcurrent} from '../src/AssetLoader.js';
import {UrbanGroundCity} from '../src/UrbanGroundCity.js';
import {StreamedCollision} from '../src/StreamedCollision.js';
import {decodeRGBKTX2} from '../src/TileTextures.js';

let active=0, peak=0;const completed=[];
await forEachConcurrent(Array.from({length:17},(_,i)=>i),4,async i=>{
  active++;peak=Math.max(peak,active);
  await new Promise(resolve=>setTimeout(resolve,2+(i%3)));
  completed.push(i);active--;
});
assert.equal(peak,4);assert.equal(active,0);
assert.deepEqual(completed.sort((a,b)=>a-b),Array.from({length:17},(_,i)=>i));
await forEachConcurrent([],4,()=>assert.fail('Empty queue called a worker'));
console.log('PASS: bounded parallel loading overlaps requests and processes every item once');

const city=Object.create(UrbanGroundCity.prototype);
city.camera=new THREE.PerspectiveCamera(65,1.6,.2,1000);city.camera.position.set(4,22,-7);
city.streamCamera=city.camera.clone();city.isReady=false;
city.updateStreamingCamera(1000);
assert.equal(city.streamCamera.far,1000);
assert.equal(city.streamCamera.fov,city.camera.fov);
assert(city.streamCamera.position.equals(city.camera.position));
city.isReady=true;city.readyAt=1000;
city.camera.far=1200;city.updateStreamingCamera(7000);assert.equal(city.streamCamera.far,1200);
city.camera.far=500;city.updateStreamingCamera(50000);assert.equal(city.streamCamera.far,500);
assert.equal(city.camera.far,500);
console.log('PASS: streaming camera immediately maintains full camera range and matching frustum');

// Larger loading batches must produce the same real support surface.
const surface=new THREE.Mesh(new THREE.BoxGeometry(20,2,20));surface.position.y=19;surface.updateMatrixWorld(true);
const source=surface.geometry.index.array, repeated=new Uint32Array(source.length*400);
for(let i=0;i<400;i++)repeated.set(source,i*source.length);
surface.geometry.setIndex(new THREE.BufferAttribute(repeated,1));
for(const options of [undefined,{budgetMs:8,maxIndices:24000}]){
  const world=new StreamedCollision();await world.initialized;world.setActiveMeshes([surface]);world.enqueue(surface);
  for(let i=0;i<30&&(world.pending.length||world.job);i++)world.update(new THREE.Vector3(0,20,0),options);
  assert.equal(world.pending.length,0);assert.equal(world.job,null);
  assert(Math.abs(world.groundAt(new THREE.Vector3(0,21,0),3)-20)<.001);world.dispose();
}
console.log('PASS: loading and gameplay collision budgets produce identical rooftop support');

// Verify every RGB channel and authored mip level survive the faster conversion.
const levels=[{w:4,h:4},{w:2,h:2},{w:1,h:1}];
const size=80+levels.length*24+levels.reduce((n,l)=>n+l.w*l.h*3,0);
const buffer=new ArrayBuffer(size),view=new DataView(buffer),bytes=new Uint8Array(buffer);
bytes.set([171,75,84,88,32,50,48,187,13,10,26,10]);
for(const [offset,value]of [[12,29],[16,1],[20,4],[24,4],[36,1],[40,levels.length]])view.setUint32(offset,value,true);
let offset=80+levels.length*24;
for(const [level,{w,h}]of levels.entries()){
  const length=w*h*3;view.setBigUint64(80+level*24,BigInt(offset),true);view.setBigUint64(88+level*24,BigInt(length),true);
  for(let i=0;i<length;i++)bytes[offset+i]=(level*53+i*17)%256;
  offset+=length;
}
const texture=decodeRGBKTX2(buffer);assert(texture);offset=80+levels.length*24;
for(const [level,{w,h}]of levels.entries()){
  const mip=texture.mipmaps[level];assert.equal(mip.width,w);assert.equal(mip.height,h);
  for(let pixel=0;pixel<w*h;pixel++){
    assert.deepEqual([...mip.data.slice(pixel*4,pixel*4+4)],[...bytes.slice(offset+pixel*3,offset+pixel*3+3),255]);
  }
  offset+=w*h*3;
}
assert.equal(texture.colorSpace,THREE.SRGBColorSpace);texture.dispose();
console.log('PASS: RGB pixels, alpha, color space and all authored mip levels are preserved');
