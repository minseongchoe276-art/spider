# Compact city and player location verification — 2026-10-14

- Local city: 64 → 16 buildings; playable width 880m → 320m; roads 22m → 28m; local minimap range 180m.
- Opponent positions remain visible throughout active matches, using interpolated avatar positions. HUD labels show names, distance, height difference and offscreen direction; minimap pins distant actors to its edge.
- Texture generation no longer changes building layout. A regression compares every collider of the actual rendered city against the Node authority collision city.
- All eight race gates remain inside the compact map and complete in order. Old saved positions outside the new bounds are rejected.
- `npm test`, `npm run build`, targeted locator regression and `git diff --check` passed. Build reports the existing large bundle warning.
- Actual Chrome two-player local tag match: opponent label stayed visible outside reveal windows; movement changed its distance from 22m to 21m and then 24m, with a left-edge direction indicator. Screenshots record the on-screen avatar label and minimap. Both players left the test room afterward.

Evidence: `tests.log`, `build.log`, `regressions.log`, `local-match.png`, `local-match-moved.png`.

## Production verification

- Code commit `eec22d6afc604b77828821dc33acff0250762307` pushed to `origin/main`.
- Vercel production release ready. Public `/assets/index-2_FATR0N.js` exactly matches local build bytes; SHA-256 `663d7c47b15def6acf55c7a35569e632882fe2953b24347ea469927f1ffe5608`.
- Render advertised auto-deploy but no new deployment appeared after the push. Dashboard manual deploy of latest commit completed successfully: `dep-db75e0bncjis73fitoug`, same code commit, status `live`. Existing rooms were empty before deployment.
- `/healthz` returned ready with warm official terrain. Two temporary public WebSocket participants started a procedural match and moved on the generated compact rooftop. Movement arrived at the other participant without server correction. Both temporary participants left afterward.
- `live-deployment.json` records the accepted public movement; `live-compact-city.png` shows the public game. This validates deployment and representative movement, not every possible route or device.
