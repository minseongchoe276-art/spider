import assert from 'node:assert/strict';
import * as T from 'three';
import {UrbanGroundCity} from '../../../src/UrbanGroundCity.js';
import {LRUCache,FAILED,UNLOADED} from '3d-tiles-renderer/core';
const city=Object.create(UrbanGroundCity.prototype);globalThis.location={search:''};
const tile={userData:{retryAt:1,retries:5},stats:{failed:1,refused:0},rootLoadingState:FAILED,setCamera(){},setResolutionFromRenderer(){},update(){},traverse(){}};
Object.assign(city,{isReady:true,root:new T.Group(),camera:new T.PerspectiveCamera(65,1,.2,1200),streamCamera:new T.PerspectiveCamera(),tilesets:[tile],tileCache:new LRUCache(),buildingMeshes:[],playerPosition:new T.Vector3(),collisionWorld:{setActiveMeshes(){},update(){}},refreshBuildingMeshes(){}});
city.update();assert.equal(tile.rootLoadingState,FAILED);assert.equal(tile.userData.retries,5);
console.log('REPRODUCED: a later failed request stays FAILED after five earlier retry cycles, even with an expired retry deadline');
city.tilesets=[];city.setStreamingQuality('balanced');
const adaptive={tilesetIndex:0,userData:{baseErrorTarget:10},errorTarget:25};city.tilesets=[adaptive];city.setStreamingQuality('balanced');assert.equal(adaptive.errorTarget,10);
console.log('REPRODUCED: reapplying unchanged balanced quality resets adapted error 25 -> 10');
const density=.00032;for(const distance of [500,750]){const visibility=Math.exp(-Math.pow(density*distance,2));assert(visibility>.94);console.log(`DISTANCE REVIEW: fog retains ${(visibility*100).toFixed(1)}% object visibility at ${distance}m; no distance fade masks the stream cutoff`);}
