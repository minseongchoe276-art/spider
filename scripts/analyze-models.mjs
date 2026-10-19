import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

globalThis.self = globalThis;
globalThis.ProgressEvent ||= class { constructor(type, values) { Object.assign(this, values); } };
globalThis.document ||= {
  createElementNS() {
    return {
      addEventListener() {},
      removeEventListener() {},
      set src(v) {}
    };
  }
};
globalThis.window ||= { URL: globalThis.URL };

async function main() {
  const loader = new GLTFLoader();

  function stripTextures(buffer) {
    const raw = Buffer.from(buffer);
    const length = raw.readUInt32LE(12);
    const json = JSON.parse(raw.subarray(20, 20 + length));
    json.buffers[0].uri = `data:application/octet-stream;base64,${raw.subarray(28 + length).toString('base64')}`;
    delete json.images;
    delete json.textures;
    json.materials = [];
    json.meshes?.forEach(mesh => mesh.primitives?.forEach(part => delete part.material));
    return JSON.stringify(json);
  }

  const gltfSpider = await loader.parseAsync(stripTextures(fs.readFileSync('public/models/shadow-pulse-rig.glb')), '');
  const gltfSentinel = await loader.parseAsync(stripTextures(fs.readFileSync('artifacts/Meshy_AI_Violet_Sentinel_1019034929_texture.glb')), '');

  console.log('--- SHADOW PULSE ---');
  let spiderMesh = null;
  const spiderBones = [];
  gltfSpider.scene.traverse(node => {
    if (node.isBone) spiderBones.push(node);
    if (node.isMesh) spiderMesh = node;
  });
  console.log('Bones count:', spiderBones.length);
  spiderMesh.geometry.computeBoundingBox();
  console.log('Spider bbox min:', spiderMesh.geometry.boundingBox.min);
  console.log('Spider bbox max:', spiderMesh.geometry.boundingBox.max);

  console.log('--- Sentinel ---');
  let sentinelMesh = null;
  gltfSentinel.scene.traverse(node => {
    if (node.isMesh) sentinelMesh = node;
  });
  sentinelMesh.geometry.computeBoundingBox();
  console.log('Sentinel bbox min:', sentinelMesh.geometry.boundingBox.min);
  console.log('Sentinel bbox max:', sentinelMesh.geometry.boundingBox.max);

  gltfSpider.scene.updateMatrixWorld(true);
  console.log('--- Key Bones World Positions ---');
  gltfSpider.scene.traverse(node => {
    if (node.isBone) {
      const pos = new THREE.Vector3();
      node.getWorldPosition(pos);
      if (/Hips|Head|Hand|Foot|Arm|Leg|Spine/i.test(node.name) && !/ring|pinky|middle|index|thumb/i.test(node.name)) {
        console.log(node.name, pos.x.toFixed(3), pos.y.toFixed(3), pos.z.toFixed(3));
      }
    }
  });

  console.log('--- SHADOW PULSE Y slices ---');
  const spiderPos = spiderMesh.geometry.attributes.position;
  for (let slice = 0; slice <= 2.0; slice += 0.2) {
    let minX = Infinity, maxX = -Infinity, count = 0;
    for (let i = 0; i < spiderPos.count; i++) {
      const y = spiderPos.getY(i);
      if (Math.abs(y - slice) < 0.05) {
        count++;
        const x = spiderPos.getX(i);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    if (count > 0) {
      console.log(`Spider Y=${slice.toFixed(2)}: count=${count}, X range: [${minX.toFixed(3)}, ${maxX.toFixed(3)}], width: ${(maxX - minX).toFixed(3)}`);
    }
  }

  // Anatomical checks on Sentinel
  console.log('--- Sentinel Key Landmarks ---');
  const sentinelPos = sentinelMesh.geometry.attributes.position;
  // 1. Min/Max Y
  let minY = Infinity, maxY = -Infinity;
  for(let i=0; i<sentinelPos.count; i++) {
    const y = sentinelPos.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  console.log('minY:', minY, 'maxY:', maxY, 'height:', maxY - minY);

  // 2. Let's look at the arms: for points with x > 0.2
  const leftArmPts = [];
  for(let i=0; i<sentinelPos.count; i++) {
    const x = sentinelPos.getX(i), y = sentinelPos.getY(i), z = sentinelPos.getZ(i);
    if (x > 0.18) leftArmPts.push(new THREE.Vector3(x, y, z));
  }
  leftArmPts.sort((a,b) => b.x - a.x);
  console.log('Max X points (outer arm/hand):', leftArmPts.slice(0, 3));
  leftArmPts.sort((a,b) => a.y - b.y);
  console.log('Lowest Y in arm (fingertips):', leftArmPts.slice(0, 3));
  leftArmPts.sort((a,b) => b.y - a.y);
  console.log('Highest Y in arm (shoulder):', leftArmPts.slice(0, 3));

  // 3. Head top
  const headPts = [];
  for(let i=0; i<sentinelPos.count; i++) {
    const x = sentinelPos.getX(i), y = sentinelPos.getY(i), z = sentinelPos.getZ(i);
    if (y > maxY - 0.1) headPts.push(new THREE.Vector3(x, y, z));
  }
  headPts.sort((a,b) => b.y - a.y);
  console.log('Head top:', headPts.slice(0, 3));

  // 4. Feet
  const feetPts = [];
  for(let i=0; i<sentinelPos.count; i++) {
    const x = sentinelPos.getX(i), y = sentinelPos.getY(i), z = sentinelPos.getZ(i);
    if (y < minY + 0.05) feetPts.push(new THREE.Vector3(x, y, z));
  }
  feetPts.sort((a,b) => a.y - b.y);
  console.log('Lowest feet:', feetPts.slice(0, 3));
}

await main();
