# Imported aerial flips — 2026-10-28

R randomly selects Stylish Flip or Front Flip with equal probability, independent of movement input, in web and combat modes. Release attached webs first. Repeated device presses share one action until released.

Source analysis at 120 Hz: Front Flip uses 0.50–1.57 seconds (about +350° pelvis rotation), Stylish Flip uses 0–1.23 seconds (about −359°). Remove the grounded anticipation/contact tails, keep the authored tuck and extension. Physics owns translation; compiled pelvis translation stays in place. The submitted FBXs replace the older takes at their existing catalog paths.

Playback normally takes 0.85 / 0.95 seconds. With limited airtime, duration fits predicted contact minus 60 ms, down to a 420 ms minimum. This accommodates the 8 m/s combat hop without adding an impulse. Late inputs are rejected; actual contact, web attachment and wall attachment interrupt the action. Active combat actions retain priority. A single gameplay clock drives local and remote clip sampling, including placeholder rotation.

Validation: `node scripts/check-imported-air-flips.mjs`, `node scripts/check-air-tricks.mjs`, `node scripts/check-input-lifecycle.mjs` (22 checks), `node scripts/check-combat-traversal.mjs`, `node scripts/check-remote-motion.mjs`, production build. Browser review captured both clips at 45% and 95%, with no page errors.

Broader legacy checks encountered unrelated assertions: motion cleanup expects cross to use Lead Jab (3) while the catalog uses Punching; expert audit has an incomplete VFX fixture. These are not covered by the dedicated flip PASS result.
