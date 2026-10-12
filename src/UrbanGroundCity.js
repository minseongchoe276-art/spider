import * as THREE from 'three';
import {createTileTexturePlugin} from './TileTextures.js';
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
const TILESETS = [
  {
    url: `${TILE_PREFIX}/api/3d-data/3dtiles/f2/tileset.json`,
    reorientation: HONG_KONG_ORIGIN,
  },
  {
    url: `${TILE_PREFIX}/api/3d-data/3dsd/WGS84/building/tileset.json`,
    reorientation: HONG_KONG_ORIGIN,
  },
  {
    url: `${TILE_PREFIX}/api/3d-data/3dsd/WGS84/infrastructure/tileset.json`,
    reorientation: HONG_KONG_ORIGIN,
  },
];


export class UrbanGroundCity {
  constructor(scene, camera, renderer, onProgress) {
    this.isStreamed = true;
    this.playableHalfExtent = 2400;
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.onProgress = onProgress;
    this.tilesets = [];
    this.textureDiagnostics=[];
    // The library default cache is shared globally. Own one cache per city so
    // later layers cannot overwrite an earlier layer's memory budget.
    this.tileCache = new LRUCache();
    this.tileCache.maxSize = 1200;
    this.tileCache.minSize = 600;
    this.tileCache.minBytesSize = 288 * 1024 * 1024;
    this.tileCache.maxBytesSize = 384 * 1024 * 1024;
    this.buildingMeshes = [];
    this.rooftopSpawns = [new THREE.Vector3(0, 18, 0)];
    this.rooftopPoints = this.rooftopSpawns;
    this.lastMeshCount = -1;
    this.loadedRoots = 0;
    this.startedAt = performance.now();
    this.collisionWorld = new StreamedCollision();
    this.playerPosition = new THREE.Vector3(0, 18, 0);
    this.isReady = false;
    this.ktxLoader = new KTX2Loader().setTranscoderPath('/basis/').setWorkerLimit(2);
    this.ktxLoader.detectSupport(renderer);

    // Support comes only from streamed terrain, never an invisible flat floor.
    this.colliders = [];

    this.root = new THREE.Group();
    this.root.name = 'UrbanGroundHongKong';
    this.scene.add(this.root);

    TILESETS.forEach((tileset, index) => this.addTileset(tileset, index));
  }

  addTileset(tilesetConfig, index) {
    const { url, reorientation } = tilesetConfig;
    const tiles = new TilesRenderer(url);
    tiles.errorTarget = index === 0 ? 48 : 32;
    tiles.downloadQueue.maxJobsPerOrigin = 3;
    tiles.parseQueue.maxJobs = 1;
    if (!this.tileCache.unloadPriorityCallback) {
      this.tileCache.unloadPriorityCallback = tiles.lruCache.unloadPriorityCallback;
    }
    tiles.lruCache = this.tileCache;
    const ktxLoader = this.ktxLoader;
    tiles.registerPlugin(new GLTFExtensionsPlugin({ktxLoader,autoDispose:false,plugins:[parser=>createTileTexturePlugin(parser,ktxLoader,this)]}));
    // All three roots carry ECEF transforms; use one shared local origin.
    tiles.registerPlugin(new ReorientationPlugin(reorientation));
    tiles.setCamera(this.camera);
    tiles.setResolutionFromRenderer(this.camera, this.renderer);
    tiles.addEventListener('load-root-tileset', () => {
      this.loadedRoots += 1;
      this.onProgress?.(this.loadedRoots === TILESETS.length ? 70 : 45,
        `홍콩 3D 도시 타일 ${this.loadedRoots}/${TILESETS.length} 준비 중...`);
    });
    tiles.addEventListener('load-error', event => {
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

  update() {
    if (this.disposed) return;
    if (!this.isReady && !this.timeoutReported && performance.now() - this.startedAt > 30000) {
      this.timeoutReported = true;
      this.onError?.(new Error('도시 준비가 지연되고 있습니다. 재시도하거나 로컬 도시로 시작하세요.'));
    }
    this.root.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    for (const tiles of this.tilesets) {
      tiles.setCamera(this.camera);
      tiles.setResolutionFromRenderer(this.camera, this.renderer);
      tiles.update();
    }
    if (performance.now() - (this.lastBudgetCheck || 0) > 2000) {
      this.lastBudgetCheck = performance.now();
      if (this.tilesets[0].lruCache.isFull()) {
        // Prefer a complete coarser district to missing near tiles when
        // mandatory parent textures exhaust the shared cache.
        for (const tiles of this.tilesets) tiles.errorTarget = Math.min(128, tiles.errorTarget * 1.25);
      }
    }
    this.root.updateMatrixWorld(true);
    this.refreshBuildingMeshes();
    this.collisionWorld.setActiveMeshes(this.buildingMeshes);
    this.collisionWorld.update(this.playerPosition);
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
        if (this.startupSurfaceSettled(spawn)) {
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
    const idle = this.loadedRoots === TILESETS.length && this.tilesets.every(t =>
      !t.stats.queued && !t.stats.downloading && !t.stats.parsing) &&
      !this.collisionWorld.pending.length && !this.collisionWorld.job;
    if (!idle || !this.settlingSpawn || this.settlingSpawn.distanceTo(spawn) > 0.1) {
      this.settlingSpawn = spawn.clone();
      this.settlingSince = now;
      return false;
    }
    return now - this.settlingSince >= 600;
  }

  dispose() {
    this.disposed = true;
    for (const tiles of this.tilesets) tiles.dispose();
    this.ktxLoader.dispose();
    this.collisionWorld.dispose();
    this.scene.remove(this.root);
  }

  supportHeight(position) {
    const ground = this.collisionWorld.groundAt(position, 0.4);
    return ground !== null && Math.abs(position.y - ground - 0.1) < 0.2 ? ground : null;
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
