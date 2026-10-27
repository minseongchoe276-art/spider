# Hong Kong ambient citizens

Started 2026-10-27; final validation continued 2026-10-28 (Asia/Seoul).

## Result

`AmbientCitizens` is attached only to the Hong Kong game. It maintains a maximum of ten local ambient residents near the player. They walk, pause, recoil from melee attacks, become frightened, and flee. Nearby residents with a clear line of sight also react; strong player landings can startle the crowd. Civilian hits are isolated from enemy rewards, practice victory, and multiplayer health/score rules.

This is a local ambient population, not shared server-authoritative NPCs or a full city pedestrian simulation. Civilians do not block the player capsule. They stop or steer around sampled buildings, unsupported edges, and steep ground. There is no sidewalk semantic data in the current tile API; placement conservatively uses outdoor, low-elevation, supported walking surfaces.

## Assets

Downloaded directly from the signed-in Mixamo character browser:

- Remy (`Remy.fbx`): casual T-shirt and shorts.
- Megan (`Ch22_nonPBR.fbx`): casual civilian clothes.
- Louise (`Ch07_nonPBR.fbx`): office clothes.

All three use original skin weights and diffuse textures. The source FBXs remain in Downloads. `public/citizens/manifest.json` records their source hashes and geometry/size counts. `npm run build:citizens` rebuilds from `CITIZEN_SOURCE_DIR` (default: the user's Downloads directory).

A new `Terrified` motion was downloaded without skin, saved as `Citizen Startle.fbx`, and trimmed to its first second for the short alarm transition. Idle, walking, running and three impact reactions reuse the project's existing Mixamo sources. Seven clips are baked separately for every body. The measured per-body source gait speeds are stored in the manifest and used to match animation cadence to walking/running displacement. Source compilation requires Python 3 with Pillow; the production build uses the already compiled GLBs.

The compiler resolves duplicate FBX skin helper-bone names without removing their influences, retargets onto the actual animation bones, merges each body to one skinned draw/material, and packs diffuse textures into a padded atlas. It handles the FBX-to-glTF UV origin difference. The three GLBs total 9.28 MiB, versus 131.26 MiB of original character FBXs, excluding reused motion sources.

## Runtime bounds

- Ten actors/skeletons maximum; inactive slots are recycled, not repeatedly allocated.
- Spawn candidates 18–55m away; camera-frustum checks prevent visible spawning.
- Normal retirement beyond 100m outside the view; hard retirement at 160m.
- Ten-Hz movement decisions with render-time position interpolation.
- Pose updates at 30/15/8Hz according to distance; immediate hit/startle states use 30Hz.
- Shared geometry/materials/textures; no extra NPC shadow passes. Offscreen actors retain their simulation but skip skinned drawing and use reduced pose frequency.
- No calls into the player's shared Rapier character controller or streaming-position setter.
- Streamed collision must be ready. Missing, sea-level, unsupported, indoor, isolated canopy/roof islands or steep candidates are rejected. Therefore population may temporarily remain below ten.
- Loading starts after gameplay begins and retries up to three times without blocking game startup.

## Verification

`npm run test:citizens` validates three real skinned rigs and seven motions, deformed vertex bounds, unique bone names, the ten-person cap, one reaction per attack, hurt→startled→flee, no mission rewards, ground/wall avoidance, pause, offscreen spawning, missing terrain, bounded pool reuse, and loading retry. It runs population simulations at 24/60/144 FPS and records CPU timings in `results.json`.

Browser inspection confirmed proper clothing/skin textures and the HURT→FLEE transition. Actual Hong Kong streaming reached ready state with 70 terrain meshes and ten residents; Megan and Louise were inspected on the live map. A canopy placement found during inspection was corrected with a connected six-metre walking lane and surrounding-height checks. The review page exposes the other models, attacks, landing alarms, district relocation, pause and a baseline/citizen benchmark. `browser-fixture-performance.json` records the observed Chrome benchmark: median about 60 FPS in both conditions, citizen CPU P95 about 0.4ms and ten extra draw calls. This is a simple collision fixture; it does not by itself establish Hong Kong streaming FPS.

The existing combat scenarios, dashing-uppercut/online-special regressions and production build pass. The build retains its existing large-chunk warning. No deployment or push is included in this task.

## Final real Hong Kong measurement — 2026-10-28

After tile queues settled to zero and 87 streamed meshes were active, the fixed-camera Chrome benchmark retained 120 frames per condition after 30 warm-up frames. All ten residents were active and drawn. Baseline: median 16.7ms, P95 17.5ms, 122 calls and 139,114 triangles. With citizens: median 16.7ms, P95 17.8ms, resident CPU P95 0.4ms, 132 calls and 603,032 triangles. Recorded in `browser-hong-kong-performance.json`. This is about 60 FPS median on the local browser at pixel ratio 1; other devices/settings and loading conditions require their own measurements.
