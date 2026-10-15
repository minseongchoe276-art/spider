import * as THREE from 'three';
import {LOCAL_CITY} from './LocalCityLayout.js';

// Procedural Manhattan-style Open World City Generator
export class City {
  constructor(scene) {
    this.scene = scene;
    // Stable city layout keeps saved personal race times comparable.
    this.randomState = 0x5f3759df;
    this.playableHalfExtent = LOCAL_CITY.playableHalfExtent;
    this.buildings = []; // Array of { mesh, box, height, center, type }
    this.buildingMeshes = []; // Meshes for Three.js raycasting
    this.colliders = []; // AABB boxes for fast collision
    this.rooftopSpawns = []; // Ideal spawn points for player on rooftops
    this.beaconLights = []; // Blinking rooftop antenna beacons

    // Texture noise must never change authoritative building/collision layout.
    const layoutSeed=this.randomState;
    this.initTextures();
    this.randomState=layoutSeed;
    this.initMaterials();
    this.generateCity();
    this.createStreetsAndGround();
  }

  random() {
    let value = this.randomState += 0x6D2B79F5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  }

  initTextures() {
    // Generate procedural window grid and road textures on canvas
    this.windowGlassTex = this.createWindowTexture('#6c97b3', '#8ab5cf', '#fff0c2', 0.25);
    this.windowBrickTex = this.createWindowTexture('#c1947e', '#d3ad97', '#ffe9ce', 0.35);
    this.windowDarkTex = this.createWindowTexture('#6b8197', '#91a5b7', '#a8edff', 0.15);
    this.roadTex = this.createRoadTexture();
  }

  createWindowTexture(baseColor, frameColor, lightColor, litRatio) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 256, 512);

    const cols = 8;
    const rows = 16;
    const padX = 6;
    const padY = 6;
    const w = (256 - padX * (cols + 1)) / cols;
    const h = (512 - padY * (rows + 1)) / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = padX + c * (w + padX);
        const y = padY + r * (h + padY);

        const isLit = this.random() < litRatio;
        ctx.fillStyle = isLit ? lightColor : frameColor;
        ctx.fillRect(x, y, w, h);

        if (isLit) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.fillRect(x + 2, y + 2, w - 4, 3);
        }
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  createRoadTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Daylight asphalt keeps street edges readable in building shadows.
    ctx.fillStyle = '#707982';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle asphalt noise
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = this.random() > 0.5 ? '#87919b' : '#616a73';
      ctx.fillRect(this.random() * 512, this.random() * 512, 2, 2);
    }

    // Yellow double center line
    ctx.fillStyle = '#ffb703';
    ctx.fillRect(252, 0, 3, 512);
    ctx.fillRect(257, 0, 3, 512);

    // White dashed lane markers
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    for (let y = 10; y < 512; y += 48) {
      ctx.fillRect(128, y, 4, 24);
      ctx.fillRect(380, y, 4, 24);
    }

    // Pedestrian crosswalks at ends
    for (let x = 30; x < 482; x += 32) {
      ctx.fillRect(x, 15, 18, 50);
      ctx.fillRect(x, 447, 18, 50);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  initMaterials() {
    this.matGlass = new THREE.MeshStandardMaterial({
      map: this.windowGlassTex,
      roughness: 0.4,
      metalness: 0.25,
      color: 0xc0d7eb
    });

    this.matBrick = new THREE.MeshStandardMaterial({
      map: this.windowBrickTex,
      roughness: 0.8,
      metalness: 0.1,
      color: 0xe0b9a1
    });

    this.matDark = new THREE.MeshStandardMaterial({
      map: this.windowDarkTex,
      roughness: 0.3,
      metalness: 0.2,
      color: 0xb0bcc9
    });

    this.matConcrete = new THREE.MeshStandardMaterial({
      color: 0xa5afb9,
      roughness: 0.85,
      metalness: 0.1
    });

    this.matRoof = new THREE.MeshStandardMaterial({
      color: 0x919ca7,
      roughness: 0.9,
      metalness: 0.05
    });

    this.matMetal = new THREE.MeshStandardMaterial({
      color: 0x778899,
      roughness: 0.4,
      metalness: 0.8
    });

    this.matWood = new THREE.MeshStandardMaterial({
      color: 0x8b5a2b,
      roughness: 0.9,
      metalness: 0.05
    });

    this.matBeacon = new THREE.MeshBasicMaterial({
      color: 0xff1122
    });
  }

  generateCity() {
    const gridRows = LOCAL_CITY.rows;
    const gridCols = LOCAL_CITY.columns;
    const blockSize = LOCAL_CITY.blockSize;
    const streetWidth = LOCAL_CITY.streetWidth;
    const step = blockSize + streetWidth;
    const halfWidth = (gridCols * step) / 2;

    const cityGroup = new THREE.Group();
    cityGroup.name = 'CityBlocks';

    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        const x = -halfWidth + c * step + step / 2;
        const z = -halfWidth + r * step + step / 2;

        // Skyscraper height distribution: taller near center, varied across city
        const distFromCenter = Math.hypot(c - gridCols / 2 + 0.5, r - gridRows / 2 + 0.5);
        const centerFactor = Math.max(0, 1 - distFromCenter / 2.8);
        const baseHeight = 45 + centerFactor * 70 + this.random() * 40;
        const height = Math.min(160, Math.max(45, baseHeight));

        const buildingType = (r * 3 + c) % 4; // 0: Glass, 1: Deco Setback, 2: Dark Cyber, 3: Brick Classic
        this.createBuilding(cityGroup, x, z, blockSize, height, buildingType);
      }
    }

    this.scene.add(cityGroup);
  }

  createBuilding(parentGroup, x, z, size, height, type) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    let mainMat = this.matGlass;
    if (type === 1) mainMat = this.matConcrete;
    else if (type === 2) mainMat = this.matDark;
    else if (type === 3) mainMat = this.matBrick;

    // Texture tiling based on height
    const matInstance = mainMat.clone();
    if (matInstance.map) {
      matInstance.map = matInstance.map.clone();
      matInstance.map.repeat.set(Math.round(size / 10), Math.round(height / 12));
      matInstance.map.needsUpdate = true;
    }

    let bMesh;
    if (type === 1 && height > 90) {
      // Art-Deco Setback tower: 3 tiers!
      bMesh = this.createSetbackTower(size, height, matInstance);
    } else {
      // Standard monolithic skyscraper
      const geom = new THREE.BoxGeometry(size, height, size);
      bMesh = new THREE.Mesh(geom, [matInstance,matInstance,this.matRoof,this.matConcrete,matInstance,matInstance]);
      bMesh.position.y = height / 2;
      bMesh.castShadow = true;
      bMesh.receiveShadow = true;
    }

    bMesh.userData = { isBuilding: true, height: height, x: x, z: z };
    group.add(bMesh);

    // Rooftop elements: Parapets, AC chillers, Water Tower, Antenna, Helipad
    this.addRooftopDetails(group, bMesh.isGroup ? size * 0.5 : size, height, type);

    parentGroup.add(group);

    // Save bounding box and raycast mesh
    group.updateWorldMatrix(true,true);
    group.traverse(part => {
      if (!part.isMesh) return;
      const box = new THREE.Box3().setFromObject(part);
      // Painted helipad planes are decoration; equipment and parapets are solid.
      if (box.max.y - box.min.y < 0.1) return;
      this.colliders.push({box, minX:box.min.x,maxX:box.max.x,
        minZ:box.min.z,maxZ:box.max.z,minY:box.min.y,maxY:box.max.y,
        center:box.getCenter(new THREE.Vector3()),height:box.max.y-box.min.y});
    });

    this.buildings.push({
      mesh: bMesh,
      x: x,
      z: z,
      size: size,
      height: height,
      topY: height
    });

    this.buildingMeshes.push(group);

    // Add rooftop spawn point
    if (height > 60) {
      // Find a clear body volume and camera boom, rather than spawning inside HVAC.
      const roofSize = bMesh.isGroup ? size * 0.5 : size;
      for (const [fx,fz] of [[0.3,0],[0,0.3],[-0.3,0],[0,-0.3],[0.3,-0.3],[-0.3,0.3]]) {
        const spawn = new THREE.Vector3(x+roofSize*fx,height+0.1,z+roofSize*fz);
        const support = this.colliders.find(c => Math.abs(c.maxY-height)<0.05 &&
          spawn.x>c.minX+0.7 && spawn.x<c.maxX-0.7 && spawn.z>c.minZ+0.7 && spawn.z<c.maxZ-0.7);
        if (!support) continue;
        spawn.y = support.maxY + 0.1;
        const blocked = this.colliders.some(c => c.maxY > height+0.2 && c.minY < height+1.9 &&
          spawn.x+0.7>c.minX && spawn.x-0.7<c.maxX && spawn.z+0.7>c.minZ && spawn.z-0.7<c.maxZ);
        const eye = spawn.clone().add(new THREE.Vector3(0,1.7,0));
        const boom = new THREE.Vector3(0,1.3,-7).normalize();
        if (!blocked && !this.raycast(eye,boom,7.2)) {
          this.rooftopSpawns.push(spawn);
          break;
        }
      }
    }
  }

  createSetbackTower(size, height, mat) {
    const group = new THREE.Group();
    const h1 = height * 0.55;
    const h2 = height * 0.30;
    const h3 = height * 0.15;

    const s1 = size;
    const s2 = size * 0.75;
    const s3 = size * 0.50;

    // Tier 1
    const g1 = new THREE.BoxGeometry(s1, h1, s1);
    const surfaceMaterials = [mat,mat,this.matRoof,this.matConcrete,mat,mat];
    const m1 = new THREE.Mesh(g1, surfaceMaterials);
    m1.position.y = h1 / 2;
    m1.castShadow = true;
    m1.receiveShadow = true;
    group.add(m1);

    // Tier 2
    const g2 = new THREE.BoxGeometry(s2, h2, s2);
    const m2 = new THREE.Mesh(g2, surfaceMaterials);
    m2.position.y = h1 + h2 / 2;
    m2.castShadow = true;
    m2.receiveShadow = true;
    group.add(m2);

    // Tier 3
    const g3 = new THREE.BoxGeometry(s3, h3, s3);
    const m3 = new THREE.Mesh(g3, surfaceMaterials);
    m3.position.y = h1 + h2 + h3 / 2;
    m3.castShadow = true;
    m3.receiveShadow = true;
    group.add(m3);

    return group;
  }

  addRooftopDetails(group, size, height, type) {
    const topY = height;

    // 1. Parapet wall around roof
    const wallH = 1.2;
    const wallThick = 0.8;
    const wallGeom = new THREE.BoxGeometry(size, wallH, wallThick);
    const p1 = new THREE.Mesh(wallGeom, this.matRoof);
    p1.position.set(0, topY + wallH / 2, size / 2 - wallThick / 2);
    const p2 = p1.clone();
    p2.position.z = -size / 2 + wallThick / 2;
    const wallGeomSide = new THREE.BoxGeometry(wallThick, wallH, size - wallThick * 2);
    const p3 = new THREE.Mesh(wallGeomSide, this.matRoof);
    p3.position.set(size / 2 - wallThick / 2, topY + wallH / 2, 0);
    const p4 = p3.clone();
    p4.position.x = -size / 2 + wallThick / 2;
    group.add(p1, p2, p3, p4);

    // 2. Rooftop Doorhouse / Penthouse access
    const shedW = size * 0.22;
    const shedH = 3.2;
    const shedD = size * 0.22;
    const shedGeom = new THREE.BoxGeometry(shedW, shedH, shedD);
    const shed = new THREE.Mesh(shedGeom, this.matConcrete);
    shed.position.set(-size * 0.25, topY + shedH / 2, -size * 0.25);
    group.add(shed);

    // 3. HVAC Units
    const acCount = 1 + Math.floor(this.random() * 3);
    for (let i = 0; i < acCount; i++) {
      const acW = 3 + this.random() * 3;
      const acH = 2.2;
      const acD = 3 + this.random() * 2;
      const acGeom = new THREE.BoxGeometry(acW, acH, acD);
      const ac = new THREE.Mesh(acGeom, this.matMetal);
      ac.position.set(
        (this.random() - 0.5) * (size * 0.5),
        topY + acH / 2,
        (this.random() - 0.5) * (size * 0.5)
      );
      group.add(ac);
    }

    // 4. Iconic Water Tower on Brick or Classic Buildings
    if (type === 3 || (type === 0 && this.random() > 0.6)) {
      this.createWaterTower(group, size, topY);
    }

    // 5. Tall Broadcast Antenna with Beacon Light on highest towers
    if (height > 100) {
      const antH = 18 + this.random() * 20;
      const antGeom = new THREE.CylinderGeometry(0.15, 0.6, antH, 8);
      const ant = new THREE.Mesh(antGeom, this.matMetal);
      ant.position.set(0, topY + antH / 2, 0);
      group.add(ant);

      // Flashing red warning beacon
      const beaconGeom = new THREE.SphereGeometry(0.7, 8, 8);
      const beacon = new THREE.Mesh(beaconGeom, this.matBeacon.clone());
      beacon.position.set(0, topY + antH, 0);
      group.add(beacon);
      this.beaconLights.push(beacon);
    }

    // 6. Helipad on large modern towers
    if (type === 0 && size >= 45 && height < 150 && this.random() > 0.5) {
      this.createHelipad(group, size, topY);
    }
  }

  createWaterTower(group, size, topY) {
    const wtGroup = new THREE.Group();
    const posX = size * 0.25;
    const posZ = size * 0.25;

    // Steel leg frame
    const legH = 5.0;
    const legGeom = new THREE.CylinderGeometry(0.12, 0.12, legH, 6);
    const legPositions = [
      [-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]
    ];
    legPositions.forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeom, this.matMetal);
      leg.position.set(lx, legH / 2, lz);
      wtGroup.add(leg);
    });

    // Wooden tank barrel
    const tankH = 4.5;
    const tankR = 2.4;
    const tankGeom = new THREE.CylinderGeometry(tankR, tankR, tankH, 16);
    const tank = new THREE.Mesh(tankGeom, this.matWood);
    tank.position.set(0, legH + tankH / 2, 0);
    wtGroup.add(tank);

    // Conical roof
    const roofH = 1.8;
    const roofGeom = new THREE.ConeGeometry(tankR + 0.2, roofH, 16);
    const roof = new THREE.Mesh(roofGeom, this.matMetal);
    roof.position.set(0, legH + tankH + roofH / 2, 0);
    wtGroup.add(roof);

    wtGroup.position.set(posX, topY, posZ);
    group.add(wtGroup);
  }

  createHelipad(group, size, topY) {
    const padCanvas = document.createElement('canvas');
    padCanvas.width = 256;
    padCanvas.height = 256;
    const ctx = padCanvas.getContext('2d');

    ctx.fillStyle = '#22262c';
    ctx.fillRect(0, 0, 256, 256);

    // Yellow outer circle
    ctx.strokeStyle = '#ffd000';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(128, 128, 100, 0, Math.PI * 2);
    ctx.stroke();

    // Big Bold "H"
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 120px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('H', 128, 128);

    const padTex = new THREE.CanvasTexture(padCanvas);
    const padMat = new THREE.MeshBasicMaterial({ map: padTex });
    const padGeom = new THREE.PlaneGeometry(16, 16);
    const padMesh = new THREE.Mesh(padGeom, padMat);
    padMesh.rotation.x = -Math.PI / 2;
    padMesh.position.set(0, topY + 0.05, 0);
    group.add(padMesh);
  }

  createStreetsAndGround() {
    const totalSize = LOCAL_CITY.groundSize;
    const groundGeom = new THREE.PlaneGeometry(totalSize, totalSize);

    this.roadTex.repeat.set(12, 12);
    const groundMat = new THREE.MeshStandardMaterial({
      map: this.roadTex,
      roughness: 0.9,
      metalness: 0.1
    });

    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    ground.userData = { isGround: true };
    this.scene.add(ground);
    this.groundMesh = ground;
  }

  // Update blinking antenna beacon lights
  update(time) {
    const blink = this.reducedMotion || Math.sin(time * 5) > 0.2;
    const intensity = blink ? 1.0 : 0.05;
    for (let i = 0; i < this.beaconLights.length; i++) {
      this.beaconLights[i].material.color.setRGB(intensity, 0.05, 0.05);
    }
  }

  // Get nearest rooftop spawn point to an ideal height
  getRooftopSpawn(preferredHeight = 90) {
    if (this.rooftopSpawns.length === 0) {
      return new THREE.Vector3(0, 75, 0);
    }
    let best = this.rooftopSpawns[0];
    let bestDiff = Math.abs(best.y - preferredHeight);
    for (const sp of this.rooftopSpawns) {
      const diff = Math.abs(sp.y - preferredHeight);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = sp;
      }
    }
    return best.clone();
  }

  raycast(origin, direction, maxDistance) {
    const ray = new THREE.Ray(origin.clone(), direction.clone().normalize());
    let nearest = null;
    for (const collider of this.colliders) {
      const box = new THREE.Box3(
        new THREE.Vector3(collider.minX, collider.minY, collider.minZ),
        new THREE.Vector3(collider.maxX, collider.maxY, collider.maxZ)
      );
      const point = ray.intersectBox(box, new THREE.Vector3());
      if (!point) continue;
      const distance = origin.distanceTo(point);
      if (distance > maxDistance || (nearest && distance >= nearest.distance)) continue;
      const normal = new THREE.Vector3();
      const epsilon = 1e-4;
      if (Math.abs(point.x - box.min.x) < epsilon) normal.x = -1;
      else if (Math.abs(point.x - box.max.x) < epsilon) normal.x = 1;
      else if (Math.abs(point.y - box.min.y) < epsilon) normal.y = -1;
      else if (Math.abs(point.y - box.max.y) < epsilon) normal.y = 1;
      else if (Math.abs(point.z - box.min.z) < epsilon) normal.z = -1;
      else normal.z = 1;
      nearest = { point, distance, normal, collider, building: collider };
    }
    return nearest;
  }

  // Test collision against city buildings and ground
  checkCollision(pos, radius = 0.5) {
    // Check building AABBs
    for (let i = 0; i < this.colliders.length; i++) {
      const c = this.colliders[i];
      // Quick X/Z bounding reject
      if (
        pos.x + radius < c.minX || pos.x - radius > c.maxX ||
        pos.z + radius < c.minZ || pos.z - radius > c.maxZ ||
        pos.y + radius < c.minY || pos.y - radius > c.maxY
      ) {
        continue;
      }

      // Check rooftop collision (landing on roof)
      if (pos.y >= c.maxY - 1.0 && pos.y <= c.maxY + radius) {
        if (pos.x >= c.minX && pos.x <= c.maxX && pos.z >= c.minZ && pos.z <= c.maxZ) {
          return {
            collided: true,
            normal: new THREE.Vector3(0, 1, 0),
            pen: c.maxY + radius - pos.y,
            isRoof: true,
            roofY: c.maxY
          };
        }
      }

      // Lateral wall collisions: find closest wall
      const distLeft = pos.x - c.minX;
      const distRight = c.maxX - pos.x;
      const distBack = pos.z - c.minZ;
      const distFront = c.maxZ - pos.z;

      const minDist = Math.min(distLeft, distRight, distBack, distFront);
      let normal = new THREE.Vector3();

      if (minDist === distLeft) normal.set(-1, 0, 0);
      else if (minDist === distRight) normal.set(1, 0, 0);
      else if (minDist === distBack) normal.set(0, 0, -1);
      else normal.set(0, 0, 1);

      return {
        collided: true,
        normal: normal,
        pen: radius + minDist,
        isWall: true,
        building: c
      };
    }

    // Ground contact must not hide a simultaneous building-wall collision.
    if (pos.y < radius) return {
      collided:true, normal:new THREE.Vector3(0,1,0),
      pen:radius-pos.y, isGround:true,
    };
    return { collided: false };
  }
}
