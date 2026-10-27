import assert from 'node:assert/strict';
import * as T from 'three';
import {UrbanGroundCity} from '../src/UrbanGroundCity.js';
const saved=globalThis.location;globalThis.location={search:''};
try{
 const city=Object.create(UrbanGroundCity.prototype),camera=new T.PerspectiveCamera(),tile={userData:{baseErrorTarget:12,retryAt:1,retries:0},errorTarget:24,resetFailedTiles(){this.resets=(this.resets||0)+1;},update(){},setCamera(){},setResolutionFromRenderer(){}};
 Object.assign(city,{isReady:true,root:new T.Group(),camera,streamCamera:camera.clone(),tilesets:[tile],tileCache:{isFull:()=>false},buildingMeshes:[],collisionWorld:{setActiveMeshes(){},update(){}}});city.refreshBuildingMeshes=()=>{};
 city.lastBudgetCheck=-10000;city.update();assert.equal(tile.resets,1);assert.equal(tile.userData.retries,1);assert(tile.errorTarget<24,'Quality must recover after memory pressure');city.update();assert.equal(tile.resets,1,'Retry repeated without another error');
 tile.userData.retryAt=performance.now()+30000;city.update();assert.equal(tile.resets,1,'Backoff was ignored');
 tile.userData.retryAt=1;tile.userData.retries=5;city.update();assert.equal(tile.resets,1,'Retry limit was ignored');
 city.tileCache.isFull=()=>true;city.lastBudgetCheck=-10000;tile.errorTarget=27.9;city.update();assert.equal(tile.errorTarget,28);
 console.log('PASS Hong Kong rendering: bounded failed-tile retries/backoff, memory pressure quality cap, restored detail after pressure');
}finally{if(saved===undefined)delete globalThis.location;else globalThis.location=saved;}
