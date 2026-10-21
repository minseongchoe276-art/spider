# Wall head posture and facade clearance — 2026-10-21

The climbing pelvis lean previously propagated through the neck, directing the head down toward the facade. The torso and neck now counter that lean so the head looks toward the next holds. A measured skin-envelope pass keeps the helmet, neck and torso outside the facade before limb contact IK runs.

Validation uses every head/neck/torso-dominant mesh vertex (not a point at the head bone), then checks that planted hands and feet remain within 25mm of their holds. Cases cover 24/60/144fps, all four facade orientations, acquisition, upward travel, diagonal travel, stopping and reversal. Cached runtime surface samples remain small; exhaustive vertex scans are confined to QA.

`before.log` reproduces the downward head direction on the previous committed source. `results.json` records the corrected gaze, skin clearance and hold accuracy. `review.html` renders the actual Character.update implementation from the side at full-body and helmet scale.

Commands:
```
node scripts/check-wall-head-clearance.mjs
node scripts/check-natural-wall-motion.mjs
node scripts/check-expanded-terrain-motion.mjs
npm run build
```

Related stair regressions: changed floor heights now release through the regular bounded contact solve; the 10cm render offset eases away at takeoff rather than disappearing in one frame.
