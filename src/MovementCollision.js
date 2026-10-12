import * as THREE from 'three';

// Conservative upright body volume: feet are position.y - 0.1. Sweep the
// entire segment rather than testing only the final frame's position.
export function sweepBody(start, end, colliders, radius = 0.7, height = 1.8) {
  const movement = end.clone().sub(start);
  let closest = null;
  for (const box of colliders || []) {
    const min = [box.minX - radius, box.minY - height, box.minZ - radius];
    const max = [box.maxX + radius, box.maxY + 0.1, box.maxZ + radius];
    let near = -Infinity, far = Infinity, axis = -1, sign = 0;
    let missed = false;
    for (let a = 0; a < 3; a++) {
      const p = start.getComponent(a), d = movement.getComponent(a);
      if (Math.abs(d) < 1e-10) {
        // Tangent contact with a roof or wall must permit sliding.
        if (p <= min[a] + 1e-7 || p >= max[a] - 1e-7) { missed = true; break; }
      } else {
        const t1 = (min[a] - p) / d, t2 = (max[a] - p) / d;
        const entry = Math.min(t1, t2);
        if (entry > near) { near = entry; axis = a; sign = d > 0 ? -1 : 1; }
        far = Math.min(far, Math.max(t1, t2));
        if (near > far) { missed = true; break; }
      }
    }
    if (missed || near < -1e-7 || near > 1 || far < 0 || axis < 0) continue;
    const normal = new THREE.Vector3().setComponent(axis, sign);
    if (!closest || near < closest.time) closest = { time: Math.max(0, near), normal, building: box };
  }
  return closest;
}

export function resolveBody(start, desired, velocity, colliders) {
  const position = start.clone();
  let remaining = desired.clone().sub(start);
  const contacts = [];
  for (let i = 0; i < 5 && remaining.lengthSq() > 1e-12; i++) {
    const hit = sweepBody(position, position.clone().add(remaining), colliders);
    if (!hit) { position.add(remaining); break; }
    position.addScaledVector(remaining, hit.time);
    contacts.push(hit);
    const into = velocity.dot(hit.normal);
    if (into < 0) velocity.addScaledVector(hit.normal, -into);
    remaining.multiplyScalar(1 - hit.time);
    const inward = remaining.dot(hit.normal);
    if (inward < 0) remaining.addScaledVector(hit.normal, -inward);
  }
  return { position, contacts };
}
