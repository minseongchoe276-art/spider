# Wall crawl revision — 2026-10-21

Changed the procedural wall gait in `src/CharacterPose.js`:
- Opposite hand/foot pairing, overlapping support intervals.
- Lower foot recovery and a less seated pelvis; subtle shoulder/pelvis counter-rotation.
- Damped steering around the facade normal, including complete direction reversal.
- Preserve entry blending during the repeated fingertip IK passes.

Validation commands:
```
node scripts/check-wall-cross-crawl.mjs
node scripts/check-natural-wall-motion.mjs
node scripts/check-wall-crawl.mjs
node scripts/check-wall-ledge-rig.mjs
npm run build
```

`review.html` runs the actual Character.update implementation with outside, side, and inside views. It supports both appearances, diagonal travel, and stationary holds. `after.png` records the final human appearance.
