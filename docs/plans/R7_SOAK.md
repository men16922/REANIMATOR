# R7 Track C: soak, leaks, error tolerance

## Leaks found and fixed (scene3dFull.ts)
- `ensureWorldBuilt` never removed the previous level. Any new `Level3D` object (`__reanimatorAdvance` uses `newWorld3D`) stacked solids, trim, ramps, pillars, acid pools, lights, save pads and upgrade pedestals, plus per-batch cloned textures. `teardownLevel()` now removes and frees them (shared facility textures and glTF geometry are kept).
- `rebuildActorInstances` removed rigs, enemies, barrels, hives, pickups and the exit ring without freeing cloned materials, pick-proxy boxes or pickup geometry. It now disposes them.
- `tests/leak-static.test.ts` checks build/dispose pairing for decor3d, mood3dGfx, hazards3d, metroid3d.

## Error tolerance
- `frame()` wraps the body in try/catch: first error logged once, later ones counted (`__reanimator().frame.errors`), loop continues.
- WebGL `webglcontextlost` pauses rendering and shows a notice; `webglcontextrestored` resumes. A canvas with a WebGL context cannot switch to 2D, so if not restored in 5 s the notice asks for a reload.

## Telemetry
- `__reanimator().frame` (localhost or `?perf`): `{simMs, fxMs, drawMs, totalMs, avgTotalMs, maxTotalMs, frames, errors, lastError}`.
- `__reanimator().perf` adds `sceneChildren`, `sceneObjects`, `contextLost`, `frameMs`. `fx` adds `smoke`, `goreChunks`, `goreDecals`, `smokeColumns`. `__reanimatorAudio()` adds `trackedVoices`.

## Soak hook (browser, unverified)
`await __reanimatorSoak(n = 3, { showcase = true, stepTicks = 60 })`. Per iteration: Advance (new Level3D), 11 demo checkpoints, 10 showcase scenes, Classic toggle, restart, each followed by 60 ticks; then one sample in the same end state.
Expect `ok: true`, `leaks: []`. Stable metrics (geometries, textures, programs, sceneChildren, sceneObjects, audioTracked, audioLoops, frameErrors) are compared against iteration 1 (iteration 0 is warm-up). Pooled metrics (drawCalls, particles, smoke, gore, popups, audioActive, jsHeapMB) are reported only.
