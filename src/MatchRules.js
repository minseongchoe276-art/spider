// Shared cops-and-runners rules. The server hit check and the client spawn
// placement both read this object so the two sides cannot drift apart.
export const MATCH = {
  minPlayers: 2,
  maxPlayers: 8,
  durationMs: 5 * 60 * 1000,
  // Runners can leave the roof before the first web connects.
  graceMs: 8000,
  punch: { damage: 25, reach: 2.6, vertical: 2.2, cone: 0.65, cooldown: 560 },
  web: { damage: 15, reach: 22, vertical: 8, cone: 0.84, cooldown: 1600 },
};

export const policeCount = players => players >= 7 ? 2 : 1;

// Police stand on the -Z side of the anchor and runners on the +Z side,
// farther apart than a web shot. Free play spreads around a circle.
export function teamOffset(index, team, count) {
  const column = index - (Math.max(count, 1) - 1) / 2;
  if (team === 'police') return { x: column * 4, z: -28 };
  if (team === 'runner') return { x: column * 4, z: 28 };
  const angle = (index / Math.max(count, 1)) * Math.PI * 2;
  return { x: Math.cos(angle) * 10, z: Math.sin(angle) * 10 };
}

// Keep the offset when that roof still supports it. Otherwise take another
// recorded roof on the same side, and only then fall back to the anchor.
export function resolveMatchSpawn(anchor, offset, supportHeight, roofs = []) {
  for (const scale of [1, 0.65, 0.4, 0.2]) {
    const x = anchor.x + offset.x * scale;
    const z = anchor.z + offset.z * scale;
    const height = supportHeight({ x, y: anchor.y, z });
    if (Number.isFinite(height) && Math.abs(height + 0.1 - anchor.y) < 0.75) {
      return { x, y: height + 0.1, z };
    }
  }
  const side = Math.sign(offset.z || offset.x || 1);
  let best = null;
  let bestScore = Infinity;
  for (const roof of roofs) {
    if(!roof || ![roof.x,roof.y,roof.z].every(Number.isFinite))continue;
    const height=supportHeight(roof);
    if(!Number.isFinite(height) || Math.abs(height+.1-roof.y)>=.75)continue;
    const dx = roof.x - anchor.x;
    const dz = roof.z - anchor.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 8) continue;
    const score = Math.abs(distance - 28) + (Math.sign(dz || dx) === side ? 0 : 40);
    if (score < bestScore) { bestScore = score; best = {x:roof.x,y:height+.1,z:roof.z}; }
  }
  if (best) return { x: best.x, y: best.y, z: best.z };
  return { x: anchor.x, y: anchor.y, z: anchor.z };
}
