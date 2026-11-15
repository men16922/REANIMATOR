# R13 Alive: ambient background life

Display-only, seeded, deterministic motion for the six sector backgrounds. Nothing here reads the sim beyond player position, the Meltdown flag and Reduce motion. No lights, no `Math.random`.

- `src/render3d/ambientScenes.ts`: pure layout per room (mulberry32 seeded by `room.id + ':ambient'`), built on the `Geo` builder.
- `src/render3d/ambient3d.ts`: three draw calls per sector (far silhouettes, additive events, one pooled Points mesh). Animation runs in vertex shaders from a CPU clock that runs at 0.4x under Reduce and up to 1.8x under Meltdown (no jumps when toggled).
- Wired next to the vista in `scene3dFull.ts` (build, setClassic, setView, update, dispose, telemetry `ambient`). `drawBudget.ts` counts the ambient meshes.

| Sector | Far events | In-room |
| --- | --- | --- |
| Airlock | rotating alarm beacons, frost drifting past the glass | blinking pod status lights, dust, steam vents |
| Shaft | maglev car and cargo pod crossing, amber warning sweeps | dust, steam, drips |
| Mines | ore carts on far rails, swinging lamps, drill spark bursts | dust, drips |
| Bio-Labs | breathing tank glow, shadow drifting in tanks, bubbles | flickering light strips, dust, steam |
| Security | patrol drones with red eyes, storm lightning, searchlights, rain | dust, steam |
| Core | rotating reactor rings, pulsing heart, heat shimmer | coolant vents, dust |

Reduce motion: no lightning, steady blinks and strips, slower clock, narrower sweeps, no spark bursts. Meltdown: faster clock, red tint, spark bursts fade out so they do not duplicate the R10 setpieces. Classic View: colors quantised to 5 levels, hard points.

Verification: `make check` exit 0 (includes `tests/ambient.test.ts` and the draw-budget test with ambient counted). Browser screenshots: unverified, headless Chrome aborts (SIGABRT) in this sandbox, so shader compilation is checked only by review.

## Enemy running

**Cause (measured by sampling `gaitStep`, no browser).** Rigged foes (Stalker, Warden) were already stride-locked: `strideLength * gaitCycleRate` equals ground speed at every speed. The single-mesh crawlers were not. `gaitStep('crawler', v)` was `6 + v/5*28` rad/s, a constant offset plus a slope, so cadence did not scale with speed:

| Ground speed (m/s) | Cadence (Hz) | Metres per scuttle cycle |
| --- | --- | --- |
| 0.45 | 1.36 | 0.33 |
| 1 | 1.85 | 0.54 |
| 2 | 2.74 | 0.73 |
| 3 | 3.63 | 0.83 |
| 6.1 | 6.39 | 0.95 |

Crawlers accelerate and brake through those speeds on every chase, so the bob, roll and yaw swing ran too fast for the ground they covered (scuttling in place) and the apparent stride kept changing.

**Fix (render only, `src/render3d/enemyMotion.ts`).** `gaitStep` for crawlers is now `2*pi*speed / CRAWLER_STRIDE` with `CRAWLER_STRIDE = 0.95` m, capped at 6.5 Hz. Metres per cycle is 0.95 at every speed. Spitter hover rate is unchanged. No sim, bot pin or reach3d change.

**Test.** `tests/enemy-motion.test.ts` "R13: crawler scuttle stride is constant": failed before (stride spread 0.33..0.95 m), passes after.

**Verification.** `make check` result is recorded in the commit report. Visual check: unverified (headless Chrome aborts, no screenshots in `docs/evidence/r13_alive/`).
