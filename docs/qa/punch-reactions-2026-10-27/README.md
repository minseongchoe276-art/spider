# Punching and impact reactions — 2026-10-27

Combat right-click continues through `CombatSystem.straight` / `cross`, using the supplied `Punching.fbx` without mirroring or the old compact straight-body rewrite. Its contact phase is 0.54 of the 0.82-second action (0.443 seconds), inside the 0.42–0.52-second damage window. The authored recovery returns to guard. Walking and sprinting keep their locomotion carrier.

Downloaded from the signed-in Mixamo animation browser, FBX Binary, Without Skin, 30 FPS, no keyframe reduction:

- `Light Hit To Head.fbx`: ordinary head recoil (`hitHead`).
- `Hit To Body.fbx`: body recoil (`hitBody`).
- `Big Hit To Head.fbx`: strong straight head recoil (`hitHeavy`).

Selection uses explicit `hitRegion` when available, otherwise damage under 16 selects body, ordinary damage selects head, and damage 24 or above selects the heavy reaction. This is animation selection, not anatomical hitbox detection. Multiplayer server-confirmed unblocked hits invoke the same reaction without modifying authoritative health. Blocked or eliminated hits do not start a reaction. Airborne characters keep their airborne animation. Authored reactions skip the old additive procedural spine/head recoil.

Validation completed:

- `node scripts/build-motions.mjs`: 36 retargeted motions.
- `node scripts/check-combat.mjs`: 11 combat scenarios.
- `node scripts/check-combat-quality.mjs`: 24 quality cases, including 24/60/144 FPS and moving punches.
- `node scripts/check-combat-feet.mjs`: 45 continuous + 75 held foot/recovery cases.
- `node scripts/check-imported-punch-reactions.mjs`: supplied asset SHA-256, contact window, 12 actual Character.update motion/recovery scenarios, server hit routing, guard and airborne exclusions. Measurements in `results.json`.
- `node scripts/check-remote-motion.mjs`: remote rig and transport regressions.
- `node scripts/check-online-motion-sync.mjs`: 56 independent remote rigs and explicit clip phase checks.
- `npm run build`: production build passes (existing large chunk warning).
- Browser visual inspection of the actual character: Punching contact and all three recoil poses. Review at `/scripts/review-combat.html`.

Online checks use simulated remote rigs and packets; they do not represent a live multi-device network playtest.
