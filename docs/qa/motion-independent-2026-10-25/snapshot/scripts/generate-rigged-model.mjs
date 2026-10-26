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

async function buildRiggedModel() {
  console.log('1. Reading input files...');
  const spiderRaw = fs.readFileSync('public/models/shadow-pulse-rig.glb');
  const spiderLen = spiderRaw.readUInt32LE(12);
  const spiderJson = JSON.parse(spiderRaw.subarray(20, 20 + spiderLen));
  const spiderBin = spiderRaw.subarray(20 + spiderLen + 8);

  const sentinelPath = 'artifacts/사람모습.glb';
  const sentinelRaw = fs.readFileSync(sentinelPath);
  const sentinelLen = sentinelRaw.readUInt32LE(12);
  const sentinelJson = JSON.parse(sentinelRaw.subarray(20, 20 + sentinelLen));
  const sentinelBin = sentinelRaw.subarray(20 + sentinelLen + 8);

  // Parse Three.js scenes to inspect bones and transforms
  const gltfSpider = await new GLTFLoader().parseAsync(stripTextures(spiderRaw), '');
  gltfSpider.scene.updateMatrixWorld(true);
  const sBones = {};
  gltfSpider.scene.traverse(n => { if (n.isBone) sBones[n.name] = n.getWorldPosition(new THREE.Vector3()); });

  let sMesh; gltfSpider.scene.traverse(n => { if (n.isMesh) sMesh = n; });
  const sPos = sMesh.geometry.attributes.position;
  const sJoints = sMesh.geometry.attributes.skinIndex;
  const sWeights = sMesh.geometry.attributes.skinWeight;

  // Extract raw buffers from Sentinel
  // Sentinel bufferViews:
  // 0: indices (SCALAR, uint32, 148842 count = 595368 bytes)
  // 1: POSITION (VEC3, float32, 29133 count = 349596 bytes)
  // 2: TEXCOORD_0 (VEC2, float32, 29133 count = 233064 bytes)
  // 3: NORMAL (VEC3, float32, 29133 count = 349596 bytes)
  // 4: image 0
  // 5: image 1
  // 6: image 2
  const vertexCount = sentinelJson.accessors[sentinelJson.meshes[0].primitives[0].attributes.POSITION].count;
  const indexCount = sentinelJson.accessors[sentinelJson.meshes[0].primitives[0].indices].count;

  console.log(`Sentinel vertices: ${vertexCount}, indices: ${indexCount}`);

  function getSentinelBuffer(bvIdx) {
    const bv = sentinelJson.bufferViews[bvIdx];
    return sentinelBin.subarray(bv.byteOffset, bv.byteOffset + bv.byteLength);
  }

  const origIndices = new Uint32Array(getSentinelBuffer(0).buffer, getSentinelBuffer(0).byteOffset, indexCount);
  const origPositions = new Float32Array(getSentinelBuffer(1).buffer, getSentinelBuffer(1).byteOffset, vertexCount * 3);
  const origUVs = new Float32Array(getSentinelBuffer(2).buffer, getSentinelBuffer(2).byteOffset, vertexCount * 2);
  const origNormals = new Float32Array(getSentinelBuffer(3).buffer, getSentinelBuffer(3).byteOffset, vertexCount * 3);

  const img0Data = getSentinelBuffer(4);
  const img1Data = getSentinelBuffer(5);
  const img2Data = getSentinelBuffer(6);

  console.log('Images extracted: 0:', img0Data.length, '1:', img1Data.length, '2:', img2Data.length);

  console.log('2. Computing arm rotations and vertex transformation...');
  const scaleY = (2.0442 - (-0.0084)) / (0.9472 - (-0.9513)); // ~1.0811
  const offsetY = 0.9513;

  // Arm pivots
  const pLShoulder = new THREE.Vector3(0.195, 1.60, -0.05);
  const pLElbow = new THREE.Vector3(0.280, 1.25, -0.06);
  const pLWrist = new THREE.Vector3(0.340, 0.95, 0.01);

  const vLArmCurr = new THREE.Vector3().subVectors(pLElbow, pLShoulder).normalize();
  const vLArmTgt = new THREE.Vector3().subVectors(sBones.mixamorigLeftForeArm, sBones.mixamorigLeftArm).normalize();
  const qLArm = new THREE.Quaternion().setFromUnitVectors(vLArmCurr, vLArmTgt);

  const vLForeCurr = new THREE.Vector3().subVectors(pLWrist, pLElbow).normalize();
  const vLForeTgt = new THREE.Vector3().subVectors(sBones.mixamorigLeftHand, sBones.mixamorigLeftForeArm).normalize();
  const qLFore = new THREE.Quaternion().setFromUnitVectors(vLForeCurr, vLForeTgt);

  // Right arm pivots
  const pRShoulder = new THREE.Vector3(-0.195, 1.60, -0.05);
  const pRElbow = new THREE.Vector3(-0.280, 1.25, -0.06);
  const pRWrist = new THREE.Vector3(-0.340, 0.95, 0.01);

  const vRArmCurr = new THREE.Vector3().subVectors(pRElbow, pRShoulder).normalize();
  const vRArmTgt = new THREE.Vector3().subVectors(sBones.mixamorigRightForeArm, sBones.mixamorigRightArm).normalize();
  const qRArm = new THREE.Quaternion().setFromUnitVectors(vRArmCurr, vRArmTgt);

  const vRForeCurr = new THREE.Vector3().subVectors(pRWrist, pRElbow).normalize();
  const vRForeTgt = new THREE.Vector3().subVectors(sBones.mixamorigRightHand, sBones.mixamorigRightForeArm).normalize();
  const qRFore = new THREE.Quaternion().setFromUnitVectors(vRForeCurr, vRForeTgt);

  const newPositions = new Float32Array(vertexCount * 3);
  const newNormals = new Float32Array(vertexCount * 3);

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (let i = 0; i < vertexCount; i++) {
    const ox = origPositions[i * 3 + 0];
    const oy = origPositions[i * 3 + 1];
    const oz = origPositions[i * 3 + 2];

    const onx = origNormals[i * 3 + 0];
    const ony = origNormals[i * 3 + 1];
    const onz = origNormals[i * 3 + 2];

    let p = new THREE.Vector3(ox, (oy + offsetY) * scaleY, oz);
    let n = new THREE.Vector3(onx, ony, onz);

    if (p.x > 0.18 && p.y > 0.75 && p.y < 1.75) {
      // Left arm
      if (p.y < 1.25) {
        let local = p.clone().sub(pLElbow).applyQuaternion(qLFore);
        let elbowRot = pLElbow.clone().sub(pLShoulder).applyQuaternion(qLArm).add(pLShoulder);
        p = local.add(elbowRot);
        n.applyQuaternion(qLFore).applyQuaternion(qLArm);
      } else {
        let local = p.clone().sub(pLShoulder).applyQuaternion(qLArm);
        p = pLShoulder.clone().add(local);
        n.applyQuaternion(qLArm);
      }
    } else if (p.x < -0.18 && p.y > 0.75 && p.y < 1.75) {
      // Right arm
      if (p.y < 1.25) {
        let local = p.clone().sub(pRElbow).applyQuaternion(qRFore);
        let elbowRot = pRElbow.clone().sub(pRShoulder).applyQuaternion(qRArm).add(pRShoulder);
        p = local.add(elbowRot);
        n.applyQuaternion(qRFore).applyQuaternion(qRArm);
      } else {
        let local = p.clone().sub(pRShoulder).applyQuaternion(qRArm);
        p = pRShoulder.clone().add(local);
        n.applyQuaternion(qRArm);
      }
    }

    n.normalize();

    newPositions[i * 3 + 0] = p.x;
    newPositions[i * 3 + 1] = p.y;
    newPositions[i * 3 + 2] = p.z;

    newNormals[i * 3 + 0] = n.x;
    newNormals[i * 3 + 1] = n.y;
    newNormals[i * 3 + 2] = n.z;

    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
  }

  console.log(`Transformed bounds: X[${minX.toFixed(3)}, ${maxX.toFixed(3)}], Y[${minY.toFixed(3)}, ${maxY.toFixed(3)}], Z[${minZ.toFixed(3)}, ${maxZ.toFixed(3)}]`);

  console.log('3. Transferring skinning weights from SHADOW PULSE using spatial indexing...');
  const cellSize = 0.05;
  const grid = new Map();
  function cellKey(cx, cy, cz) { return `${cx},${cy},${cz}`; }

  for (let i = 0; i < sPos.count; i++) {
    const sx = sPos.getX(i), sy = sPos.getY(i), sz = sPos.getZ(i);
    const key = cellKey(Math.floor(sx / cellSize), Math.floor(sy / cellSize), Math.floor(sz / cellSize));
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  }

  function findKNN(x, y, z, K = 4) {
    const cx = Math.floor(x / cellSize), cy = Math.floor(y / cellSize), cz = Math.floor(z / cellSize);
    let candidates = [];
    for (let r = 0; r <= 3; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dz = -r; dz <= r; dz++) {
            if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
            const cell = grid.get(cellKey(cx + dx, cy + dy, cz + dz));
            if (cell) {
              for (const idx of cell) {
                const sx = sPos.getX(idx);
                if (Math.abs(x) > 0.05 && (x * sx < -0.001)) continue;
                const dSq = (x - sx) ** 2 + (y - sPos.getY(idx)) ** 2 + (z - sPos.getZ(idx)) ** 2;
                candidates.push({ idx, dist: Math.sqrt(dSq) });
              }
            }
          }
        }
      }
      if (candidates.length >= K && r >= 1) break;
    }
    if (candidates.length < K) {
      for (let i = 0; i < sPos.count; i++) {
        const sx = sPos.getX(i);
        if (Math.abs(x) > 0.05 && (x * sx < -0.001)) continue;
        const dSq = (x - sx) ** 2 + (y - sPos.getY(i)) ** 2 + (z - sPos.getZ(i)) ** 2;
        candidates.push({ idx: i, dist: Math.sqrt(dSq) });
      }
    }
    candidates.sort((a, b) => a.dist - b.dist);
    return candidates.slice(0, K);
  }

  const newJoints = new Uint8Array(vertexCount * 4);
  const newWeights = new Float32Array(vertexCount * 4);

  for (let i = 0; i < vertexCount; i++) {
    const tx = newPositions[i * 3 + 0];
    const ty = newPositions[i * 3 + 1];
    const tz = newPositions[i * 3 + 2];

    const knn = findKNN(tx, ty, tz, 4);
    const boneWeightMap = new Map();

    for (const { idx, dist } of knn) {
      const invDist = 1 / (dist + 1e-4);
      for (let k = 0; k < 4; k++) {
        const j = sJoints.getComponent(idx, k);
        const w = sWeights.getComponent(idx, k);
        if (w > 0) {
          boneWeightMap.set(j, (boneWeightMap.get(j) || 0) + w * invDist);
        }
      }
    }

    const sortedBones = Array.from(boneWeightMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
    let sumW = 0;
    for (const [j, w] of sortedBones) sumW += w;

    for (let k = 0; k < 4; k++) {
      if (k < sortedBones.length && sumW > 0) {
        newJoints[i * 4 + k] = sortedBones[k][0];
        newWeights[i * 4 + k] = sortedBones[k][1] / sumW;
      } else {
        newJoints[i * 4 + k] = 0;
        newWeights[i * 4 + k] = 0;
      }
    }
  }

  console.log('4. Packing new binary GLB buffers and bufferViews...');
  // We need to construct:
  // BufferViews:
  // bv 0: POSITION (Float32Array) target: 34962
  // bv 1: NORMAL (Float32Array) target: 34962
  // bv 2: TEXCOORD_0 (Float32Array) target: 34962
  // bv 3: JOINTS_0 (Uint8Array) target: 34962
  // bv 4: WEIGHTS_0 (Float32Array) target: 34962
  // bv 5: indices (Uint32Array) target: 34963
  // bv 6: image 0 (baseColor)
  // bv 7: image 1 (metallicRoughness)
  // bv 8: image 2 (normal map)
  // bv 9: inverseBindMatrices (from SHADOW PULSE bv 7)
  // bv 10..N: animations (from SHADOW PULSE bv 8..end)

  // Align byte offsets to 4-byte boundaries
  function pad4(buf) {
    const pad = (4 - (buf.length % 4)) % 4;
    if (pad === 0) return buf;
    const aligned = Buffer.alloc(buf.length + pad);
    buf.copy(aligned);
    return aligned;
  }

  const bufPos = pad4(Buffer.from(newPositions.buffer, newPositions.byteOffset, newPositions.byteLength));
  const bufNorm = pad4(Buffer.from(newNormals.buffer, newNormals.byteOffset, newNormals.byteLength));
  const bufUV = pad4(Buffer.from(origUVs.buffer, origUVs.byteOffset, origUVs.byteLength));
  const bufJoints = pad4(Buffer.from(newJoints.buffer, newJoints.byteOffset, newJoints.byteLength));
  const bufWeights = pad4(Buffer.from(newWeights.buffer, newWeights.byteOffset, newWeights.byteLength));
  const bufIndices = pad4(Buffer.from(origIndices.buffer, origIndices.byteOffset, origIndices.byteLength));
  const bufImg0 = pad4(Buffer.from(img0Data));
  const bufImg1 = pad4(Buffer.from(img1Data));
  const bufImg2 = pad4(Buffer.from(img2Data));

  // Spider inverseBindMatrices buffer
  const spiderInvBv = spiderJson.bufferViews[7];
  const bufInvBind = pad4(spiderBin.subarray(spiderInvBv.byteOffset, spiderInvBv.byteOffset + spiderInvBv.byteLength));

  // Spider animation buffers (bv 8..end)
  const animBuffers = [];
  const animOldBvStart = 8;
  for (let i = animOldBvStart; i < spiderJson.bufferViews.length; i++) {
    const bv = spiderJson.bufferViews[i];
    animBuffers.push(pad4(spiderBin.subarray(bv.byteOffset, bv.byteOffset + bv.byteLength)));
  }

  const allChunks = [
    bufPos, bufNorm, bufUV, bufJoints, bufWeights, bufIndices,
    bufImg0, bufImg1, bufImg2,
    bufInvBind,
    ...animBuffers
  ];

  const bufferViews = [];
  let currentOffset = 0;
  for (let i = 0; i < allChunks.length; i++) {
    const chunk = allChunks[i];
    const bv = {
      buffer: 0,
      byteOffset: currentOffset,
      byteLength: chunk.length
    };
    if (i <= 4) bv.target = 34962; // ARRAY_BUFFER
    if (i === 5) bv.target = 34963; // ELEMENT_ARRAY_BUFFER
    bufferViews.push(bv);
    currentOffset += chunk.length;
  }

  const totalBinBuffer = Buffer.concat(allChunks);
  console.log(`Total BIN buffer size: ${totalBinBuffer.length} bytes`);

  console.log('5. Constructing glTF JSON schema...');
  // Accessors:
  // 0: POSITION
  // 1: NORMAL
  // 2: TEXCOORD_0
  // 3: JOINTS_0
  // 4: WEIGHTS_0
  // 5: indices
  // 6: inverseBindMatrices
  // 7..M: animation accessors from SHADOW PULSE

  const accessors = [
    {
      bufferView: 0,
      componentType: 5126, // FLOAT
      count: vertexCount,
      type: 'VEC3',
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ]
    },
    {
      bufferView: 1,
      componentType: 5126,
      count: vertexCount,
      type: 'VEC3'
    },
    {
      bufferView: 2,
      componentType: 5126,
      count: vertexCount,
      type: 'VEC2'
    },
    {
      bufferView: 3,
      componentType: 5121, // UNSIGNED_BYTE
      count: vertexCount,
      type: 'VEC4'
    },
    {
      bufferView: 4,
      componentType: 5126,
      count: vertexCount,
      type: 'VEC4'
    },
    {
      bufferView: 5,
      componentType: 5125, // UNSIGNED_INT (uint32)
      count: indexCount,
      type: 'SCALAR'
    },
    {
      bufferView: 9,
      componentType: 5126,
      count: 65,
      type: 'MAT4'
    }
  ];

  // Remap SHADOW PULSE animation accessors (indices 7..end in spiderJson)
  // In spiderJson:
  // acc 0..5 were old mesh attributes
  // acc 6 was invBind
  // acc 7..end were animation samplers
  const oldSpiderBvStart = 8;
  const newAnimBvStart = 10;
  const bvOffset = newAnimBvStart - oldSpiderBvStart;

  for (let i = 7; i < spiderJson.accessors.length; i++) {
    const oldAcc = spiderJson.accessors[i];
    const newAcc = { ...oldAcc };
    newAcc.bufferView = oldAcc.bufferView + bvOffset;
    accessors.push(newAcc);
  }

  // Remap animation samplers
  const animations = [];
  if (spiderJson.animations && spiderJson.animations.length > 0) {
    for (const oldAnim of spiderJson.animations) {
      const newAnim = {
        name: oldAnim.name,
        channels: oldAnim.channels.map(ch => ({ ...ch })),
        samplers: oldAnim.samplers.map(s => ({
          ...s,
          // input and output accessor indices are unchanged because accessors 0..6 match 1-to-1!
        }))
      };
      animations.push(newAnim);
    }
  }

  // Images & Textures from Sentinel
  const images = [
    { mimeType: 'image/jpeg', bufferView: 6 },
    { mimeType: 'image/jpeg', bufferView: 7 },
    { mimeType: 'image/jpeg', bufferView: 8 }
  ];

  const samplers = [
    { magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 },
    { magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 },
    { magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }
  ];

  const textures = [
    { sampler: 0, source: 0 },
    { sampler: 1, source: 1 },
    { sampler: 2, source: 2 }
  ];

  // Material with PBR textures
  const materials = [
    {
      name: 'VioletSentinel_Material',
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        metallicFactor: 1,
        roughnessFactor: 1,
        baseColorTexture: { index: 0, texCoord: 0 },
        metallicRoughnessTexture: { index: 1, texCoord: 0 }
      },
      normalTexture: { index: 2, texCoord: 0 },
      alphaMode: 'OPAQUE',
      doubleSided: true
    }
  ];

  // Meshes
  const meshes = [
    {
      name: 'Mesh',
      primitives: [
        {
          attributes: {
            POSITION: 0,
            NORMAL: 1,
            TEXCOORD_0: 2,
            JOINTS_0: 3,
            WEIGHTS_0: 4
          },
          indices: 5,
          material: 0
        }
      ]
    }
  ];

  // Nodes: exact copy of SHADOW PULSE nodes
  const nodes = spiderJson.nodes.map(n => ({ ...n }));

  // Skins: exact copy of SHADOW PULSE skin, pointing to accessor 6
  const skins = [
    {
      inverseBindMatrices: 6,
      joints: [...spiderJson.skins[0].joints],
      name: 'Armature'
    }
  ];

  const gltfJson = {
    asset: {
      generator: 'Antigravity Model Rigging Pipeline',
      version: '2.0'
    },
    scene: 0,
    scenes: [{ name: 'Scene', nodes: [66] }],
    nodes,
    skins,
    meshes,
    materials,
    textures,
    images,
    samplers,
    accessors,
    bufferViews,
    buffers: [{ byteLength: totalBinBuffer.length }],
    animations
  };

  function padJson(buf) {
    const pad = (4 - (buf.length % 4)) % 4;
    if (pad === 0) return buf;
    const aligned = Buffer.alloc(buf.length + pad, 0x20); // 0x20 space characters per glTF 2.0 spec
    buf.copy(aligned);
    return aligned;
  }

  const jsonString = JSON.stringify(gltfJson);
  const jsonBuffer = padJson(Buffer.from(jsonString, 'utf8'));

  // GLB Header
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 4, 'ascii'); // magic
  header.writeUInt32LE(2, 4); // version 2

  const totalGlbLength = 12 + (8 + jsonBuffer.length) + (8 + totalBinBuffer.length);
  header.writeUInt32LE(totalGlbLength, 8); // total length

  // Chunk 0 (JSON)
  const chunk0Header = Buffer.alloc(8);
  chunk0Header.writeUInt32LE(jsonBuffer.length, 0);
  chunk0Header.write('JSON', 4, 4, 'ascii');

  // Chunk 1 (BIN)
  const chunk1Header = Buffer.alloc(8);
  chunk1Header.writeUInt32LE(totalBinBuffer.length, 0);
  chunk1Header.write('BIN\0', 4, 4, 'ascii');

  const finalGlb = Buffer.concat([
    header,
    chunk0Header,
    jsonBuffer,
    chunk1Header,
    totalBinBuffer
  ]);

  console.log(`6. Writing output GLB: ${finalGlb.length} bytes...`);
  fs.writeFileSync('public/models/shadow-pulse-rig-generated.glb', finalGlb);
  console.log('Saved to public/models/shadow-pulse-rig-generated.glb successfully!');
}

await buildRiggedModel();
