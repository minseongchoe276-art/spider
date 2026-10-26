import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

globalThis.ProgressEvent ||= class { constructor(type, values) { Object.assign(this, values); } };

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

async function run() {
  const gltfSpider = await new GLTFLoader().parseAsync(stripTextures(fs.readFileSync('public/models/shadow-pulse-rig.glb')), '');
  const gltfSentinel = await new GLTFLoader().parseAsync(stripTextures(fs.readFileSync('artifacts/사람모습.glb')), '');

  let sMesh, mMesh;
  gltfSpider.scene.traverse(n => { if (n.isMesh) sMesh = n; });
  gltfSentinel.scene.traverse(n => { if (n.isMesh) mMesh = n; });

  gltfSpider.scene.updateMatrixWorld(true);
  const sBones = {};
  gltfSpider.scene.traverse(n => { if (n.isBone) sBones[n.name] = n.getWorldPosition(new THREE.Vector3()); });

  const sPos = sMesh.geometry.attributes.position;
  const sJoints = sMesh.geometry.attributes.skinIndex;
  const sWeights = sMesh.geometry.attributes.skinWeight;

  const mPos = mMesh.geometry.attributes.position;
  const mNorm = mMesh.geometry.attributes.normal;

  console.log(`Spider vertices: ${sPos.count}, Sentinel vertices: ${mPos.count}`);

  const scaleY = (2.0442 - (-0.0084)) / (0.9472 - (-0.9513));
  const offsetY = 0.9513;

  // Arm rotation setup
  const pLShoulder = new THREE.Vector3(0.195, 1.60, -0.05);
  const pLElbow = new THREE.Vector3(0.280, 1.25, -0.06);
  const pLWrist = new THREE.Vector3(0.340, 0.95, 0.01);

  const vLArmCurr = new THREE.Vector3().subVectors(pLElbow, pLShoulder).normalize();
  const vLArmTgt = new THREE.Vector3().subVectors(sBones.mixamorigLeftForeArm, sBones.mixamorigLeftArm).normalize();
  const qLArm = new THREE.Quaternion().setFromUnitVectors(vLArmCurr, vLArmTgt);

  const vLForeCurr = new THREE.Vector3().subVectors(pLWrist, pLElbow).normalize();
  const vLForeTgt = new THREE.Vector3().subVectors(sBones.mixamorigLeftHand, sBones.mixamorigLeftForeArm).normalize();
  const qLFore = new THREE.Quaternion().setFromUnitVectors(vLForeCurr, vLForeTgt);

  // Right arm rotation setup (mirror of left)
  const pRShoulder = new THREE.Vector3(-0.195, 1.60, -0.05);
  const pRElbow = new THREE.Vector3(-0.280, 1.25, -0.06);
  const pRWrist = new THREE.Vector3(-0.340, 0.95, 0.01);

  const vRArmCurr = new THREE.Vector3().subVectors(pRElbow, pRShoulder).normalize();
  const vRArmTgt = new THREE.Vector3().subVectors(sBones.mixamorigRightForeArm, sBones.mixamorigRightArm).normalize();
  const qRArm = new THREE.Quaternion().setFromUnitVectors(vRArmCurr, vRArmTgt);

  const vRForeCurr = new THREE.Vector3().subVectors(pRWrist, pRElbow).normalize();
  const vRForeTgt = new THREE.Vector3().subVectors(sBones.mixamorigRightHand, sBones.mixamorigRightForeArm).normalize();
  const qRFore = new THREE.Quaternion().setFromUnitVectors(vRForeCurr, vRForeTgt);

  // Function to pose a sentinel vertex into SHADOW PULSE rest pose space
  function transformSentinelVertex(x, y, z) {
    let p = new THREE.Vector3(x, (y + offsetY) * scaleY, z);

    // Check if vertex belongs to left arm
    if (p.x > 0.18 && p.y > 0.75 && p.y < 1.75) {
      const distFromTorso = p.x - 0.18;
      // Blend weight at shoulder
      const shoulderBlend = THREE.MathUtils.clamp((p.x - 0.18) / 0.08, 0, 1);

      if (p.y < 1.25) {
        // Forearm & hand: rotate around elbow, then around shoulder
        let local = p.clone().sub(pLElbow);
        local.applyQuaternion(qLFore);
        let elbowRotated = pLElbow.clone().sub(pLShoulder).applyQuaternion(qLArm).add(pLShoulder);
        p = local.add(elbowRotated);
      } else {
        // Upper arm: rotate around shoulder
        let local = p.clone().sub(pLShoulder);
        local.applyQuaternion(qLArm);
        p = pLShoulder.clone().add(local);
      }
    } else if (p.x < -0.18 && p.y > 0.75 && p.y < 1.75) {
      // Right arm
      if (p.y < 1.25) {
        let local = p.clone().sub(pRElbow);
        local.applyQuaternion(qRFore);
        let elbowRotated = pRElbow.clone().sub(pRShoulder).applyQuaternion(qRArm).add(pRShoulder);
        p = local.add(elbowRotated);
      } else {
        let local = p.clone().sub(pRShoulder);
        local.applyQuaternion(qRArm);
        p = pRShoulder.clone().add(local);
      }
    }
    return p;
  }

  // Pre-transform all Sentinel vertices
  console.log('Transforming Sentinel vertices into rest pose space...');
  const transformedSentinel = new Float32Array(mPos.count * 3);
  for (let i = 0; i < mPos.count; i++) {
    const tp = transformSentinelVertex(mPos.getX(i), mPos.getY(i), mPos.getZ(i));
    transformedSentinel[i * 3 + 0] = tp.x;
    transformedSentinel[i * 3 + 1] = tp.y;
    transformedSentinel[i * 3 + 2] = tp.z;
  }

  // Build spatial partitioning (grid) for SHADOW PULSE vertices
  console.log('Building spatial grid for SHADOW PULSE vertices...');
  const cellSize = 0.05; // 5cm cells
  const grid = new Map();
  function cellKey(cx, cy, cz) { return `${cx},${cy},${cz}`; }

  for (let i = 0; i < sPos.count; i++) {
    const sx = sPos.getX(i), sy = sPos.getY(i), sz = sPos.getZ(i);
    const cx = Math.floor(sx / cellSize);
    const cy = Math.floor(sy / cellSize);
    const cz = Math.floor(sz / cellSize);
    const key = cellKey(cx, cy, cz);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  }

  // Function to find K nearest neighbors in SHADOW PULSE
  function findKNN(x, y, z, K = 4) {
    const cx = Math.floor(x / cellSize);
    const cy = Math.floor(y / cellSize);
    const cz = Math.floor(z / cellSize);

    let candidates = [];
    for (let r = 0; r <= 3; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dz = -r; dz <= r; dz++) {
            if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
            const cell = grid.get(cellKey(cx + dx, cy + dy, cz + dz));
            if (cell) {
              for (const idx of cell) {
                // Must be on the same lateral side (left vs right) if not near center
                const sx = sPos.getX(idx);
                if (Math.abs(x) > 0.05 && (x * sx < -0.001)) continue;
                const distSq = (x - sx) ** 2 + (y - sPos.getY(idx)) ** 2 + (z - sPos.getZ(idx)) ** 2;
                candidates.push({ idx, dist: Math.sqrt(distSq) });
              }
            }
          }
        }
      }
      if (candidates.length >= K && r >= 1) break;
    }

    if (candidates.length < K) {
      // Fallback: search all
      for (let i = 0; i < sPos.count; i++) {
        const sx = sPos.getX(i);
        if (Math.abs(x) > 0.05 && (x * sx < -0.001)) continue;
        const distSq = (x - sx) ** 2 + (y - sPos.getY(i)) ** 2 + (z - sPos.getZ(i)) ** 2;
        candidates.push({ idx: i, dist: Math.sqrt(distSq) });
      }
    }

    candidates.sort((a, b) => a.dist - b.dist);
    return candidates.slice(0, K);
  }

  // Test weight transfer for sample vertices
  console.log('Testing KNN weight transfer...');
  const newJoints = new Uint8Array(mPos.count * 4);
  const newWeights = new Float32Array(mPos.count * 4);

  let maxNeighborDist = 0;
  for (let i = 0; i < mPos.count; i++) {
    const tx = transformedSentinel[i * 3 + 0];
    const ty = transformedSentinel[i * 3 + 1];
    const tz = transformedSentinel[i * 3 + 2];

    const knn = findKNN(tx, ty, tz, 4);
    if (knn[0].dist > maxNeighborDist) maxNeighborDist = knn[0].dist;

    // Accumulate weights per bone
    const boneWeightMap = new Map();
    let totalInvDist = 0;
    for (const { idx, dist } of knn) {
      const invDist = 1 / (dist + 1e-4);
      totalInvDist += invDist;
      for (let k = 0; k < 4; k++) {
        const j = sJoints.getComponent(idx, k);
        const w = sWeights.getComponent(idx, k);
        if (w > 0) {
          boneWeightMap.set(j, (boneWeightMap.get(j) || 0) + w * invDist);
        }
      }
    }

    // Sort by weight and pick top 4
    const sortedBones = Array.from(boneWeightMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
    let sumWeight = 0;
    for (const [j, w] of sortedBones) sumWeight += w;

    for (let k = 0; k < 4; k++) {
      if (k < sortedBones.length && sumWeight > 0) {
        newJoints[i * 4 + k] = sortedBones[k][0];
        newWeights[i * 4 + k] = sortedBones[k][1] / sumWeight;
      } else {
        newJoints[i * 4 + k] = 0;
        newWeights[i * 4 + k] = 0;
      }
    }
  }

  console.log(`Max nearest neighbor distance: ${(maxNeighborDist * 100).toFixed(2)} cm`);
  console.log('Weight transfer completed successfully!');

  // Check boot vertices clearance
  // Joint 3 is LeftFoot, 4 is LeftToeBase, 5 is LeftToe_End
  // Joint 8 is RightFoot, 9 is RightToeBase, 10 is RightToe_End
  let minLeftSole = Infinity, maxLeftSoleGap = -Infinity;
  let minRightSole = Infinity, maxRightSoleGap = -Infinity;
  let leftFootVertCount = 0, rightFootVertCount = 0;

  for (let i = 0; i < mPos.count; i++) {
    const y = transformedSentinel[i * 3 + 1];
    let leftWeight = 0, rightWeight = 0;
    for (let k = 0; k < 4; k++) {
      const j = newJoints[i * 4 + k];
      const w = newWeights[i * 4 + k];
      if (j === 3 || j === 4 || j === 5) leftWeight += w;
      if (j === 8 || j === 9 || j === 10) rightWeight += w;
    }
    if (leftWeight > 0.5) {
      leftFootVertCount++;
      if (y < minLeftSole) minLeftSole = y;
      if (y < 0.05 && y > maxLeftSoleGap) maxLeftSoleGap = y;
    }
    if (rightWeight > 0.5) {
      rightFootVertCount++;
      if (y < minRightSole) minRightSole = y;
      if (y < 0.05 && y > maxRightSoleGap) maxRightSoleGap = y;
    }
  }

  console.log(`Left foot vertices (>0.5 weight): ${leftFootVertCount}, minSole: ${minLeftSole.toFixed(4)}m`);
  console.log(`Right foot vertices (>0.5 weight): ${rightFootVertCount}, minSole: ${minRightSole.toFixed(4)}m`);
}

await run();
