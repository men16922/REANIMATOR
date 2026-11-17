# R14 Terrain quality pass

Complaint: the map terrain assets look crude. Meshy was unreachable (DNS failure, no key), so this pass is procedural and render-only.

## What changed

- `src/render3d/terrainMaps.ts`: kind-specific detail passes and a Sobel normal map generator.
  - Seven surface textures (rock, concrete, clean tile, security panel, rust metal, bulkhead wall, deck) are redrawn at 512 px from the old 256 px base. Added layers: rock strata, chips and mineral veins; concrete formwork seams, tie holes with rust bleed, aggregate pits and cracks; beveled tiles with grout and chips; armored panel insets with hex bolts and stencil; flaking rust and weld seams; corrugated bulkhead with joints and bolt rows; diamond tread on deck plates.
  - Each gets a height-derived normal map (`rockNormal`, `concreteNormal`, `cleanTileNormal`, `panelNormal`, `rustMetalNormal`, `wallNormal`, `deckNormal`). Without pixel access (stub DOM in tests) the normal is `null` and materials fall back to the old bump or plain look.
- `src/render3d/terrainDetail.ts`: low-poly relief merged into one mesh per sector and 16 m strip (18 meshes, about 9.8k triangles for the whole level).
  - Mines: faceted boulders and rubble on floors, ledge fascia chunks, wall outcrops, stalactites under the ceiling slab, a few acid-green crystal spikes.
  - Other sectors: structural ribs with cap and base flanges plus a conduit on tall walls; front-edge conduit with brackets and a service strip on floors and catwalks.
  - Vertex colored, flat shaded, no shadow casting, no lights.
- `src/render3d/scene3dFull.ts`: normal maps wired into wall and floor materials (batched and individual); detail meshes added in `ensureWorldBuilt` and culled by the view window like the solid batches. They live under the level roots, so `teardownLevel` frees them.
- `src/render3d/drawBudget.ts`: the estimator counts terrain strips (`terrain` field) in each sector total.
- Tests: `tests/terrain-detail.test.ts` (deterministic, every sector covered, triangle and strip budget, level not mutated); `tests/draw-budget.test.ts` gains a terrain strip assertion.

## Constraints

- Collision solids, `map.ts`, sealed engine files and fixtures are untouched. Relief sits on the front plane or on top of existing solids and is never read by the sim.
- No new lights. At most 12 terrain strips per sector window (asserted); the per-sector total stays under the 300 budget (asserted by `tests/draw-budget.test.ts`).
- Classic View renders the same scene to the 320x200 palette target, so the added relief is quantized with the rest. Not visually checked (see below).

## Verification

- `make check`: exit 0 (tsc, node tests including the new ones, reference-verify, reach, reach3d, vite build, dist-guard PASS: 13 files, 14,888,667 B).
- Visual capture: unverified. A dev server could not be started from this agent shell and headless Chrome aborts (SIGABRT) under the sandbox, so `docs/evidence/r14_terrain/` has no screenshots. Start the dev server on 5201 and check mines, biolabs and the shaft, in both Normal and Classic View.
- Real WebGL draw-call numbers are unverified; the code-level estimator is the guard.

## Possible follow-up

If Meshy becomes reachable, generated rock and wall tiles can replace the canvas bases in `textures3d.ts` without touching the relief or material wiring.
