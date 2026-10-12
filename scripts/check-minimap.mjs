import assert from 'node:assert/strict';
import { isInsideMinimap, worldToHongKongCoordinates, worldToMinimap } from '../src/Minimap.js';

const center = { x: 100, z: -50 };
assert.deepEqual(worldToMinimap(center, center, 600, 100), { x: 100, y: 100 });
assert.deepEqual(worldToMinimap({ x: 700, z: -50 }, center, 600, 100), { x: 0, y: 100 });
assert.deepEqual(worldToMinimap({ x: 100, z: 550 }, center, 600, 100), { x: 100, y: 0 });
assert.deepEqual(worldToMinimap(center, center, 600, 95, 100), { x: 100, y: 100 });
assert.equal(isInsideMinimap({ x: 700, z: -50 }, center, 600), true);
assert.equal(isInsideMinimap({ x: 701, z: -50 }, center, 600), false);
const origin = worldToHongKongCoordinates({ x: 0, z: 0 });
assert.equal(origin.latitude, 22.2799955);
assert.equal(origin.longitude, 114.165495);
assert.ok(worldToHongKongCoordinates({ x: 100, z: 100 }).longitude < origin.longitude);
assert.ok(worldToHongKongCoordinates({ x: 100, z: 100 }).latitude > origin.latitude);
console.log('Minimap projection checks passed.');
