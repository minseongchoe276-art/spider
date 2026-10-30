# Combat, mantle and Hong Kong weather — 2026-10-29

Implemented in the existing working tree; no production deployment was performed.

- X switches web/combat mode. Combat mode retains ordinary idle/run until Ctrl is held. F remains guard; T preserves the heavy attack; Z recenters the camera. Existing default Q/X settings migrate to X/Z.
- Q slips left; E slips right in combat mode. Web mode retains aerial E zip. Slips have a 12–82% active damage avoidance window, consume stamina, and cannot be restarted freely. Solo damage and the dedicated room server's shared punch rules respect it. Expired remote poses cannot extend the window. Supabase database authority and deployed multiplayer servers were not changed or live-validated.
- Right mouse selects a faster rear straight or compact right hook with a higher hook probability at close range. Uses freshly downloaded Mixamo Cross Punch and Punching (Hook Punch With The Rear Hand), retargeted to the playable rig. Cross Punch is trimmed to the useful preparation/contact/recovery section; both retain authored source motion and recover to their starting guard. Right Hook was downloaded and compared but rejected because it starts with lowered hands and a wide swing. The initial download hit an expired session; normal Google sign-in restored the existing Adobe account and both selected originals downloaded successfully.
- Mantle foot placement is narrower and knee poles fold outward from the wall rather than sideways. The revised pose passed actual target-rig parapet checks at 30/60/144fps, including foot/knee/pelvis clearance, limb length, grip and transition velocity.
- Every newly loaded Hong Kong tile is checked for invalid indices/coordinates, zero-area triangles, and coincident same-material/UV triangles. Good vertices, textures and transforms are preserved. Existing single photographic layer avoids the independent structural survey overlays. This is not a reconstruction of malformed photogrammetry, a complete territory survey, or a guarantee that every source scan has correct geometry.
- Hong Kong local wall-clock time (UTC+8, 1:1 speed), sun/moon and sky/cloud rendering, night illumination, deterministic changing clear/partly cloudy/overcast/rain/thunderstorm/fog presets, rain streaks, approximate roof shelter grid, and wet standard materials. Baked unlit photo surfaces also darken at night. Weather is simulated, not a live meteorological feed. Half-hour forecast slots blend over 4.5 minutes.

Validation artifacts in this directory:

- `input.log`: 22 input lifecycle cases passed, including keyboard/gamepad/touch ownership and modifier release.
- `touch.log`: touch-control regression checks passed.
- `ledge.log`: actual rig 30/60/144fps parapet clearance passed.
- `ledge-physics.log`: seven wall/ledge scenarios plus four-rate floating point seam recovery passed.
- `combat-rig.log`: real-rig finite joints, planted stance, recovery and reset checks passed.
- `combat-traversal.log`: movement strikes, compact hook elbow bend, retained gait and final ankle constraints passed at 24/60/144fps.
- `rendering.log`, `streaming.log`: tile rendering and ten streaming/collision adapter scenarios passed.
- `browser.json`: real desktop Chrome keyboard X/Ctrl/Q/E, ordinary combat running, both right-click variants, six weather presets and midnight on external streamed Hong Kong geometry. No captured page or shader errors. Staged weather timestamps are explicit test fixtures. Screenshots accompany each state.
- `build.log` / `final-build.log`: production build validation.
- `node scripts/check-combat-weather.mjs`: held stance, solo/remote dodge damage windows, random attack selection, stale-pose rejection, binding migration, corrupt/duplicate triangle cleanup and six weather/day-night states.

No claim of physical mobile validation, live multi-client/server deployment validation, full Hong Kong coverage, or photorealistic replacement assets is made.
