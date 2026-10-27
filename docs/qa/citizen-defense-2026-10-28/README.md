# Hong Kong citizen defense and navigation — 2026-10-28

- Citizens reuse Boxing Lead Jab, retargeted onto all three existing rigs. Two player hits enable defense; contact inflicts 12 local player HP through CombatSystem.receiveDamage. One contact per swing; range, facing, elevation, obstruction and existing player invulnerability apply. Citizens remain outside enemy rewards.
- Walking and fleeing use a bounded local collision route search (48 expanded nodes, 1.5 m edges, maximum nine-metre route). Ground and intermediate support plus body-width clearance are required. Official tile layer metadata is carried through collision ray hits to reject building roofs and water; walking selects an open street direction before resuming. Routes refresh as terrain streams after impacts. This is local obstacle routing, not a complete territory-wide street network.
- Failed rendering tiles retry with backoff and a five-retry cap; detail recovers after cache pressure clears. Tile availability and upstream data quality still constrain rendering.

## Validation

- `node scripts/check-citizens.mjs`: three actual skinned rigs / eight clips; population/recycling and wall support; 24/60/144 FPS counterattack contact and escape; actual player HP 100 → 88; range/elevation rejection; building-corner escape.
- `node scripts/check-citizen-render-recovery.mjs`: retry timer, retry cap and quality recovery.
- `node scripts/check-hong-kong-streaming.mjs`: nine collision/LOD cases.
- `node scripts/check-hong-kong-geometry-codec.mjs`, `node scripts/check-tile-textures.mjs`: geometry/texture checks.
- `node scripts/check-combat.mjs`, `node scripts/check-qa.mjs` and `npm run build`.
- Local browser, actual Hong Kong government tile stream: three roots loaded, ready=true, ten citizens; double player hit triggered ATTACK and local HP 88. Evidence: hong-kong-defense.png. This browser review does not certify every map location or multiplayer server HP; ambient citizens are local simulation.

Suggested future reactions: step back and warn before retaliation; witnesses flee together or watch from a safe distance; NPCs thank a player who stops a threat; residents gradually return to their routines. These are suggestions, not implemented features.
