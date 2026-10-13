import * as THREE from 'three';

const BOX = new THREE.Box3();
const MAX_STREAMED_FOOTPRINTS = 420;
const EARTH_RADIUS = 6378137;
const HONG_KONG_ORIGIN = { latitude: 22.2799955, longitude: 114.165495 };

// Reuse the city's triangles, including sloping streamed terrain. A tile's
// world bounding box is not a building and must never become a solid tower.
export function collectTerrainMeshes(city, position, range, limit = 900) {
  const roots = city?.buildingMeshes?.length ? city.buildingMeshes
    : [...(city?.collisionWorld?.meshes?.values?.() || [])].map(entry => entry.mesh);
  const found = new Map();
  for (const root of [...roots, city?.groundMesh].filter(Boolean)) {
    root.updateWorldMatrix(true, true);
    root.traverseVisible(mesh => {
      if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
      const size = box.getSize(new THREE.Vector3());
      if (!city?.isStreamed && mesh!==city?.groundMesh && size.x*size.y*size.z<25) return;
      const dx = Math.max(box.min.x-position.x, 0, position.x-box.max.x);
      const dz = Math.max(box.min.z-position.z, 0, position.z-box.max.z);
      if (Math.hypot(dx, dz) > range * 1.5) return;
      found.set(mesh, { mesh, distance: Math.hypot(dx,dz),
        triangles: (mesh.geometry.index?.count || mesh.geometry.attributes.position.count) / 3 });
    });
  }
  let triangles = 0;
  return [...found.values()].sort((a,b) => a.distance-b.distance || b.triangles-a.triangles)
    .filter(entry => { if (triangles + entry.triangles > 350000) return false; triangles += entry.triangles; return true; })
    .slice(0,limit).map(entry => entry.mesh);
}

export function configureTerrainCamera(camera, position, range) {
  camera.left = -range; camera.right = range;
  camera.top = range; camera.bottom = -range;
  camera.near = 1; camera.far = range * 12;
  const focus = new THREE.Vector3(position.x, position.y * 0.55, position.z);
  // An oblique view exposes roofs and two facade sides. The compass below
  // follows the projection instead of falsely labelling screen-up as north.
  camera.position.copy(focus).add(new THREE.Vector3(-range*1.3,range*2.2,-range*1.8));
  camera.lookAt(focus); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
}

export function worldToMinimap(point, center, range, radius, canvasCenter = radius) {
  const scale = radius / Math.max(1, range);
  // ReorientationPlugin uses +X west and +Z north. Flip X for a true
  // north-up map, where east is displayed on the right.
  return { x: canvasCenter - (point.x - center.x) * scale, y: canvasCenter - (point.z - center.z) * scale };
}

export function isInsideMinimap(point, center, range, padding = 0) {
  return Math.hypot(point.x - center.x, point.z - center.z) <= range + padding;
}

export function worldToHongKongCoordinates(position) {
  const latitude = HONG_KONG_ORIGIN.latitude + THREE.MathUtils.radToDeg(position.z / EARTH_RADIUS);
  const longitude = HONG_KONG_ORIGIN.longitude - THREE.MathUtils.radToDeg(
    position.x / (EARTH_RADIUS * Math.cos(THREE.MathUtils.degToRad(HONG_KONG_ORIGIN.latitude)))
  );
  return { latitude, longitude };
}

export class HongKongMinimap {
  constructor({ canvas, status, coordinates, rangeLabel, title, subtitle, city, combat, players }) {
    Object.assign(this, { canvas, status, coordinates, rangeLabel, title, subtitle, city, combat, players });
    this.range = city?.isStreamed ? 220 : 240;
    this.terrainCopies = new Map();
    try { if (canvas) this.initTerrain(); }
    catch (error) { console.warn('3D minimap unavailable; using location map',error); }
    if (!this.renderer) this.context = canvas?.getContext('2d');
    this.footprints = [];
    this.lastFootprintUpdate = -Infinity;
    this.lastDraw = -Infinity;
    this.resize();
    if (!city?.isStreamed) {
      if (this.title) this.title.textContent = 'LOCAL CITY';
      if (this.subtitle) this.subtitle.textContent = 'PROCEDURAL DISTRICT';
    }
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
  }

  initTerrain() {
    this.renderer = new THREE.WebGLRenderer({canvas:this.canvas, antialias:true, alpha:false, powerPreference:'low-power'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setClearColor(0x091722);
    this.mapScene = new THREE.Scene();
    this.mapCamera = new THREE.OrthographicCamera();
    configureTerrainCamera(this.mapCamera,this.city?.playerPosition || new THREE.Vector3(),this.range);
    this.tileCulling = new Map();
    for (const tiles of this.city?.tilesets || []) {
      this.tileCulling.set(tiles,tiles.autoDisableRendererCulling);
      // Multiple selection cameras need per-view mesh culling; otherwise
      // map-only tiles are needlessly drawn in the full-screen main view.
      tiles.autoDisableRendererCulling=false;
      tiles.setCamera(this.mapCamera);
    }
    this.mapScene.add(new THREE.HemisphereLight(0xd5faff,0x17374a,2));
    const sun = new THREE.DirectionalLight(0xffffff,2.4); sun.position.set(-1,3,-2); this.mapScene.add(sun);
    this.terrainMaterial = new THREE.MeshLambertMaterial({color:0x428da0,side:THREE.DoubleSide});
    this.groundMaterial = new THREE.MeshLambertMaterial({color:0x163443,side:THREE.DoubleSide});
    this.clipPlanes = [new THREE.Plane(new THREE.Vector3(1,0,0)),new THREE.Plane(new THREE.Vector3(-1,0,0)),
      new THREE.Plane(new THREE.Vector3(0,0,1)),new THREE.Plane(new THREE.Vector3(0,0,-1))];
    this.renderer.clippingPlanes = this.clipPlanes;
    this.markerGeometry = new THREE.ConeGeometry(this.range * 0.025,this.range * 0.075,4);
    this.markers = new Map();
    this.canvas.dataset.mapMode = 'terrain-3d';
  }

  syncTerrain(position) {
    const active = new Set(collectTerrainMeshes(this.city,position,this.range));
    for (const source of active) {
      let copy = this.terrainCopies.get(source);
      if (!copy) {
        copy = new THREE.Mesh(source.geometry,source===this.city.groundMesh ? this.groundMaterial : this.terrainMaterial);
        copy.matrixAutoUpdate = false;
        this.terrainCopies.set(source,copy); this.mapScene.add(copy);
      }
      copy.matrix.copy(source.matrixWorld); copy.matrixWorldNeedsUpdate = true;
    }
    for (const [source,copy] of this.terrainCopies) if (!active.has(source)) {
      this.mapScene.remove(copy); this.terrainCopies.delete(source);
      // Geometry belongs to the city; disposing it would break the main view.
    }
  }

  drawTerrain(position, facingAngle) {
    configureTerrainCamera(this.mapCamera,position,this.range);
    const origin = new THREE.Vector3(position.x,0,position.z).project(this.mapCamera);
    const north = new THREE.Vector3(position.x,0,position.z+1).project(this.mapCamera).sub(origin);
    const compass = this.canvas.parentElement?.querySelector('.minimap-north');
    if (compass) compass.style.transform = `translateX(-50%) rotate(${Math.atan2(north.x,north.y)}rad)`;
    const r = this.range*1.4;
    this.clipPlanes[0].constant = r-position.x; this.clipPlanes[1].constant = r+position.x;
    this.clipPlanes[2].constant = r-position.z; this.clipPlanes[3].constant = r+position.z;
    const actors = [{id:'self',position,facing:facingAngle,color:0xffffff},
      ...(this.players?.() || []).filter(p => !p.eliminated && p.seen)
        .map(p => ({id:p.id,position:p,facing:p.facing,color:p.rescue?0xff6682:p.team==='police'?0x41d9ff:0xffce67})),
      ...(this.combat?.enemies || []).filter(e => e.health>0)
        .map((e,i) => ({id:`enemy-${i}`,position:e.position,color:0xff536e}))];
    const active = new Set();
    for (const actor of actors) {
      if (!isInsideMinimap(actor.position,position,this.range)) continue;
      active.add(actor.id);
      let marker = this.markers.get(actor.id);
      if (!marker) {
        marker = new THREE.Mesh(this.markerGeometry,new THREE.MeshBasicMaterial({color:actor.color,depthTest:false,depthWrite:false}));
        marker.renderOrder = 10; this.markers.set(actor.id,marker); this.mapScene.add(marker);
      }
      marker.material.color.setHex(actor.color);
      marker.position.set(actor.position.x,actor.position.y+this.range*.04,actor.position.z);
      marker.rotation.set(Math.PI/2,0,-(actor.facing || 0));
    }
    for (const [id,marker] of this.markers) if (!active.has(id)) {
      this.mapScene.remove(marker); marker.material.dispose(); this.markers.delete(id);
    }
    this.renderer.render(this.mapScene,this.mapCamera);
  }

  dispose() {
    window.removeEventListener('resize',this.onResize);
    this.renderer?.dispose(); this.terrainMaterial?.dispose(); this.groundMaterial?.dispose();
    for (const [tiles,culling] of this.tileCulling || []) {
      tiles.deleteCamera(this.mapCamera);tiles.autoDisableRendererCulling=culling;
    }
    this.markerGeometry?.dispose();
    for (const marker of this.markers?.values() || []) marker.material.dispose();
    this.terrainCopies.clear(); this.mapScene?.clear();
  }

  resize() {
    if (!this.canvas || (!this.context && !this.renderer)) return;
    const size = Math.max(120, Math.round(this.canvas.getBoundingClientRect().width || 220));
    if (this.renderer) {
      this.size=size; this.renderer.setSize(size,size,false);
      for (const tiles of this.city?.tilesets || []) tiles.setResolutionFromRenderer(this.mapCamera,this.renderer);
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(size * dpr);
    this.canvas.height = Math.round(size * dpr);
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.size = size;
  }

  update(position, facingAngle, nowSeconds = 0) {
    if ((!this.context && !this.renderer) || !position) return;
    if (nowSeconds - this.lastFootprintUpdate >= 0.6) {
      if (this.renderer) this.syncTerrain(position);
      else this.footprints = this.collectFootprints(position);
      this.lastFootprintUpdate = nowSeconds;
    }
    if (nowSeconds - this.lastDraw < 1 / 20) return;
    this.lastDraw = nowSeconds;
    if (this.renderer) this.drawTerrain(position,facingAngle);
    else this.draw(position, facingAngle);
    this.updateLabels(position);
  }

  collectFootprints(position) {
    if (!this.city?.isStreamed) {
      return (this.city?.buildings || [])
        .filter(building => isInsideMinimap(building, position, this.range, building.size))
        .map(building => ({ minX: building.x - building.size / 2, maxX: building.x + building.size / 2,
          minZ: building.z - building.size / 2, maxZ: building.z + building.size / 2, height: building.height }));
    }
    const entries = [...(this.city?.collisionWorld?.meshes?.values?.() || [])]
      .filter(Boolean).map(entry => entry.mesh);
    const source = entries.length ? entries : (this.city?.buildingMeshes || []);
    const footprints = [];
    for (const mesh of source) {
      if (!mesh?.geometry) continue;
      mesh.updateWorldMatrix(true, false);
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      BOX.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      const width = BOX.max.x - BOX.min.x;
      const depth = BOX.max.z - BOX.min.z;
      const height = BOX.max.y - BOX.min.y;
      if (width < 0.7 || depth < 0.7 || height < 0.8 || width > this.range * 2.4 || depth > this.range * 2.4) continue;
      const point = { x: (BOX.min.x + BOX.max.x) / 2, z: (BOX.min.z + BOX.max.z) / 2 };
      if (!isInsideMinimap(point, position, this.range, Math.max(width, depth))) continue;
      footprints.push({ minX: BOX.min.x, maxX: BOX.max.x, minZ: BOX.min.z, maxZ: BOX.max.z, height,
        distanceSq: (point.x-position.x)**2+(point.z-position.z)**2 });
    }
    // Select after spatial filtering. Sampling the global mesh list first can
    // skip the buildings immediately around the player as tiles stream in.
    footprints.sort((a,b)=>a.distanceSq-b.distanceSq);
    return footprints.slice(0,MAX_STREAMED_FOOTPRINTS);
  }

  draw(position, facingAngle = 0) {
    const ctx = this.context;
    const size = this.size;
    const center = size / 2;
    const radius = center - 5;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath(); ctx.arc(center, center, radius, 0, Math.PI * 2); ctx.clip();
    const gradient = ctx.createRadialGradient(center, center, 8, center, center, radius);
    gradient.addColorStop(0, '#10273a'); gradient.addColorStop(1, '#07111d');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, size, size);
    this.drawGrid(ctx, center, radius);
    const scale = radius / this.range;
    for (const footprint of this.footprints) {
      const topLeft = worldToMinimap({ x: footprint.maxX, z: footprint.maxZ }, position, this.range, radius, center);
      const width = Math.max(1.2, (footprint.maxX - footprint.minX) * scale);
      const height = Math.max(1.2, (footprint.maxZ - footprint.minZ) * scale);
      const shade = THREE.MathUtils.clamp(footprint.height / 180, 0, 1);
      ctx.fillStyle = `rgba(${Math.round(28 + shade * 20)},${Math.round(104 + shade * 74)},${Math.round(126 + shade * 92)},0.72)`;
      ctx.strokeStyle = 'rgba(125,238,255,0.35)'; ctx.lineWidth = 0.7;
      ctx.fillRect(topLeft.x, topLeft.y, width, height); ctx.strokeRect(topLeft.x, topLeft.y, width, height);
    }
    this.drawActors(ctx, position, radius, center);
    this.drawPlayer(ctx, center, facingAngle);
    ctx.restore();
    ctx.strokeStyle = 'rgba(125,238,255,0.82)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(center, center, radius - 1, 0, Math.PI * 2); ctx.stroke();
  }

  drawGrid(ctx, center, radius) {
    ctx.strokeStyle = 'rgba(125,238,255,0.14)'; ctx.lineWidth = 1;
    for (const fraction of [1 / 3, 2 / 3]) {
      ctx.beginPath(); ctx.arc(center, center, radius * fraction, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(center, 0); ctx.lineTo(center, this.size);
    ctx.moveTo(0, center); ctx.lineTo(this.size, center); ctx.stroke();
  }

  drawActors(ctx, position, radius, center) {
    for(const player of this.players?.()||[]){if(!player.seen||player.eliminated||!isInsideMinimap(player,position,this.range))continue;
      const marker=worldToMinimap(player,position,this.range,radius,center);ctx.fillStyle=player.rescue?'#ff6682':player.team==='police'?'#41d9ff':'#ffce67';ctx.beginPath();ctx.arc(marker.x,marker.y,4,0,Math.PI*2);ctx.fill();
      if(player.rescue){ctx.font='bold 10px system-ui';ctx.textAlign='center';ctx.fillText('구조',marker.x,marker.y-7);}
    }

    for (const enemy of this.combat?.enemies || []) {
      if (enemy.health <= 0 || !isInsideMinimap(enemy.position, position, this.range)) continue;
      const marker = worldToMinimap(enemy.position, position, this.range, radius, center);
      ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(marker.x, marker.y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawPlayer(ctx, center, facingAngle) {
    ctx.save(); ctx.translate(center, center); ctx.rotate(-facingAngle);
    ctx.shadowColor = '#24e8ff'; ctx.shadowBlur = 10; ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#24e8ff'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(0, -12); ctx.lineTo(8, 9); ctx.lineTo(0, 5); ctx.lineTo(-8, 9); ctx.closePath();
    ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.fillStyle = '#24e8ff'; ctx.font = '800 10px Outfit, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('나', center, center + 24);
  }

  updateLabels(position) {
    const streamed = Boolean(this.city?.isStreamed);
    if (this.status) {
      const ready = !streamed || this.city?.isReady;
      this.status.textContent = streamed ? (ready ? 'LIVE' : 'LOADING') : 'LOCAL';
      this.status.dataset.ready = String(ready);
    }
    if (this.coordinates) {
      if (streamed) {
        const geo = worldToHongKongCoordinates(position);
        this.coordinates.textContent = `${geo.latitude.toFixed(6)}°N  ${geo.longitude.toFixed(6)}°E  ·  ALT ${Math.round(position.y)}m`;
      } else {
        const east = Math.round(-position.x), north = Math.round(position.z);
        this.coordinates.textContent = `E ${east >= 0 ? '+' : ''}${east}m  N ${north >= 0 ? '+' : ''}${north}m  ·  ALT ${Math.round(position.y)}m`;
      }
    }
    if (this.rangeLabel) this.rangeLabel.textContent = `${this.range}m`;
    this.canvas.setAttribute('aria-label', `현재 위치 동쪽 ${Math.round(-position.x)}미터, 북쪽 ${Math.round(position.z)}미터, 고도 ${Math.round(position.y)}미터`);
  }
}
