# R9 world track (draw budget, set dressing, Meltdown tint)

Branch `r9/world`. Render and dressing side only. No collision or sim change (`src/game3d/map3d.ts` untouched). Browser checks are unverified because Chrome cannot run in this environment.

## Verified (node tests, `make check`)

- Per-sector draw-call estimate stays at or below 300 (`tests/draw-budget.test.ts`, `src/render3d/drawBudget.ts`). A second test piles 300 extra meshes on and asserts the guard trips.
- No `THREE.Light` is created by decor, vista or hazards (test counts lights in the built scene).
- Sector dressing layouts are deterministic and each sector has at least 6 kind:color pairs that no other sector uses (`tests/r9-world.test.ts`).
- Sector motifs exist: mines rails, ore carts, drip glows; biolabs specimen jars; security laser grid frames and banners; core reactor rings and cables; airlock cryo pods and frost patches.
- Foreground silhouettes (`fg`) per sector stay at z >= LANE_FRONT_Z and within 1 m of the ceiling; lane rule, prop cap (260) and window clearing still hold.
- `decor.setMeltdown(active, t, reduce)` eases a red emissive tint onto decor materials and shows a seeded spark field. Reduced motion gives a steady tint and no sparks. Sparks are a pure function of time (`meltSparkPosition`).
- Existing perf-budget, decor, vista and flat-box tests pass unchanged.

## Unverified

- Real browser draw calls (`renderer.info.render.calls`), frame time, and the look of the new props, trims and Meltdown tint.
- The crate and console edge trim added in `scene3dFull.addSolidTrim` (lip, corner straps, cross brace). It is a private WebGL-side method, so only typecheck covers it. The level has one crate and one console, so the visible effect is small.

## Budget numbers (estimator, worst camera window per sector)

Window: half extents 19.4 x 10.9 m (far zoom plus the 4 m culling margin), focus sampled every 4 m along each room. Allowance 70 for actors, fx and hero gear, 4 for door dressing and the instanced trim.

| Sector | solids | decor | vista | hazards | total | + shadow casters |
| --- | --- | --- | --- | --- | --- | --- |
| airlock | 17 | 30 | 19 | 14 | 154 | 164 |
| shaft | 18 | 29 | 19 | 14 | 154 | 164 |
| mines | 10 | 24 | 11 | 14 | 133 | 139 |
| biolabs | 17 | 30 | 19 | 14 | 154 | 164 |
| security | 15 | 27 | 16 | 14 | 146 | 155 |
| core | 9 | 24 | 12 | 14 | 133 | 139 |

The new props reuse existing instanced kinds (box, cyl, cone, glow, glowCyl, pulse, fg), so they add zero meshes. Only the spark `Points` object is new (1 draw, visible only in Meltdown). The estimator ignores frustum culling, so it is an upper bound for static structure.

## Mines 401 investigation

- Mines has the fewest static meshes (133 estimated). Nothing in the mines layout scales with prop count: all decor props are instanced, back walls are one mesh per room, stalactites are cone instances.
- The old reading of 401 never reproduced (R5 headless: 138 to 176). Likely sources, none from sector structure:
  - `renderer.info.autoReset = false` and `info.reset()` runs once per frame before `composer.render()`. The count therefore includes the shadow pass (casters drawn twice) and every composer pass (RenderPass, bloom mip chain, OutputPass, post pass), roughly 15 to 25 fullscreen draws.
  - Live actors and fx pools (enemy rigs are multi-mesh, gibs, projectile pools) are not in a static estimate; the 70 allowance is a guess.
  - A telemetry read taken mid-frame or after a path that skips `info.reset()` would also inflate the number.
- No code fix was made because nothing reproducible was found. Next step in a browser: log `perf.byGroup` per frame in mines and compare against the estimator rows above.

## Meltdown hook

`scene3dFull` calls `decor.setMeltdown(inMeltdown, tSec, reduceMotion)` right before `decor.update`. The vista already had its own `meltdown` uniform. No new lights; the existing alarm light still does the sweep.
