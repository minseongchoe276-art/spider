import assert from 'node:assert/strict';
import * as T from 'three';
import {TilesRenderer} from '3d-tiles-renderer/three';
import {FAILED,LOADING,LOADED,UNLOADED,LRUCache} from '3d-tiles-renderer/core';
import {scheduleTileRetry,recoverFailedTiles} from '../src/TileRecovery.js';
import {UrbanGroundCity} from '../src/UrbanGroundCity.js';
import {StreamedCollision} from '../src/StreamedCollision.js';
import {configureHongKongFog,hongKongRenderingProfile} from '../src/HongKongRendering.js';
const tiles=new TilesRenderer('https://example.invalid/tileset.json');tiles.userData={retryAt:0,retries:0};let now=100;
for(let i=0;i<8;i++){
  tiles.rootLoadingState=FAILED;scheduleTileRetry(tiles,now);const deadline=tiles.userData.retryAt;
  assert(deadline>now&&deadline-now<=30000);scheduleTileRetry(tiles,now+100);assert.equal(tiles.userData.retryAt,deadline,'A second failure postponed the first retry');
  assert.equal(recoverFailedTiles(tiles,deadline-1),0);assert.equal(tiles.rootLoadingState,FAILED);
  assert.equal(recoverFailedTiles(tiles,deadline),1);assert.equal(tiles.rootLoadingState,UNLOADED);now=deadline+1;
}
assert.equal(tiles.userData.retries,5);tiles.rootLoadingState=LOADING;recoverFailedTiles(tiles,now);assert.equal(tiles.userData.retries,5);
tiles.rootLoadingState=LOADED;tiles.stats.downloading=1;recoverFailedTiles(tiles,now);assert.equal(tiles.userData.retries,5);
tiles.stats.downloading=0;recoverFailedTiles(tiles,now);assert.equal(tiles.userData.retries,0);
const failed={internal:{loadingState:FAILED},children:[]};tiles.rootTileset={root:{internal:{loadingState:LOADED},children:[failed,{children:[]}]}};tiles.stats.failed=1;
scheduleTileRetry(tiles,now);assert.equal(tiles.userData.retryAt-now,2000);recoverFailedTiles(tiles,now+2000);assert.equal(failed.internal.loadingState,UNLOADED);
tiles.rootTileset=null;tiles.dispose();console.log('PASS: eight consecutive retry cycles, bounded backoff, earliest deadline, pending-batch preservation, later independent failure recovery');
const city=Object.create(UrbanGroundCity.prototype);Object.assign(city,{scene:new T.Scene(),tileCache:new LRUCache(),tilesets:[]});city.scene.fog=new T.FogExp2(0xaed9eb,.00032);city.setStreamingQuality('balanced');
const layer={tilesetIndex:0,userData:{baseErrorTarget:10},errorTarget:25};city.tilesets=[layer];const fog=city.scene.fog,budget=city.streamingBudget;
city.setStreamingQuality('balanced');assert.equal(layer.errorTarget,25);assert.equal(city.scene.fog,fog);assert.equal(city.streamingBudget,budget);
city.setStreamingQuality('low');assert.equal(layer.errorTarget,20);assert.equal(layer.userData.baseErrorTarget,20);assert.equal(city.renderingProfile.streamDistance,500);
city.setStreamingQuality('high');assert.equal(layer.errorTarget,6);assert.equal(layer.userData.baseErrorTarget,6);assert.equal(city.renderingProfile.streamDistance,1200);
console.log('PASS: unrelated preference application preserves adaptive detail; actual quality changes update baseline, memory budget and view distance');
for(const quality of ['low','balanced','high']){
 const scene=new T.Scene();scene.fog=new T.FogExp2(0xaed9eb,.00032);const color=scene.fog.color.clone(),profile=hongKongRenderingProfile(quality);configureHongKongFog(scene,profile);
 assert(scene.fog.isFog&&!scene.fog.isFogExp2);assert(scene.fog.color.equals(color));assert(scene.fog.near>0&&scene.fog.near<scene.fog.far&&scene.fog.far<profile.streamDistance);
 const stable=scene.fog;configureHongKongFog(scene,profile);assert.equal(scene.fog,stable);
}
console.log('PASS: all qualities fade completely before their streaming boundary, retain fog color and reuse fog state');
city.camera=new T.PerspectiveCamera(65,1,.2,400);city.streamCamera=city.camera.clone();city.updateStreamingCamera();
assert.equal(city.streamCamera.far,400);assert.equal(city.scene.fog.far,340);
city.camera.far=1200;city.updateStreamingCamera();assert.equal(city.scene.fog.far,1020);
console.log('PASS: fog tracks a shortened display camera and restores the selected quality range');
const collision=new StreamedCollision();await collision.initialized;
const geometry=new T.PlaneGeometry(20,20,4,4);geometry.computeBoundingBox();
let boundScans=0;const original=geometry.computeBoundingBox.bind(geometry);geometry.computeBoundingBox=()=>{boundScans++;original();};
const close=new T.Mesh(geometry),far=new T.Mesh(geometry);far.position.x=100;
collision.setActiveMeshes([far,close]);collision.enqueue(far);collision.enqueue(close);collision.update(new T.Vector3(),{budgetMs:0,maxIndices:3});
assert.equal(boundScans,0,'Priority sorting rescanned cached vertex bounds');assert.equal(collision.job.mesh,close);assert.equal(collision.pending[0],far);
collision.dispose();geometry.dispose();
console.log('PASS: collision priority reuses cached bounds while still baking the nearest tile first');
