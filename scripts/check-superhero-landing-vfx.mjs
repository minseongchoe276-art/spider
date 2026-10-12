import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VFXManager } from '../src/VFX.js';

const scene = new THREE.Scene();
const vfx = new VFXManager(scene);

const landingPos = new THREE.Vector3(10, 0, 15);
const flatNormal = new THREE.Vector3(0, 1, 0);

// Test 1: Low impact / walking / small hop (impact = 6) -> No shockwave, no decal
vfx.spawnLandingShockwave(landingPos, 6, flatNormal);
vfx.update(1 / 60);
assert(vfx.ringPool.every(r => !r.active), 'Low impact should not trigger shockwave ring');
assert(vfx.glowRingPool.every(g => !g.active), 'Low impact should not trigger secondary glow ring');
assert(vfx.decalPool.every(d => !d.active), 'Low impact should not trigger ground crack decal');
assert(vfx.conePool.every(c => !c.active), 'Low impact should not trigger blast cone');

// Clean up
vfx.update(3.0);

// Test 2: Medium impact (impact = 14) -> Moderate shockwave and dust, no crack decal
vfx.spawnLandingShockwave(landingPos, 14, flatNormal);
vfx.update(1 / 60);
assert(vfx.ringPool.some(r => r.active), 'Medium impact should trigger primary shockwave ring');
assert(vfx.decalPool.every(d => !d.active), 'Medium impact should not trigger crack decal');
assert(vfx.sizes.some(s => s > 0), 'Medium impact should spawn dust particles');
assert([...vfx.positions].every(Number.isFinite), 'All particle positions must be finite');

// Clean up
vfx.update(3.0);
assert(vfx.ringPool.every(r => !r.active), 'Rings must deactivate after lifetime');
assert(vfx.particles.every(p => !p.active), 'Particles must deactivate after lifetime');

// Test 3: High impact superhero landing (impact = 35) on a sloped surface
const slopeNormal = new THREE.Vector3(0.3, 0.954, 0).normalize();
vfx.spawnLandingShockwave(landingPos, 35, slopeNormal);
vfx.update(1 / 60);

// 3.1 Primary and secondary rings active
const activeRing = vfx.ringPool.find(r => r.active);
assert(activeRing, 'Superhero landing must trigger primary shockwave ring');
const activeGlow = vfx.glowRingPool.find(g => g.active);
assert(activeGlow, 'Superhero landing must trigger secondary compression ring');

// 3.2 Decal active
const activeDecal = vfx.decalPool.find(d => d.active);
assert(activeDecal, 'Superhero landing must trigger ground crack decal');

// 3.3 Normal alignment verification
const ringNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(activeRing.mesh.quaternion);
assert(Math.abs(ringNormal.dot(slopeNormal) - 1.0) < 0.01, 'Ring must align with surface normal');

const decalNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(activeDecal.mesh.quaternion);
assert(Math.abs(decalNormal.dot(slopeNormal) - 1.0) < 0.01, 'Ground crack decal must align with surface normal');

// 3.4 Dust and sparks presence
assert(vfx.kinds.some(k => k === 1), 'Dust particles must be present');
assert(vfx.kinds.some(k => k === 2), 'Debris / sparks must be present on strong landing');

// 3.5 Expansion over time
const initialScale = activeRing.mesh.scale.x;
vfx.update(0.1);
assert(activeRing.mesh.scale.x > initialScale, 'Ring scale must expand over time');

// 3.6 Full decay after completion
vfx.update(4.0);
assert(vfx.ringPool.every(r => !r.active), 'All rings must be inactive');
assert(vfx.glowRingPool.every(g => !g.active), 'All glow rings must be inactive');
assert(vfx.decalPool.every(d => !d.active), 'All decals must be inactive');
assert(vfx.particles.every(p => !p.active), 'All particles must be inactive');
assert([...vfx.positions].every(Number.isFinite), 'All particle positions must remain finite');

// Test 4: Object pooling reuse stress test (no memory leaks or exceptions across repeated triggers)
for (let i = 0; i < 20; i++) {
  vfx.spawnLandingShockwave(new THREE.Vector3(i, 0, i), 10 + i * 2, flatNormal);
  vfx.update(0.05);
}
vfx.update(5.0);
assert(vfx.ringPool.every(r => !r.active));
assert(vfx.decalPool.every(d => !d.active));
assert(vfx.particles.every(p => !p.active));

console.log('PASS: Superhero landing VFX (impact scaling, surface normal alignment, shockwave rings, crack decals, dust/sparks, object pooling)');
