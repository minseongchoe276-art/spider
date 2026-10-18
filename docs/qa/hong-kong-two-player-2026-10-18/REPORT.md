# Production Hong Kong: two-player combat and traversal verification

Verified at https://minogame.site/?city=hong-kong on 2026-10-18, using two independent browser tabs / guest sessions and the actual streamed Hong Kong map. Real lobby, ready, start, role swap and production multiplayer damage were exercised. No teleports, injected player positions, forged hits or local procedural substitute were used.

## Actual site results

| Check | Observed result | Evidence |
| --- | --- | --- |
| Third person web hit | Police confirmed −15 / opponent HP 85. Runner independently displayed HP 85/100. | `web-hit-police.jpg`, `web-hit-runner.jpg` |
| First person web hit | Second shot confirmed −15 / HP 70. Runner independently displayed HP 70/100. | `first-person-web-hit.jpg` |
| Moving jab | After swapping roles, a movement key and left attack were held together. Police confirmed −25 and runner displayed HP 75/100. Position changed during the attack. | `moving-jab-first-person.jpg` |
| Moving right hook, third person | Right-arm hook rendered while walking at about 16km/h. Bounded attack input moved 2.61m. | `moving-right-hook-third.jpg`, `.json` |
| Moving right hook, first person | Actual history includes `RUNNING/rightHook`. Bounded attack moved 1.45m before stopping against the roof geometry. | `moving-right-hook-first.jpg`, `final-combat-ankles.json` |
| Wall → mantle → supported roof | Actual production history contains `WALL_RUNNING/wall → MANTLING/wall → MANTLING/idle → RUNNING/walk → IDLE/idle`. Supported idle was confirmed on the roof at approximately (−12.52, 21.90, −74.05), above the real 21.60m surface. | `production-roof-idle.json` |
| Ankles after climbing | At supported roof idle: left 10.44°, right 31.19°. Both runtime peaks were 35.00°, within the 35° constraints. Ankle centres were approximately 0.12m above the actual support surfaces, matching the soles' rig offset. | `production-roof-idle.json`, `production-roof-ankles.jpg`, `production-roof-feet-close.jpg` |
| Ankles after fighting | Supported combat idle: left 13.63°, right 12.88° in the captured sample; neither peak exceeded 35°. | `final-combat-ankles.json` |

Tag damage was verified in room 8C564C on the reticle correction. Free exploration room 83849C retained both guests for the final traversal and motion verification without a match timer. Both test participants left after verification. No browser JavaScript errors were recorded. The tiles library emits its existing warning about limited 3D Tiles 1.1 support.

The final traversal run used the existing visible `hongKongAudit` surface, extended with bounded buttons that send the game's normal gamepad key/mouse events. These do not move or reset the player, replace geometry, alter authority or confirm damage. Climb input stops at roof arrival or 15 seconds, and releases on pause; a manual stop is also available. Keyboard/mouse movement and aiming were also exercised. Mouse lock was disabled for the final audit so clicking an inspection button did not rotate the view.

## Problems corrected

1. **Web attack and traversal could both run from one click.** The HUD and send path accepted a wide direction cone; the narrower reticle gate was checked only after sending. Prediction and sending now share the screen-space gate. Off-reticle traversal does not send a combat hit or consume its cooldown. An aimed cooldown/occlusion consumes the attack click so it cannot launch an unintended swing. Damage remains confirmed only by a server hit event. The HUD distinguishes range from aim readiness. Home / End / PageUp / PageDown provide keyboard aiming.
2. **Fixed mantle depth rejected usable narrow balconies.** The landing candidates now begin from the measured facade distance plus the required support inset, retaining the full footprint, swept capsule path and headroom checks. A real Rapier 1.5m balcony reproduces the old failure and now succeeds; 0.7m and low-ceiling entries remain rejected.
3. **Rounded capsule contacts could twist the grip and roof probe.** The controller uses the actual vertical facade normal, including a lower probe at a lip, and projects the ray length onto that normal for the grip distance. A rounded contact on a narrow supported facade now enters MANTLING.
4. **Open railings could trap the climber below the top bar.** Reachable higher grip candidates clear the bar and lower onto the supported roof. The grip rise is capped at 1.25m, and every capsule step is collision checked. Real-rig tests at 30/60/144fps retain supported idle, ankle bounds and hand grip error below 6cm.

Several initial approaches were under solid bridge / shop overhangs, where entering the roof was physically obstructed. Official Hong Kong geometry was independently loaded to identify supported entries (`official-entry-search.log`); the final approach still used ordinary movement and traversal inputs on the actual site. No geometry or collision was bypassed.

## Validation and deployment

The original deployed asset `index-QkL0B8Ut.js` matched `fea3f5e`. Fixes were pushed to main as `f71d67c`, `4e8dc38`, `fe523d4`, `0f5a742`, and `d9fb2bb`.

Final tested production asset: `index-DPDuigPr.js`.
SHA-256 of both the downloaded production JavaScript and the isolated build:
`669a271ed3452f22d9d5e1f401ed149d3518ec55d2b2d11e4be80a793c8793e8`.

- The complete regression suite passed on a fresh isolated archive of final commit `d9fb2bb`; see `exact-final-tests.log` (exit 0). This includes the added real Rapier balcony / rounded-contact / open-railing cases, real-rig ankle and grip checks, multiplayer damage, input lifecycle and traversal checks.
- All affected focused controller, traversal, real-rig, parapet and aim checks also passed during the repair loop.
- The exact final commit's production build passed; see `exact-final-build.log`.
- Earlier full and focused logs are retained alongside the screenshots and actual-site JSON.

Other source edits appeared concurrently in the shared workspace. They were preserved and excluded from these commits. Final validation uses an isolated archive of the committed game, so those edits do not affect the tested build.
