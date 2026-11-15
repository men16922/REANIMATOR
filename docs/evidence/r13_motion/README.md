# R13 enemy motion feel (FEAT-002)

Before: `before_stalker_chase.jpg`, `before_crawler_chase.jpg`, `before_a.jpg`. After: `after_crawler_chase.jpg` (6 frames, ~70 ms apart, crawler chasing across the Airlock floor; legs reach and trail differently in each frame).

## What changed (render only, sim untouched except the planner's perch line)
- `PoseTransition` (`src/render3d/enemyMotion.ts`): when the procedural clip changes (crawl, crouch, leap, land, idle), the jump in lift/pitch/roll/yaw becomes an offset that decays with tau 0.11 s. Bob and shudder in the target stay intact. Reset for dead enemies. Used for static foes in `scene3dFull.ts`.
- Crawler leg scuttle (`applyCrawlerScuttle3D` in `riggedModels.ts`): vertex shader displaces the lower body vertices (legs) along the body axis with a sine locked to the existing gait phase `v.gait`, left/right in anti-phase, with a small lift on the forward swing. Amplitude `scuttleAmp(speed)` = stride/(2*pi) (about 1.1x), zero at rest, capped at 0.24 m. Per-material uniforms (materials are cloned per instance), no extra draw calls, no lights; spitter is not affected.
- Stalker reviewed: gait phase freezes when ground speed reaches 0, so the run-weight decay holds a pose rather than sliding. Not changed.

## Tests
`tests/r13-motion-feel.test.ts` (amplitude 0 at rest, stride lock, no snap on clip change, reset on death). `make check` exit 0.
## Planner re-check (Playwright MCP browser, after the change)
- `after_crawler_melee.jpg`: crawler e-airlock-1 against the player at the Airlock crate. It walks up, hops onto the crate, now walks off it toward the player (perch fix, `world3d.ts`) and winds up and lunges; before the fix it sat on the crate idle for the rest of the 5 s sample (`before_crawler_chase.jpg` log: x 9.30, y 1.4, idle from 1.8 s on).
- `after_stalker_chase.jpg`: stalker e-bio-5 running across Bio-Labs, six run frames with contact and passing poses, forward lean, no sliding seen.
- Leg swing direction: on the stance half of the wave (no lift) the leg moves toward -z while the body moves +z, so planted feet push backward relative to the body. `SCUTTLE_DIR = 1` is kept.
- Not changed: the crawler melee loop itself (windup 14 ticks, lunge, 40-tick recover, back off inside 2.2 m). Proportional ring/back-off and lower acceleration were tried in the sim; every variant moved the bot pins and HP windows (tests/assist, foes, hazards), so they were reverted.

