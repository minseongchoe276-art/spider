# Web / VFX / downloaded wall climb validation

2026-10-11

- `npm test`: passed. Includes motion retargeting, 63 real-rig pose/contact
  cases across 30/60/144 FPS, controller/gameplay, independent web attachment,
  traversal, 34 QA regression scenarios and 11 second-review scenarios.
- `node scripts/check-web-vfx.mjs`: passed. Checks launch endpoints,
  curved tube/fiber finite buffers, far-city coordinates, zero-length webs,
  particle size, opacity and pool expiry.
- `npm run build`: passed; existing bundle size warning remains.
- Browser: downloaded Climb Wall plays as a 2.08s take, replacing Idle;
  wall runtime and both visible web strands inspected. Effects fixture uses
  Kenney textures and rendered without a new particle shader compile error.
- Inspection URLs: `/?motionReview` and `/?effectsReview`.

Existing earlier browser logs include Hong Kong tile/blob texture warnings;
these do not establish a release-ready status for the whole game.
