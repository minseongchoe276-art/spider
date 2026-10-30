# Hong Kong streaming performance

Local headless Chrome, 1280×800, separate fresh browser contexts, real remote tiles. Network timing varies; these runs do not establish an FPS or first-load speedup.

Balanced quality now requests tiles within 750 m (low: 500 m; high: 1200 m). The display camera is unchanged. Terrain ancestor coverage remains enabled. Cache pressure increases screen-space error by 25% per check instead of 5%, retaining the 28-pixel ceiling and recovery hysteresis.

At the 30-second sample, terrain queued requests fell from 23 to 0; cache bytes fell from 381382539 to 352875711. Both runs were ready by the 20-second sample. At 20 seconds, refused terrain requests fell from 115 to 44; structural building refusals fell from 5 to 0.

Validation: loading performance checks, Hong Kong rendering checks, nine streamed collision scenarios, production build, browser startup and movement review.
