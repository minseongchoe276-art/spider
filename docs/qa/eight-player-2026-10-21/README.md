# Eight-player combat and motion verification — 2026-10-21

## Fixes

- The room server previously ignored B guard. It now snapshots grounded front guard when an attack arrives, before asynchronous terrain visibility checks. Front cone is character facing ±60°, damage multiplier 0.4: punch 25→10, wire 15→6. Rear, airborne, rolling, turning, and stale (>350ms) guard do not reduce damage. Guarding prevents attacks. A fresh attack pose handles Q / B release between movement packets.
- Tag runners can defend in wire mode. Moving guard retains walking legs and defensive upper body. Guard requires at least 12 local stamina. Practice NPC blocks now use the same cone and damage multiplier; NPC impact also consumes 12 practice stamina. Online stamina gates local actions; the room server owns HP and damage, not the full stamina economy.
- Movement packets carry whitelisted animation key, normalized phase and rate, visual yaw, landing contact timer, and actual wall travel phase/rate. Observers reconstruct the same clip clock rather than free-running a new clock. Ground pound remains held in flight until landing arrives. Client interpolation and network delay still apply.
- Punch/guard input and server validation agree during rolls, turns and flight. Defensive gaze and dodge fists keep their combat pose. Team arrows use red/blue team colors. Damage feedback shows actual reduced damage. Mode cards and native mode selector stay in sync.

## Verification layers

- `online-guard.json`: eight local WebSocket clients, twelve guard/attack scenarios, all clients receive identical hit results, including tag runners and asynchronous terrain checks.
- `motion-sync.json`: eight source rigs × seven observers (56 remote rigs) at 24/30/60/144 FPS; phase reconstruction, manual combat playback rates, finite normalized bone rotations, independent skeletons, team marker colors, and ground-pound hold. This is rig simulation, not browser or visual identity proof.
- `online-stance.json`: input state rejection and real movement/guard at 24/60/144 FPS.
- `full-audit/results.json`: complete automated regression gate. Only final PASS with stable source snapshot counts as completed.
- `build.log`: production build. `dependency-audit.json`: production dependency vulnerability audit.
- `public-eight.json`: eight internet WebSocket participants plus a ninth capacity probe, official-map guard tests, 4v4/FFA HP, all-observer agreement, cooldown, friendly-fire, victory and rematch. `public-tag.json`: eight-player official-map pursuit, wall obstruction, eliminated reconnect state, temporary room cleanup.
- `browser-results.json`: eight actual WebGL browser clients simultaneously joined AFB101 on the public site, all ready/start, seven opponent/ally labels and HP on every client, team colors, B+W movement reflected on the observer, B-held guard rule text, and zero console errors in all eight clients. Blue withdrawals also produced the red victory screen. All test clients explicitly left; seven temporary tabs closed. Screenshots show lobby, game, observer and victory. These are eight tabs on one workstation, not eight physical devices or a device FPS benchmark.

The tests cover named scenarios and regressions; they do not prove every possible play situation, eight separate physical devices, or pixel-identical views despite latency.

## Follow-up findings from the full regression and browser checks

The fixed-source 91-suite audit completed with 90 PASS and one failing suite (`full-audit/results.json`, retained unmodified). The failing terrain suite reproduced four stair foot snaps. A support-height change discarded a planted foot and skipped both release blending and bounded IK, restoring the authored ankle up to 0.94m away in one frame. Changed support now follows the normal bounded release path. The remaining stair-edge transition removed a still-decaying terrain pelvis offset on its first airborne frame, moving the hips beyond the departing foot’s reach. The same visual offset now decays through jump/fall, preserving the existing foot release. The complete terrain matrix and relevant contact/motion tests are rerun separately; see final logs and release verification record.

Actual browser cleanup also exposed player nameplates and combat hints left over the result screen because gameplay paused before the next update. Clearing avatars now immediately clears those DOM overlays. A session-flow regression checks cleanup without waiting for another game frame.

The 91-suite initial audit is evidence for abcb1e1. Follow-up evidence is identified separately rather than rewriting its original failed report. Concurrent work in another task was preserved in the original checkout; this release was built and tested in an isolated managed worktree.

## Final release

- Room authority: `abcb1e16354fe1b4248dab81da616cc26c3c6312`, Render deploy `dep-dbc7m4ui0phs73alit8g` live; health ready, official terrain CLEAR.
- Frontend: `2b6b2d4f8c59ccaf38422a5d9a868b748013b79d`, Vercel success. Public JS and CSS match the final local production build byte for byte (`deployment-final.json`).
- Full terrain rerun: **64/64 PASS**. Combat feet: **45 continuous + 75 held PASS**; limb continuity **32 PASS**; remote animation **56 rigs PASS**. Guard, stance, gait, session, modal, connection, multiplayer and marker regression logs are also retained.
- `browser-final-results.json`: eight actual clients repeated on the final frontend. All eight showed the participant count and seven HP/name labels. The observer’s measured DOM rectangles do not overlap; all eight console error logs are empty. Opponent-team withdrawal shows red victory, **zero leftover player labels** and **hidden combat feedback** immediately on finish. All eight explicitly left and test rooms were cleaned up.
- `browser-final-eight.png`: final eight-player screen. `browser-final-win.png`: clean final victory screen. The earlier `browser-eight-*` screenshots record the first public run and the overlap/finish problems before their corrective patch.

`release-verification.json` ties the original full audit, corrected terrain run, targeted follow-ups, public protocol checks, actual browser results and final source hashes together.
