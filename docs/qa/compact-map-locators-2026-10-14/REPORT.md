# Compact city and player location verification — 2026-10-14

- Local city: 64 → 16 buildings; playable width 880m → 320m; roads 22m → 28m; local minimap range 180m.
- Opponent positions remain visible throughout active matches, using interpolated avatar positions. HUD labels show names, distance, height difference and offscreen direction; minimap pins distant actors to its edge.
- Texture generation no longer changes building layout. A regression compares every collider of the actual rendered city against the Node authority collision city.
- All eight race gates remain inside the compact map and complete in order. Old saved positions outside the new bounds are rejected.
- `npm test`, `npm run build`, targeted locator regression and `git diff --check` passed. Build reports the existing large bundle warning.
- Actual Chrome two-player local tag match: opponent label stayed visible outside reveal windows; movement changed its distance from 22m to 21m and then 24m, with a left-edge direction indicator. Screenshots record the on-screen avatar label and minimap. Both players left the test room afterward.

Evidence: `tests.log`, `build.log`, `regressions.log`, `local-match.png`, `local-match-moved.png`.
