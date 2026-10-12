import * as THREE from 'three';

const BOX = new THREE.Box3();
const MAX_STREAMED_FOOTPRINTS = 420;
const EARTH_RADIUS = 6378137;
const HONG_KONG_ORIGIN = { latitude: 22.2799955, longitude: 114.165495 };

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
  constructor({ canvas, status, coordinates, rangeLabel, title, subtitle, city, combat }) {
    Object.assign(this, { canvas, status, coordinates, rangeLabel, title, subtitle, city, combat });
    this.context = canvas?.getContext('2d');
    this.range = city?.isStreamed ? 600 : 240;
    this.footprints = [];
    this.lastFootprintUpdate = -Infinity;
    this.lastDraw = -Infinity;
    this.resize();
    if (!city?.isStreamed) {
      if (this.title) this.title.textContent = 'LOCAL CITY';
      if (this.subtitle) this.subtitle.textContent = 'PROCEDURAL DISTRICT';
    }
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (!this.canvas || !this.context) return;
    const size = Math.max(120, Math.round(this.canvas.getBoundingClientRect().width || 220));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(size * dpr);
    this.canvas.height = Math.round(size * dpr);
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.size = size;
  }

  update(position, facingAngle, nowSeconds = 0) {
    if (!this.context || !position) return;
    if (nowSeconds - this.lastFootprintUpdate >= 0.6) {
      this.footprints = this.collectFootprints(position);
      this.lastFootprintUpdate = nowSeconds;
    }
    if (nowSeconds - this.lastDraw < 1 / 20) return;
    this.lastDraw = nowSeconds;
    this.draw(position, facingAngle);
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
