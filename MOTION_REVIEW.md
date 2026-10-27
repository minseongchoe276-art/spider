# SHADOW PULSE motion review — 2026-10-10

## 2026-10-27 fall and landing update

- The former fast-fall pose pitched the body forward, and impact above 7
  automatically entered the forward roll. A near-vertical drop therefore
  looked like a forward tumble on landing.
- Mixamo `Falling Idle` now supplies the upright falling loop, paired with
  `Falling To Landing` for a feet-first recovery. Both were downloaded as FBX
  Binary without skin at 60 FPS and preserved in `public/models/`.
- The traversal sequence is `Jumping Down` (first 0.24 seconds) → `Falling Idle`
  → `Falling To Landing`. A forward roll remains available when horizontal
  travel is at least 4.5 m/s and the path ahead has support and clearance.
- The aerial tricks remain `R` for Stylish Flip (backflip) and `T` for Front
  Flip; each returns to the falling loop before the landing decision.

## 2026-10-26 aerial flip update

- `T` plays the existing Mixamo Front Flip take; `R` plays Mixamo Stylish Flip
  (aerial backflip), downloaded as FBX Binary without skin at 60 FPS.
- Both takes are retargeted to the 65-joint game rig. The controller keeps
  flight momentum authoritative, fades from the aerial pose to the authored
  flip, then resumes falling or landing. The fallback rig retains its
  procedural rotation when a motion asset is unavailable.
- `Stylish Flip.fbx` is preserved in `public/models/`; its shipped animation
  is `public/motions/backTrick.json`.

Latest full inventory and regression review: [2026-10-15 all motions](docs/qa/all-motions-2026-10-15/REPORT.md), including all 39 registered clips, the embedded fallback, two preserved candidates, six procedural tricks, and first-person combat.

## Implemented

- Retarget all 12 FBX motions to the actual GLB skeleton (65 matched joints).
- Normalize Mixamo prefixes, including `mixamorig1`, and bake source world
  rotations into GLB local axes. Preserve pelvis rotation and convert units.
- Account for target A-pose versus source T-pose; do not apply per-joint A-pose
  offsets to animated T-pose rigs, which folded arms into the torso.
- Select a nonempty FBX take. Rope Swinging's first take has no animation.
- Trim jump to its airborne portion, swing to its hanging portion, walking
  stop to its settling portion, and roll to remove the already-completed fall.
- Keep physical translation authoritative. Match gait playback to measured
  source root travel (walk ≈2.07 m/s and run ≈7.00 m/s at original playback).
- Close looping clips, synchronize walk/run phase, and distinguish walk/run
  stops. Idle never selects a walking/running or falling action.
- Smooth shortest-path facing; do not interrupt moving strides with stationary
  turn clips. Left/Right Turn and Jumping Down remain available in the reviewer,
  but are not forced into incompatible gameplay states.
- Reach the active web hand toward the anchor with two-bone arm IK; fix wrist
  selection accidentally choosing fingers. Fix rope draw range and air-flip
  rotation accumulation. Orient wall-running to the wall and exit at the roof.
- Slow ordinary walking to 1.6 m/s, sprint to 6.5 m/s; stop with no held input.
  Consume jump input once; do not zip forward on ground Space. Clear controls
  on pause/blur/reset, and do not immediately reattach after Space release.
- Substep collisions; preserve sprint on contact, only land on descending foot
  crossings, fall off roof edges, and avoid release boosts on landing. Match
  setback tower colliders and rooftop widths to their visible tiers.
- Preserve camera wheel zoom and test the final smoothed camera segment against
  buildings rather than only testing its destination.

## Validation

`npm test` checks all final prepared clips at 60 samples/second, joint matching,
finite tracks, unit quaternions, upright locomotion, and both web-arm IK chains.
Controller regression tests cover idle, repeated walking, sprint, stops, jump,
landing, roof edge departure, fast roof crossing, nonboosted release, 30/60/144
FPS operation, animation transitions, air-flip recovery and camera zoom.

`npm run build` passes. Existing FBX TGA/weight warnings refer to discarded source
meshes, not the SHADOW PULSE GLB's texture. Bundle-size warning remains.

Visual reviewer: http://localhost:5173/?motionReview
It uses the game's actual Character, prepared actions and SwingPhysics. Inspect
each clip, scrub, switch viewpoint, or play the integrated locomotion scenario.

## Limits

This is a corrected, tested animation/controller baseline, not a claim of
photorealistic or universally perfect motion. No terrain foot-plant IK,
full-body contact solver, character-to-prop collision, motion matching or
bespoke character-specific mocap was added. Smooth blends cannot make every generic
Mixamo performance a character-specific performance. Whole-city camera/contact
edge cases still need broader gameplay testing.
