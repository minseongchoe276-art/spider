# Vehicle presentation continuity — 2026-10-28

The controller runs at 90 fixed steps per second. Rendering its latest physical position directly creates alternating one/two-tick displacements at 60 Hz and unchanged positions on 30 of 120 or 54 of 144 frames per second during constant-speed travel. Frame rate can be steady while the vehicle still looks discontinuous.

Keep collision/support queries authoritative. Save the two latest completed physics poses and render their interpolation using the remaining accumulator. Position, short-arc yaw, wheel rotation, steering, ride height, pitch/roll, tyre contacts and slope share that sample. The seated driver, camera target/heading, player render position and published vehicle transform follow the rendered chassis. Interpolation is bounded by the completed ticks and never predicts through a wall. Entry/exit and authoritative position corrections reset history; height corrections also drop the old suspension support.

The vehicle HUD now changes text/attributes only when source state changes, and skips parked-door direction queries while driving. Comparing source state rather than translated DOM text also avoids rewriting the same English labels through the translation observer.

Validation:
- `node scripts/check-vehicle-smoothness.mjs`: constant-speed travel at 30/60/90/120/144/165/240 Hz, frame-distance uniformity, no held render frames, bounded one-tick delay, no collision overshoot, corrections including changed elevation, yaw wrapping, and both real vehicle/driver rigs at 60/144 Hz with matching camera position and heading.
- Existing vehicle, real Rapier slope and two-client vehicle synchronization regressions.
- Production build from the exact staged source, separately from unrelated workspace edits.
- `node scripts/profile-vehicle-smoothness.mjs`: actual browser driving and CPU samples. `before.json` / `after.json` retain measured data, including zero unchanged-vehicle HUD mutations in a 30-frame stationary window after the fix.

The interactive traces ran on a shared host with other active rendering and development work. Their aggregate FPS differs, so they do not establish an FPS improvement. The deterministic displacement measurements establish the fixed-clock presentation defect and its removal. No blanket frame-rate guarantee is claimed for all hardware or streamed map tiles.
