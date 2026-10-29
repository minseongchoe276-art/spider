import * as THREE from 'three';
import {streamingBudget} from './StreamingBudget.js';
import {hongKongRenderingProfile,tuneHongKongTexture,prepareHongKongTile,configureHongKongTiles,configureHongKongFog,nextHongKongError} from './HongKongRendering.js';
import {createTileTexturePlugin} from './TileTextures.js';
import {HongKongDistrict} from './HongKongDistrict.js';
import {scheduleTileRetry,recoverFailedTiles} from './TileRecovery.js';
import {TileRenderPreparation} from './TileRenderPreparation.js';
import {prepareStartDistrict} from './HongKongStartDistrict.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { StreamedCollision } from './StreamedCollision.js';
import { TilesRenderer } from '3d-tiles-renderer/three';
import { LRUCache } from '3d-tiles-renderer/core';
import {
  GLTFExtensionsPlugin,
  ReorientationPlugin,
} from '3d-tiles-renderer/three/plugins';

// Public Hong Kong 3D Tiles used by UrbanGround. The dataset is streamed at
// runtime, so the browser never has to download the whole territory at once.
// Keep tiles same-origin in both Vite dev and preview. The official endpoint
// permits credentials but omits Access-Control-Allow-Origin.
const TILE_PREFIX = '/urban-tiles';
const HONG_KONG_ORIGIN = {
  lat: THREE.MathUtils.degToRad(22.2799955),
  lon: THREE.MathUtils.degToRad(114.165495),
  height: 0,
};
// The photographic mesh already includes buildings, bridges and the ground.
// Overlaying the independent 3dsd building/infrastructure surveys introduces
// intersecting grey walls and duplicate walkways. Render and collide against
// the same photographic exterior instead of keeping invisible solid overlays.
const TILESETS = [
  {
    url: `${TILE_PREFIX}/api/3d-data/3dtiles/f2/tileset.json`,
    reorientation: HONG_KONG_ORIGIN,
  },
];


export class UrbanGroundCity {
  constructor(scene, camera, renderer, onProgress) {
    this.isStreamed = true;
    this.playableHalfExtent = 2400;
    this.scene = scene;
    this.camera = camera;
    // Limit tile requests by quality; the display camera keeps its own range.
    this.streamCamera = camera.clone();
    this.streamCamera.far = camera.far;
    this.streamCamera.updateProjectionMatrix();
    this.renderer = renderer;
    this.tilePreparation = new TileRenderPreparation(renderer,camera,scene);
    this.onProgress = onProgress;
    this.tilesets = [];
    this.textureDiagnostics=[];
    // The library default cache is shared globally. Own one cache per city so
    // later layers cannot overwrite an earlier layer's memory budget.
    this.tileCache = new LRUCache();
    this.setStreamingQuality('balanced');
    this.buildingMeshes = [];
    this.rooftopSpawns = [new THREE.Vector3(0, 18, 0)];
    this.rooftopPoints = this.rooftopSpawns;
    this.lastMeshCount = -1;
    this.loadedRoots = 0;
    this.startedAt = performance.now();
    this.collisionWorld = new StreamedCollision();
    this.playerPosition = new THREE.Vector3(0, 18, 0);
    this.isReady = false;
    this.ktxLoader = new KTX2Loader().setTranscoderPath('/basis/').setWorkerLimit(4);
    this.ktxLoader.detectSupport(renderer);

    // Support comes only from streamed terrain, never an invisible flat floor.
    this.colliders = [];

    this.root = new THREE.Group();
    this.root.name = 'UrbanGroundHongKong';
    this.scene.add(this.root);

    this.district=typeof document==='undefined'?null:new HongKongDistrict(scene);

    TILESETS.forEach((tileset, index) => this.addTileset(tileset, index));
  }

  setStreamingQuality(quality) {
    quality=['low','balanced','high'].includes(quality)?quality:'balanced';
    if(this.quality===quality)return;
    this.quality=quality;
    this.renderingProfile=hongKongRenderingProfile(quality);
    configureHongKongFog(this.scene,this.renderingProfile,this.camera?.far);
    const budget=streamingBudget(quality,{mobile:globalThis.matchMedia?.('(pointer:coarse)').matches||false,memoryGB:globalThis.navigator?.deviceMemory});
    this.tileCache.maxSize=budget.maxTiles;this.tileCache.minSize=budget.minTiles;
    this.tileCache.maxBytesSize=budget.maxBytes;this.tileCache.minBytesSize=budget.minBytes;
    this.streamingBudget=budget;
    for(const tiles of this.tilesets||[]){
      const baseline=this.renderingProfile.errors[tiles.tilesetIndex];
      tiles.userData.baseErrorTarget=baseline;tiles.errorTarget=baseline;
    }
  }

  addTileset(tilesetConfig, index) {
    const { url, reorientation } = tilesetConfig;
    const tiles = new TilesRenderer(url);
    const surfaceType = index === 0 ? 'terrain' : (index === 1 ? 'building' : 'infrastructure');
    tiles.tilesetIndex = index;
    tiles.surfaceType = surfaceType;
    tiles.group.userData.tilesetIndex = index;
    tiles.group.userData.surfaceType = surfaceType;
    // Keep photographic parent coverage while detailed replacements download.
    // Duplicate structural surveys are intentionally not queued for this city.
    configureHongKongTiles(tiles,index,this.renderingProfile);
    tiles.userData = { baseErrorTarget: tiles.errorTarget, retryAt: 0, retries: 0 };
    tiles.downloadQueue.maxJobsPerOrigin = 12;
    tiles.parseQueue.maxJobs = 3;
    if (!this.tileCache.unloadPriorityCallback) {
      this.tileCache.unloadPriorityCallback = tiles.lruCache.unloadPriorityCallback;
    }
    tiles.lruCache = this.tileCache;
    const ktxLoader = this.ktxLoader;
    tiles.registerPlugin(new GLTFExtensionsPlugin({ktxLoader,autoDispose:false,plugins:[parser=>createTileTexturePlugin(parser,ktxLoader,this)]}));
    // The dataset carries ECEF transforms; use the city's local origin.
    tiles.registerPlugin(new ReorientationPlugin(reorientation));
    tiles.registerPlugin({name:'HongKongSurfacePresentation',processTileModel:async (scene,tile)=>{
      prepareHongKongTile(scene,surfaceType,this.renderingProfile,this.renderer.capabilities.getMaxAnisotropy());
      if(surfaceType==='terrain'){
        tiles.group.updateWorldMatrix(true,false);
        prepareStartDistrict(scene,tiles.group.matrixWorld);
      }
      if(this.district)scene.traverse(mesh=>{if(mesh.isMesh)for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])this.district.applySourceMask(material,surfaceType);});
      await this.tilePreparation.prepare(scene,tile);
    },disposeTile:tile=>this.tilePreparation.cancel(tile)});
    tiles.setCamera(this.streamCamera);
    tiles.setResolutionFromRenderer(this.streamCamera, this.renderer);
    tiles.addEventListener('load-root-tileset', () => {
      this.loadedRoots += 1;
      this.onProgress?.(this.loadedRoots === TILESETS.length ? 70 : 45,
        `홍콩 3D 도시 타일 ${this.loadedRoots}/${TILESETS.length} 준비 중...`);
    });
    tiles.addEventListener('load-error', event => {
      scheduleTileRetry(tiles);
      this.lastError = event.error || new Error('도시 데이터를 불러오지 못했습니다.');
      if (!this.isReady) this.onError?.(this.lastError);
      if (new URLSearchParams(location.search).has('debugCity')) {
        let debug = document.getElementById('city-debug');
        if (!debug) {
          debug = document.createElement('pre'); debug.id = 'city-debug';
          debug.style.cssText = 'position:fixed;top:160px;left:10px;max-width:90vw;white-space:pre-wrap;color:white;background:#111;z-index:99';
          document.body.append(debug);
        }
        debug.textContent = `${event.url}\n${event.error?.stack || event.error}`;
      }
      console.warn('UrbanGround tile load failed:', event.url || url, event.error);
    });
    this.tilesets.push(tiles);
    this.root.add(tiles.group);
    // A freshly parsed model is not yet parented into the reoriented group.
    // Build collision only after activation establishes its world transform.
  }

  refreshBuildingMeshes() {
    const meshes = [];
    this.root.traverseVisible(object => {
      if (object.isMesh) {
        if(object.geometry.index?.count===0)return;
        if (!object.userData.surfaceType) {
          let cur = object.parent;
          while (cur && cur !== this.root) {
            if (cur.userData?.surfaceType) {
              object.userData.surfaceType = cur.userData.surfaceType;
              break;
            }
            cur = cur.parent;
          }
          if (!object.userData.surfaceType) object.userData.surfaceType = 'terrain';
        }
        for(const material of Array.isArray(object.material)?object.material:[object.material]){
          tuneHongKongTexture(material.map,this.renderingProfile.anisotropy,this.renderer.capabilities.getMaxAnisotropy());
        }
        meshes.push(object);
        if (!this.collisionWorld.meshes.has(object.uuid) &&
            (!object.userData.collisionCheckedAt ||
             object.userData.collisionCheckedAt.distanceToSquared(this.playerPosition) > 10000)) {
          object.updateWorldMatrix(true, false);
          if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
          const distance = object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld)
            .distanceToPoint(this.playerPosition);
          if (distance < 650) this.collisionWorld.enqueue(object);
          else object.userData.collisionCheckedAt = this.playerPosition.clone();
        }
      }
    });
    this.buildingMeshes = meshes;
    this.lastMeshCount = meshes.length;
  }

  updateStreamingCamera(now = performance.now()) {
    this.streamCamera.copy(this.camera, false);
    this.streamCamera.far = Math.min(this.camera.far, this.renderingProfile?.streamDistance ?? 750);
    if(this.renderingProfile)configureHongKongFog(this.scene,this.renderingProfile,this.streamCamera.far);
    this.streamCamera.updateProjectionMatrix();
    this.streamCamera.updateMatrixWorld(true);
  }

  update() {
    if (this.disposed) return;
    if (!this.isReady && !this.timeoutReported && performance.now() - this.startedAt > 30000) {
      this.timeoutReported = true;
      this.onError?.(new Error('도시 준비가 지연되고 있습니다. 재시도하거나 로컬 도시로 시작하세요.'));
    }
    this.root.updateMatrixWorld(true);
    if(this.isReady&&this.district?.report.treeStatus==='ready'&&this.quality!=='low')this.district.captureReflection(this.renderer);
    this.camera.updateMatrixWorld(true);
    this.updateStreamingCamera();
    for (const tiles of this.tilesets) {
      tiles.setCamera(this.streamCamera);
      tiles.setResolutionFromRenderer(this.streamCamera, this.renderer);
      recoverFailedTiles(tiles);
      tiles.update();
    }
    if (performance.now() - (this.lastBudgetCheck || 0) > 2000) {
      this.lastBudgetCheck = performance.now();
      const pressured = this.tileCache.isFull();
      for (const tiles of this.tilesets) {
        const baseline = tiles.userData?.baseErrorTarget ?? 20;
        // A full photographic cache must not blur unrelated structural layers
        // which already fit. Apply pressure only to a layer refusing requests.
        tiles.errorTarget=nextHongKongError(tiles.errorTarget,baseline,{full:pressured,refused:tiles.stats.refused,
          utilization:Math.max(this.tileCache.cachedBytes/this.tileCache.maxBytesSize,this.tileCache.itemSet.size/this.tileCache.maxSize)});
      }
    }
    this.root.updateMatrixWorld(true);
    // Visibility traversal and bounds checks need not run at render frequency.
    if (performance.now() - (this.lastMeshRefresh || 0) >= 100) {
      this.lastMeshRefresh = performance.now();
      this.refreshBuildingMeshes();
    }
    this.collisionWorld.setActiveMeshes(this.buildingMeshes);
    this.collisionWorld.update(this.playerPosition, this.isReady
      ? undefined : { budgetMs: 8, maxIndices: 24000 });
    if (!this.isReady && this.buildingMeshes.length > 0 && this.collisionWorld.ready) {
      const spawn = this.findWalkableSpawn();
      if (spawn) {
        // Refine from the same viewpoint used at play start. Declaring ready
        // on the first coarse tile can leave the player above a disappearing
        // temporary roof when detailed tiles arrive.
        this.camera.position.copy(spawn).add(new THREE.Vector3(0,3,-7));
        this.camera.lookAt(spawn.clone().add(new THREE.Vector3(0,1.7,0)));
        this.camera.updateMatrixWorld(true);
        this.rooftopSpawns[0].copy(spawn);
        const meshBonus = Math.min(25, Math.round(this.buildingMeshes.length * 0.4));
        this.onProgress?.(Math.min(95, 70 + meshBonus),
          `홍콩 마천루 렌더링 및 지형 안착 중 (${this.buildingMeshes.length}개 건물 완료)...`);
        if (this.startupSurfaceSettled(spawn)) {
          this.readyAt = performance.now();
          this.isReady = true;
          this.onProgress?.(100, '홍콩 도시와 충돌 지형 준비 완료');
        }
      }
    }

    const currentCount = this.buildingMeshes.length;
    if (new URLSearchParams(location.search).has('debugCity') &&
        performance.now() - (this.lastDebugUpdate || 0) > 1000) {
      this.lastDebugUpdate = performance.now();
      let status = document.getElementById('city-stats');
      if (!status) { status = document.createElement('pre'); status.id = 'city-stats';
        status.style.cssText = 'position:fixed;top:250px;left:10px;color:white;background:#111;z-index:99'; document.body.append(status); }
      status.textContent = JSON.stringify({roots:this.loadedRoots, meshes:currentCount,
        collisionMeshes:this.collisionWorld.meshes.size, pending:this.collisionWorld.pending.length,
        ground:this.collisionWorld.groundAt(new THREE.Vector3(0,300,0),400),
        groundHit:this.collisionWorld.lastGroundHit,
        camera:this.camera.position.toArray(), groups:this.tilesets.map(t=>t.group.position.toArray()),
        stats:this.tilesets.map(t=>({...t.stats,bytes:t.lruCache.cachedBytes}))}, null, 1);
    }

  }

  getRooftopSpawn() {
    // LOD may have changed while the player was reading the start menu.
    if (this.isReady) {
      const spawn = this.findWalkableSpawn();
      if (spawn) this.rooftopSpawns[0].copy(spawn);
    }
    return this.rooftopSpawns[0].clone();
  }

  renderingDiagnostics() {
    const layers=this.tilesets.map(t=>({surface:t.surfaceType,errorTarget:t.errorTarget,distantError:t.errorFalloff,loadAncestors:t.loadAncestors,loadSiblings:t.loadSiblings,stats:{...t.stats},meshes:0,shadowCasters:0,materials:{},samples:[]}));
    for(const mesh of this.buildingMeshes){
      const row=layers.find(l=>l.surface===mesh.userData.surfaceType);if(!row)continue;
      row.meshes++;
      if(mesh.castShadow)row.shadowCasters++;
      for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
        const key=`${m.type}:${m.map?'texture':m.vertexColors?'vertex':'plain'}`;row.materials[key]=(row.materials[key]||0)+1;
        if(row.samples.length<4)row.samples.push({type:m.type,color:m.color?.getHexString(),image:m.map?{width:m.map.image?.width,height:m.map.image?.height,anisotropy:m.map.anisotropy,minFilter:m.map.minFilter}:null,normals:!!mesh.geometry.attributes.normal,side:m.side});
      }
    }
    const startSurfaces={meshes:0,triangles:0};
    for(const mesh of this.buildingMeshes)if(mesh.userData.startSurface){
      startSurfaces.meshes++;
      startSurfaces.triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;
    }
    return {district:{...this.district?.report},startSurfaces,layers,cacheBytes:this.tileCache.cachedBytes,budget:this.streamingBudget,textureFailures:this.textureDiagnostics,decodedRGBTextures:this.decodedRGBTextures||0};
  }

  surveySurfaces() {
    const rows=[];
    for(let x=-60;x<=60;x+=20)for(let z=-60;z<=60;z+=20){
      const origin=new THREE.Vector3(this.playerPosition.x+x,this.playerPosition.y+250,this.playerPosition.z+z);
      const hit=this.raycast(origin,new THREE.Vector3(0,-1,0),600);
      rows.push({x:+origin.x.toFixed(2),z:+origin.z.toFixed(2),height:hit?+hit.point.y.toFixed(2):null,normalY:hit?+hit.normal.y.toFixed(3):null,surface:hit?.mesh?.userData.surfaceType||null});
    }
    return rows;
  }

  findWalkableSpawn() {
    // Reject sloped awnings and parapets using the capsule's footprint.
    for (const [x,z] of [[0,0],[2,0],[-2,0],[0,2],[0,-2],[4,4],[-4,4],[4,-4],[-4,-4],[8,0],[0,8]]) {
      const ground = this.collisionWorld.groundAt(new THREE.Vector3(x,300,z),400);
      if (ground === null) continue;
      const supported = [[0.4,0],[-0.4,0],[0,0.4],[0,-0.4]].every(([dx,dz]) => {
        const y=this.collisionWorld.groundAt(new THREE.Vector3(x+dx,ground+0.4,z+dz),1);
        return y!==null && Math.abs(y-ground)<0.25;
      });
      if (supported) return new THREE.Vector3(x,ground+0.15,z);
    }
    return null;
  }

  startupSurfaceSettled(spawn, now = performance.now()) {
    const tilesIdle = this.loadedRoots === TILESETS.length && this.tilesets.every(t =>
      (!t.stats.downloading && !t.stats.parsing && !t.stats.queued) ||
      (t.stats.downloading + t.stats.parsing <= 2 && this.buildingMeshes.length >= 8));
    const physicsSettled = !this.collisionWorld.pending.length && !this.collisionWorld.job;
    const idle = tilesIdle && physicsSettled && this.buildingMeshes.length > 0;
    if (!idle || !this.settlingSpawn || this.settlingSpawn.distanceTo(spawn) > 0.1) {
      this.settlingSpawn = spawn.clone();
      this.settlingSince = now;
      return false;
    }
    return now - this.settlingSince >= 600;
  }

  dispose() {
    this.disposed = true;
    this.tilePreparation.dispose();
    for (const tiles of this.tilesets) tiles.dispose();
    this.ktxLoader.dispose();
    this.district?.dispose();
    this.collisionWorld.dispose();
    this.scene.remove(this.root);
  }

  supportHeight(position) {
    const ground = this.collisionWorld.groundAt(position, 0.4);
    return ground !== null && Math.abs(position.y - ground - 0.1) < 0.2 ? ground : null;
  }

  getCameraCollisionMeshes(position) {
    if(!this.collisionWorld.ready)return this.buildingMeshes;
    // Rapier already queries baked terrain. Only raycast visual triangles
    // for unbaked/rebuilding LODs or outside the collider's coverage margin.
    // This preserves closer new surfaces without scanning every dense tile
    // for each of the camera's five probes and shoulder alternatives.
    return this.buildingMeshes.filter(mesh=>{
      const entry=this.collisionWorld.meshes.get(mesh.uuid);
      return !entry || entry.queued || !entry.coverageCenter || position.distanceToSquared(entry.coverageCenter)>450*450;
    });
  }

  resolveMovement(start, end, velocity) {
    this.playerPosition.copy(start);
    return this.collisionWorld.resolve(start, end, velocity);
  }

  raycast(origin, direction, maxDistance, solid = true) {
    return this.collisionWorld.raycast(origin,direction,maxDistance,solid);
  }

  checkCollision(position) {
    return { collided: false };
  }
}
