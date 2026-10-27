# BMW 330i — 2026-10-28

## Implemented

- User-supplied `dist/models/bmw_330i_-_description.glb`, SHA-256 in the vehicle manifest. Original preserved at the supplied path after the build. Runtime asset is `public/vehicles/bmw-330i.glb`.
- Removed floating description and display platform, simplified 1,159,156 source triangles to 269,041, reduced 61,656,064 bytes to 9,685,688. Original author and CC BY-NC 4.0 metadata retained; credits are included in the release notices.
- B / vehicle button requests parking on supported, unobstructed ground. Approach the driver's door, then B to enter. Existing idle pose blends into a driver IK pose; the actual local avatar remains visible. Pelvis is aligned to the seat, hands grip the wheel and legs reach pedals with original bone lengths. Door opens/closes; four wheels roll and front wheels steer.
- W accelerates, S brakes/reverses, A/D steer, Space or the touch brake button brakes, B exits while stopped. Existing movement stick also controls driving. Vehicle HUD includes speed, controls and direction/distance to the parked driver door.
- Fixed 90 Hz simulation, bounded speed, terrain support, map boundary checks, swept corner/body probes, whole-body Rapier shape queries in streamed Hong Kong, oriented building footprint checks on local maps. Missing terrain stops travel. Nearby citizens stop the vehicle and avoid its body.
- On-foot players cannot walk through the parked body. Exit chooses a supported, clear location around the car, checks headroom and walls, and refuses unsafe exits. Entry/exit clear held web/combat inputs and restore the walking camera/pose. Pause freezes movement. Vehicles are local **solo only**; online entry is refused and parked vehicles are hidden in rooms.

## Evidence

- `node scripts/check-vehicle.mjs`: 24/60/144 FPS, matching acceleration/collision/reverse/brake results; thin walls; poles between probe rays (real Rapier cuboid sweep); oriented box collision; missing terrain; map limits; real car geometry; real hero rig; seat alignment; finite normalized joints; preserved leg lengths; deformed body/foot/roof bounds; safe entry/exit; pause and online refusal.
- `node scripts/check-input-lifecycle.mjs`: 22 scenarios including B ownership across devices and suppression of punch/web/jump while driving.
- `node scripts/check-touch-controls.mjs`, `node scripts/check-qa.mjs`, `node scripts/check-hong-kong-streaming.mjs`, `node scripts/check-citizen-render-recovery.mjs`.
- Browser review with actual textures/avatar: loaded BMW, approached door, entered, inspected driver, accelerated, stopped at wall, reversed and exited. `driver-seated.png` shows the avatar and open driver door.
- Actual Hong Kong GameApp: loaded the government terrain, requested BMW, confirmed placement on a supported surface and driver-door direction/distance UI; browser console had no errors.
- Actual GameApp in Neon Core: requested car using the product HUD, walked to the driver's door using WASD, entered, drove with W, braked with Space, exited back to on-foot movement. `game-driving.png` records the integrated scene. Browser console checked for errors.

This is an arcade ground vehicle, not a suspension or crash-damage simulation. GPU performance depends on hardware and the streamed Hong Kong tiles. The source model's noncommercial license is unchanged.
