// Durations are gameplay time, independent of frame rate or animation assets.
export const AIR_TRICKS = Object.freeze({
  front: { label: '앞구르기', duration: .82, points: 250, x: 1, y: 0, z: 0 },
  back: { label: '뒤구르기', duration: .9, points: 300, x: -1, y: 0, z: 0 },
  left: { label: '왼쪽 옆회전', duration: .78, points: 280, x: 0, y: 0, z: 1 },
  right: { label: '오른쪽 옆회전', duration: .78, points: 280, x: 0, y: 0, z: -1 },
  spin: { label: '360도 회전', duration: .72, points: 220, x: 0, y: 1, z: 0 },
  cork: { label: '코르크스크루', duration: 1.15, points: 450, x: 1, y: 1, z: 0 },
});
export function selectAirTrick(input = {}) {
  if (input.sprint) return 'cork';
  if (input.left) return 'left';
  if (input.right) return 'right';
  if (input.backward) return 'back';
  if (input.forward) return 'spin';
  return 'front';
}
export function trickRotation(key, elapsed) {
  const trick = AIR_TRICKS[key] || AIR_TRICKS.front;
  const t = Math.max(0, Math.min(1, elapsed / trick.duration));
  // Ease into and out of the rotation, returning exactly to the base pose.
  const angle = (t * t * (3 - 2 * t)) * Math.PI * 2;
  return { x: trick.x * angle, y: trick.y * angle, z: trick.z * angle };
}
