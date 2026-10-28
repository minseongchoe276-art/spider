# Vehicle incline and bottom dock verification — 2026-10-28

A constant wheel height-difference cap classified ordinary grades as obstacles; median replacement flattened the suspension pose. Collision queries also ran before target ground height was applied, and flat corner rays intersected ascending pavement. Smoothing the physics root then left the collision body behind the road.

The controller now fits a tyre support plane, separates grade from abrupt steps using contact normals, and checks the destination at its actual support height. Rapier body centres and corner rays follow chassis orientation; a previous-pose sweep retains obstacle detection. Rendering smooths ride height independently of physics. Wheel springs use the rotated tyre sole and each contact's grade, rather than subtracting a sloping ground height from an upright chassis. Incline parking projects the player's ground plane; approach and exit checks follow actual surface heights. Online packets contain the rendered chassis height and angles.

Driving remains limited to 28 degrees. Unloaded support, excessive grades, high steps, map boundaries, walls, vehicles and citizen blockers retain their checks. This is a grounded arcade controller, not a free-flight vehicle simulation.

Validation:
- `node scripts/check-vehicle-slopes.mjs`: actual Rapier triangle meshes, 2/6/12/20/26 degree grades at 24/60/144 FPS, ramp entry, crest, descent, reverse, cross slope, small curb, high step, steep grade, wall and missing terrain. Both actual vehicle assets: incline summon, tyre contact, driver seat, safe exit and network packet acceptance. See results.json.
- `node scripts/check-vehicle.mjs`: real BMW/driver rigs, wheel rotation, road noise smoothing, thin wall, pole, map bounds, missing ground, citizen obstruction, braking, steering, entry/exit and pause.
- `node scripts/check-vehicle-sync.mjs`: both models at 24/60/144 FPS, remote seat/suspension, phase transitions, ordering, stale state, two-client WebSocket messages and cleanup.
- `VEHICLE_UI_OUT=docs/qa/vehicle-slopes-2026-10-28/ui node scripts/check-vehicle-skill-ui.mjs`: actual browser, shared bottom skill row, both one-click summons, narrow and genuine touch contexts, minimap/control overlap checks. Screenshots inspected.
- `npm run build`: passed; existing bundle-size advisory remains.

The tyre test checks local contact at the wheel soles; the controller centre can bridge a sharp ramp seam because the chassis spans four wheel contacts. This suite does not claim an exhaustive traversal of every live streamed Hong Kong tile.
