# Moving combat and hanging jump verification

Verified in Chrome against the local Vite game on 2026-10-19.

- Real GameApp, procedural city, real input handlers and render loop: hanging jump passed in first and third person. Both live ropes detached, vertical velocity became 26 m/s, and the player rose approximately 11.96 m before falling.
- Real GameApp running attacks passed in first and third person: jab and cross both executed while moving more than 7 m, followed by a return to idle.
- Combat feet: 45 continuous and 75 held/return-to-guard cases passed at 24/60/144 FPS.
- Combat quality and traversal regressions passed, including running/sprinting punches, damage timing, anatomical joint limits, first person and web/flip exclusions.
- Actual uploaded combat geometry: six running/sprinting jab, cross and power-cross cases passed. Maximum wrist bend was approximately 12 degrees. The triangle edge growth check catches sleeve spikes, including defects that skeleton-only checks cannot see.
- Both appearances passed normalized weight, texture/source identity, view switching and all 34 motion skinning checks (170 samples per appearance).
- Input lifecycle and mechanics audits passed. Production build passed.

Existing unrelated failure: `check-web-hand-pose.mjs` reports four right first-person hand-size failures. Its base model measures 0.322238 m along one bounding-box axis against a 0.3 m threshold. The same reproduction with the pre-change Character implementation has exactly the same dimensions; see `existing-web-hand-size.json`. The other 37 web-hand cases passed. This test uses the base model rather than the swapped combat appearance.

The game verification details are in `game-results.json`; geometry measurements are in `skin-results.json`. Images show the game jump results and close-up running/sprinting attacks.
