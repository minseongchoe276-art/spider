// Durations are gameplay time, independent of frame rate or animation assets.
export const AIR_TRICKS = Object.freeze({
  front: { label: '공중 앞구르기', duration: .85, points: 300, x: 1, y: 0, z: 0 },
  back: { label: '공중 백플립', duration: .95, points: 300, x: -1, y: 0, z: 0 },
});
export function selectAirTrick() {
  return 'front';
}
export function trickRotation(key, elapsed) {
  const trick = AIR_TRICKS[key] || AIR_TRICKS.front;
  const t = Math.max(0, Math.min(1, elapsed / trick.duration));
  // Ease into and out of the rotation, returning exactly to the base pose.
  const angle = (t * t * (3 - 2 * t)) * Math.PI * 2;
  return { x: trick.x * angle, y: trick.y * angle, z: trick.z * angle };
}
