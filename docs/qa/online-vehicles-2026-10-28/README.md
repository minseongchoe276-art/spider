# Selectable online vehicles — 2026-10-28

BMW 330i and the supplied 2012 Corvette C6 ZR1 share the existing summon / B entry / WASD / Space brake / B exit controls. Each player owns one selected car; selecting another while parked replaces it. Drivers use the real avatar skeleton and car-specific seat, pedal, steering wheel, wheel and door anchors.

Accepted vehicle snapshots carry model, sequence, phase, position, chassis orientation, steering, wheel spin, four suspension offsets and transition anchors. Remote drivers use the same interpolated frame as their car. Reordered packets are ignored, stale vehicles stop extrapolating, leaving disposes instances, and reconnect restores the selected car. Model caches are bounded to two sources.

## Validation

- `npm run test:vehicle:online`: actual BMW/Corvette GLBs and avatar rigs at 24/60/144 fps; seat alignment, joint normalization, suspension matching, transition recovery, stale/reordered snapshots, loading disposal, actual two-client WebSocket enter/drive/exit, collision corrections and leave cleanup. Also real embedded PostgreSQL with all migrations: persisted snapshots, schema/sequence/speed/teleport rejection, building/car overlap, life reset and privileges.
- `npm run test:vehicle:live`: two authenticated anonymous clients against the actual Supabase project with a private Realtime channel. Both models accepted; overlap, building, invalid speed and teleport rejected; reconnect retained driving; peer received each transition; unauthenticated RPC denied. Test clients leave afterward. See `live.json`.
- `node scripts/check-vehicle.mjs`, `node scripts/check-remote-motion.mjs`, `node scripts/check-multiplayer.mjs`, `node scripts/check-input-lifecycle.mjs`: passed. Input lifecycle: 22/22. Production build passed, with existing bundle-size warning.
- Browser: two real WebSocket tabs, different selected cars, summon / enter / drive / stop / exit. Both peers showed the other model, active seated pose, then parked state with normal avatar restored. No error-level console messages. Screenshots show each remote driver.

The existing compact-city collision migration was applied to production before the vehicle migration: 184 current solids, replacing the stale 744-solid city. Vehicle snapshots use existing authenticated RPC/room membership and private broadcasts; direct table access remains denied. Post-migration security advisors show the same existing notices (intentional authenticated SECURITY DEFINER RPCs and guest-room policies, deny-all RLS tables, password-protection configuration); no new vehicle helper is publicly callable.

Collision scope: client driving sweeps the vehicle body against loaded terrain and buildings, prevents unsafe parking/exits and checks other cars. Server authority validates bounds, speed, player proximity and car overlap; procedural city building checks sweep the complete car footprint. Hong Kong detailed mesh collision remains client-side, using the existing loaded terrain collision world. This does not claim server-side authoritative simulation of every Hong Kong mesh triangle or latency-free crash physics.

Corvette supplied metadata has no author/license declaration; `public/vehicles/CREDITS.txt` records that fact without assigning a license. BMW's embedded CC BY-NC 4.0 attribution is retained.
