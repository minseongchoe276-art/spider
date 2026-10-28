# Actual vehicle FPS optimization — 2026-10-28

Measurements use the live WebGL game, enter the real car through the normal interaction path, and drive with W/A/Space input. The procedural straight phase travels about 71 metres and the turn phase about 16–23 metres. No simulated FPS, disabled renderer or teleporting during measured driving is used.

The baseline is an immutable snapshot of the working app. Only VehicleAsset.js and the new VehicleRender.js differ in the optimized snapshot; the viewport (1600×900), quality (balanced), device scale (1), scene and disabled automatic resolution adjustment are held constant. Chrome uses the Apple M1 Metal renderer. WebGL2 disjoint timer queries measure GPU duration asynchronously, renderer.info records submitted draws/triangles, method timers record CPU cost, and Chrome CPU profiles retain the sampled stacks. The dev-only benchmarkApp hook exists only in the temporary snapshot, not the shipped app. The normal QualityDirector sampling is disabled for both variants so measurement does not include that developer-only diagnostic cost.

## Confirmed causes and changes

The BMW baseline creates 149 material instances and leaves one moved door-glass material with transmission enabled. The existing cheap-glass pass traversed only the source model after wheels and door parts had already been reparented. Three.js therefore performed an additional full-scene transmission render. Applying the existing alpha-glass policy to the complete vehicle frame removes that unintended pass. Glass remains transparent.

Cloning each original material once per vehicle reduces the BMW to 32 material instances and preserves isolation between vehicles. Opaque compatible parts are batched separately within the body, each fixed/rolling wheel assembly and the door. Glass stays unbatched for transparency sorting. Index winding, UVs, normals, material identity and animated ownership are retained. Named source nodes remain available for authoring inspection; only their batched render geometry is submitted. Merged geometries are owned by the vehicle and disposed on switch/leave. Source triangle count is unchanged (BMW: 301,166); the lower submitted triangle count comes from removing the extra scene pass, not decimating the vehicle.

## Results

BMW straight, two baseline / two optimized runs:
- FPS: 46.9 / 48.9 → 59.0 / 59.6.
- Frame p95: 33.4 ms → 16.8 / 16.7 ms.
- GPU median: 25.3 / 27.0 ms → 6.3 / 7.2 ms.
- Submitted draws: 504 → 232; submitted triangles: 707,308 → 358,442.
- Renderer CPU mean: 9.74 / 8.36 ms → 3.65 / 3.41 ms.
- Turning: 44.2 / 49.5 FPS → 59.9 / 59.4 FPS.

Corvette had no transmission pass defect and was already about 60 FPS in the baseline. Material instances decrease from 38 to 26 and straight draws from 154 to 152. One optimized pass measured 52 FPS under shared-host load; the repeat measured 60.2 FPS with 16.8 ms frame p95 and about 6.2 ms GPU median. All traces are retained rather than dropping the slower run; no Corvette FPS gain is claimed.

A real streamed Hong Kong smoke run also loads, summons and enters the BMW without browser errors and without a transmission material. It moves 3.6 metres before an obstruction stops the selected initial heading; turning is blocked there. This verifies initial streamed-map integration, not an extended unobstructed Hong Kong route or a Hong Kong before/after FPS comparison.

## Validation and reproduction

- `node scripts/check-vehicle-render.mjs`: actual material/geometry data, material sharing and cross-car isolation, transmission disabled on moved parts, triangle/UV retention, wheel and door motion, reflected winding, idempotent preparation and disposal.
- Existing real vehicle, 30–240 Hz presentation, real Rapier slope and online vehicle synchronization checks.
- Production build from the exact staged source independently of unrelated workspace edits.
- Screenshots from the actual drives inspected for missing body, wheels and windows.

To profile another run: run `node scripts/prepare-vehicle-fps.mjs`, start Vite in its returned directory on port 5198, then run `VEHICLE_FPS_TAG=check VEHICLE_FPS_MODEL=bmw node scripts/benchmark-vehicle-fps.mjs` from the project. VEHICLE_FPS_URL, VEHICLE_FPS_MODEL, VEHICLE_FPS_CITY and HEADED=1 can override the server, model, map and browser visibility. Use an isolated server and do not change source mid-run. Capture a baseline before replacing the two rendering files. The machine is shared, so these observed results are specific to the tested scene and configuration; raw intervals, GPU samples, profiles and repeated runs are saved alongside comparison.json.
