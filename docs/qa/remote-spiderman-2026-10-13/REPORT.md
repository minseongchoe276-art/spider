# Online opponent appearance — 2026-10-13

The production bundle `index-BymwRkiF.js` constructed an opponent from a cyan capsule and a white sphere. The existing RemoteMotion class was not connected to Multiplayer, and Character could not clone the local skin.

Production fix: commit `8ad97b90f2aaaf252c0e6325dc5be8f613cea807`, deployed by Vercel to https://minogame.site/ on 2026-10-13 (KST). The deployed entry bundle is `index-D1JHT1oh.js`.

- Clone the real textured Spider-Man skin with SkeletonUtils and a separate skeleton/mixer per opponent.
- Preserve all local animation clips and shared suit materials.
- Wait for the full local character to load; never freeze a remote capsule fallback.
- Connect multiplayer movement/pose messages and render updates to RemoteMotion.
- Carry validated pose payloads on local WebSocket movement broadcasts.
- Dispose independent rigs and ropes without disposing the local player's shared skin assets.

The release was prepared from the previously deployed commit in a separate checkout. Other ongoing motion, gameplay, map and settings work in the main workspace was preserved and excluded from this release. The workspace main branch was synchronized to the deployed commit without replacing its working files.

Validation:

- `node scripts/check-remote-appearance.mjs`: deferred readiness, no capsule, material identity, independent skeleton, running and swing/release at 30/60/144 FPS, stale-pose cleanup and leave cleanup PASS.
- `node scripts/check-multiplayer.mjs`: four-player room, readiness gate, teams, damage and late-join rejection PASS.
- `npm run build`: PASS in both the working workspace and isolated release.
- Two separate browser contexts against both local versions: each sees the other as a textured Spider-Man, with all 40 actions (39 catalog motions plus embedded default), independent skeletons and no runtime errors.
- Vercel reports Ready, Latest, Production; minogame.site serves the new entry bundle.
- Two separate browser contexts on the actual production site: room creation, join, ready and start PASS; both clients see a textured Spider-Man with 40 independent animation actions, no capsules and no page errors. Both test clients left the room after verification.

Screenshots: `opponent-spiderman.png` (current workspace), `release-opponent-spiderman.png` (isolated release), `live-opponent-spiderman.png` (actual production opponent).
