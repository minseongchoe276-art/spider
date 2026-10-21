# Live gameplay inspection — 2026-10-22

Tested the production game at https://minogame.site/?city=procedural through its normal solo UI with keyboard and mouse input. No pose review, injected state, or test-only route was used for the production screenshots.

Manual checks: rooftop jump and approximately 95m fall to ground; full forward-roll entry, tuck, recovery and idle; ground left/right clicks while holding W; W+B guard movement; W+F facade acquisition and ascent; keyboard orbit to observe climbing from the side.

The live playthrough exposed a separate control issue: with the default locked follow camera, holding S or a lateral direction repeatedly changed the camera-relative direction as the body turned. Reverse/side movement now preserves the camera heading through release. Forward movement or explicit C resumes following. Movement uses the intended view yaw rather than spring-arm lag or impact shake. Visual aiming, camera collision, and mouse orbit continue to use the rendered camera.

Validation:
- `node scripts/check-live-movement-camera.mjs` — 24 real physics/camera cases at 24/60/144fps, with and without guard, including stopped view and explicit recenter.
- `node scripts/check-camera-motion-web.mjs`
- `node scripts/check-third-person-only.mjs`
- `node scripts/check-gameplay.mjs`
- `node scripts/check-input-lifecycle.mjs`
- `node scripts/check-combat-roll-recovery.mjs`
- `node scripts/check-wall-head-clearance.mjs`
- `npm run build`

The selected roll/wall screenshots record actual production gameplay before the camera follow correction. Postdeployment evidence is recorded separately after the final live rerun.

Postdeployment: reloaded production after `7f0e2b2` was published, repeated S+B retreat, W+left/right-click movement, the 95m rooftop drop, and side-view wall ascent. Then climbed the full facade and completed MANTLING onto the 95m roof, followed by roof walking. `final-*` screenshots and `roof-walk-final.png` record this rerun. `live-results.json` records the checks; deployment.json identifies the fetched production asset. No further motion defect was reproduced in these inspected sequences.
