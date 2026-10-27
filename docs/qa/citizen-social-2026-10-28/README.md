# Citizen warning and witnesses

Citizens reuse the existing startle clip for a warning, then play the existing walk backwards while facing the player. After the warning, repeated assault permits counterattack; otherwise the victim flees. Witnesses startle, retreat using terrain-checked paths until seven metres away, watch the incident, and resume walking/idle after six seconds without a new alarm. Approaching a watcher within 5.5 metres makes them retreat again. Walls still block incident propagation. Paused simulation freezes all timers.

Validated with `node scripts/check-citizens.mjs` at 24/60/144 FPS: warning notice, backward displacement and negative walk playback, facing the player, safe watch distance, routine resumption, existing counterattack damage and collision cases. `node scripts/check-combat.mjs`: 11 scenarios. Production build passed.
