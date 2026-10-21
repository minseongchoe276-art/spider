# Moving combat and forward-roll recovery — 2026-10-21

The recovery clip owns the full body: moving guard, strike, gaze, wrist and fist overlays cannot replace a roll or ordinary fall landing. Moving attacks preserve the locomotion pelvis and leg frames, including gait startup below 0.25m/s. Guard gaze limits sideways head tilt.

Fall impacts above the existing small-step threshold select a forward roll on supported, unobstructed ground, including vertical falls. The actual root-motion distance is checked along the whole path. Walls and intermediate support gaps retain a compact landing. Input can leave the roll only after 88% recovery; the character timeline follows physics.

ForwardRoll.js replaces the asymmetric shoulder-roll rotation with a sagittal forward turn and paired leg tuck, then fits the real skin envelope to the support plane. Endpoint limits remain the final authority.

Validation:
- `node scripts/check-combat-roll-recovery.mjs`
- `node scripts/check-combat-feet.mjs`
- `node scripts/check-combat-quality.mjs`
- `node scripts/check-combat-traversal.mjs`
- `node scripts/check-human-mode.mjs`
- `IMPACT_REPORT_DIR=docs/qa/combat-roll-2026-10-21 node scripts/check-impact-body.mjs`
- `node scripts/check-motion-transitions.mjs`
- `node scripts/check-remote-motion.mjs`
- `npm run build`

Validated 10 whole-skin impact cases and 12 impact exits, 33 gameplay recovery cases, 120 combat foot cases, 24 combat quality cases, actual B+W movement, remote motion, and 3,267 mixer transitions.

Browser inspection uses the actual Character.update and SwingPhysics through `?motionReview=1` and `?combatReview=1`. Screenshots record the final forward-roll and moving-guard output.
