# G: dashing uppercut — 2026-10-27

G in grounded combat (and the G ability button) starts a 1.35-second uppercut. Cost: 35 stamina. Cooldown: 8 seconds. It advances 2.1m with a smooth acceleration/deceleration curve, then recovers. Facing is committed at startup. Walls use the normal swept character capsule; losing ground or receiving an unguarded hit cancels the action.

## Mixamo assets

Downloaded through the signed-in Mixamo uppercut search, FBX Binary, Without Skin, 30 FPS, no keyframe reduction:

- `Surprise Uppercut` — the attacker/chase variant. Keep source seconds 0.70–1.97 to remove the unrelated lead-in and idle tail. SHA-256: `361683039f99b436789b4bd9d5f863fb8d7aad10e1b648a6d5c5530ad1c6fbce`.
- `Receive Uppercut To The Face` — dedicated incoming reaction. SHA-256: `3e525bdc0ed150f35ba6008625a99ed490fcbec1d06a82d4e5983e5fa4a5e356`.

The action retains the authored full body while dashing. The previous straight-punch hand IK is excluded so it cannot flatten the rising fist. The rear support is shortened and an airborne boot releases its floor anchor during weight transfer. Existing joint limits and foot-contact test tolerances are unchanged.

Contact phase 0.36 maps to 0.486 seconds, inside the 0.43–0.55-second damage window. Each target takes one 48-damage hit. Front guard reduces online damage to 20. An unblocked uppercut selects `hitUppercut`, with a short visual lift and authored recoil; authoritative player coordinates remain grounded. Training mannequins use the same short lift envelope. This is a visual launch, not a new aerial juggling physics system.

The impact uses bounded, pooled lavender upward sparks, a heavy hit sound, and restrained camera feedback. Misses, walls, and blocked online hits do not emit the uppercut impact. Reduced-motion mode uses six shorter-lived particles instead of 22. The G ability slot displays cooldown seconds and stamina/availability state.

Online attacks carry `variant: uppercut`. The server checks grounded combat, action/phase/duration, 8-second cooldown, 2m contact reach, facing, target, visibility and guard. Its confirmed hit broadcasts the variant for the incoming reaction and impact effect. Ordinary punch/web rules remain unchanged. Server changes must be deployed alongside the client for online special damage.

## Validation artifacts

- `results.json`: actual Character/SwingPhysics runs at 24/60/144 FPS, smooth 2.1m integration, full-body selection, one contact/effect, swept wall stop, incoming reaction recovery, interruption, resource/cooldown gating, remote attack/reaction packets and pooled/reduced VFX.
- `online.json`: nine isolated real WebSocket server cases, including guard, early/airborne rejection, special cooldown/reach and ordinary punch regression.
- `/scripts/review-uppercut.html`: real attacker/defender rigs and VFX with contact-frame pause, hit/miss/wall and reduced-motion controls. Browser inspection confirmed hit HP 52 / one effect; wall and miss HP 100 / zero effects.
- Existing combat rig, combat quality, foot support, input lifecycle, stance, motion selection, online guard and remote synchronization checks are recorded in their existing QA folders.

Local simulation/server and browser validation do not replace a live multi-device production playtest. No production deployment is part of this change.

Final checks passed: production build; 18 combat-quality cases; 30 real-rig combat cases plus recovery checks; 45 continuous and 75 held foot-contact/recovery cases; 154 motion-selection cases; 15 crouch-to-strike/controller cases; 21 input-lifecycle cases; 40 traversal handoffs; nine uppercut WebSocket cases; 12 online guard/rule cases; synchronization across 56 independent remote rigs. `git diff --check` and the compiled-motion fingerprint also pass. The build retains its existing large-chunk warning.
