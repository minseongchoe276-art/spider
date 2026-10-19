# SHADOW PULSE motion review — 2026-10-10

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
