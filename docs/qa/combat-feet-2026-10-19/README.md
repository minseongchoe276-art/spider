# Imported rear power cross and grounded boot correction — 2026-10-19

G uses the supplied `Cross Punch.fbx` take with a longer preparation than the ordinary cross. Impact phase 0.56 is synchronized to the 0.62–0.74 second damage window of the 1.2 second action. The first-person arm follows a compact rear straight rather than the previous overhand arc.

Ground contact now calibrates the sole normal from the neutral target rig, flattens pitch/roll against the surface, and retains the authored toe heading. A new floor anchor must be reachable before acquisition, preventing alternating acquire/release corrections. Grounded actors restore the last animation sample before IK so Three.js cached PropertyMixer values cannot accumulate procedural corrections during held samples. Wall/ledge procedural poses retain their existing handoff behavior.

The previous held-jab → G review sequence raised the rear ankle above 0.6 m. `check-combat-feet.mjs` now exercises fixed samples, action switching, source preparation/contact/recovery, standing, running and sprinting at 24/60/144 FPS. Planted soles must stay within 5 degrees of their surface normal; normal airborne/heel pivots are retained. Held feet must settle within 3 mm, without accumulating lift.

## Validation

The staged code tree `0ef6c2f05f5e5f9af946a57992f26a6e2534568d` was exported with `git checkout-index` into an isolated directory, using the existing installed dependencies. Unrelated map, progression and touch-control edits were excluded. The following checks passed there:

- `npm run build` (existing large-chunk warning only)
- `npm run test:combat-quality`: 24 combat quality cases; 45 continuous + 75 held foot cases
- `node scripts/check-combat.mjs`: 11 combat scenarios
- `node scripts/check-combat-rig.mjs`: real-rig contact, recovery, bounds, reset and state transitions
- `node scripts/check-combat-traversal.mjs`: moving strikes and first-person rear crosses
- `node scripts/check-combat-aim.mjs`: shared aim/damage/cooldown behavior
- `node scripts/check-silk-gait.mjs`: 71 cases
- `node scripts/check-wall-ledge-rig.mjs`: 30/60/144 FPS; no parapet penetration
- `node scripts/check-motion-cleanup.mjs`: 26 cases
- `node scripts/check-motion-transitions.mjs`: 3,267 transitions / 77,319 rig frames
- `node scripts/check-all-motions.mjs`: 201 cases
- `node scripts/check-motion-sources.mjs`: 32 files / 44 takes / 5,476 source frames
- `node scripts/check-motion-timeline.mjs`: 33 takes / 99 FPS cases / 15,340 frames

Measured foot results are in `summary.json` and `results.json`. Browser screenshots show G at contact from the side and in first person. The live review page exposes actual ankle heights and sole-normal angles. The complete project-wide `npm test` suite was not run.
