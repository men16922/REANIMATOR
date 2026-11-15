# R15 Meshy terrain kit (pipeline ready, generation pending)

Date: 2026-11-15

## Outcome

No assets were generated. The Meshy API was unreachable from the agent sandbox.

- Probe: `GET https://api.meshy.ai/openapi/v1/balance` with the key from `.env` (key not printed).
- Result: `curl: (6) Could not resolve host: api.meshy.ai`, HTTP status 000 (DNS failure). Credits unknown.
- The terrain stays procedural (R14: `terrainMaps.ts`, `terrainDetail.ts`, `decor3d.ts`, `drawBudget.ts`). Manifest, ASSET_REGISTER, sim, bot pins and reach3d are unchanged.

## Secrets

- `.env` (holds `MESHY_API_KEY`) is now gitignored (`.env`, `.env.*`, except `.env.example`).
- The key is not in any committed file.

## Meshy MCP in Kiro

Not added. The sandbox returned `EPERM` on `~/.kiro/settings/mcp.json` (backup copy and write blocked), and the file was not modified. To add it manually, merge into `mcpServers` of `~/.kiro/settings/mcp.json`:

```json
"meshy": {
  "command": "npx",
  "args": ["-y", "@meshy-ai/meshy-mcp-server"],
  "env": { "MESHY_API_KEY": "<value from .env>" }
}
```

Keep this out of the workspace so the key is not committed.

## Planned kit (for a run with network access)

Sci-fi wall panel, floor grate tile, support pillar, pipe cluster, girder, platform edge trim, mines rock chunk, timber brace, specimen tank, security bulkhead frame, core reactor conduit. Low poly, textures 512 to 1024, optimised with gltf-transform, registered in the manifest and ASSET_REGISTER, instanced per sector, at most 300 draw calls per sector, no new PointLights, collision unchanged, dist-guard must pass.

## Run it (R15b pipeline, needs network)

```
make meshy-terrain            # or: node tools/meshy/terrain-kit.ts   (npm run meshy:terrain)
make meshy-terrain ARGS=--dry-run   # prints the plan, no network, no writes
```

Options: `--only wall-panel,steel-girder` (subset), `--skip-optimize` (stop after download).

What it does: reads `MESHY_API_KEY` from `.env`, checks the balance (aborts if below 30 credits per remaining piece), queues a text-to-3D preview then a refine (texture, no PBR) per piece, polls until done, downloads raw GLBs to `assets/meshy-raw/terrain/` (gitignored), optimizes them (weld, simplify to the target poly count, WebP 512, longest side normalized to 1) into `public/assets/models/terrain/*.glb`, upserts `terrain/<id>` entries in `reference/manifests/meshy-assets.json` (schema v2, prompt, task id, tris, bytes, sha256) and rewrites the marked terrain section of `docs/reference/ASSET_REGISTER.md`.

Resumable: task ids go to `reference/manifests/terrain-kit-state.json` (no secrets). Re-running skips finished steps; failed pieces are recorded and retried on the next run.

Next after it finishes: review the GLBs, run `make check` (dist-guard), commit the assets, then wire them into the renderer (instanced, at most 300 draw calls per sector). The pipeline does not touch the renderer.

## Meshy MCP in Kiro (still manual)

The sandbox also blocked creating `.kiro/settings/` in the workspace. Add the `meshy` block shown above to `~/.kiro/settings/mcp.json` yourself. `.kiro/settings/mcp.json` is gitignored in case you put it in the workspace.

## Sample comparison (wall panel, one piece, two quality tiers)

Date: 2026-11-15. Same prompt (modular sci-fi industrial wall panel, dark gunmetal, rust, hazard stripe), both refined with PBR textures. Raw files are in `assets/meshy-raw/terrain/` (gitignored). Optimized files are in `public/assets/models/terrain/samples/`. Numbers come from `node tools/meshy/terrain-samples.ts` (output `docs/evidence/r15_meshy_terrain/samples.json`). Same steps as `terrain-kit.ts` `optimizeOne` (weld, simplify error 0.5, WebP q82, center, longest side 1), with texture size and triangle target as parameters.

| Model | Credits | Raw tris / size | Optimized tris / size | Textures | Notes at game distance |
|---|---|---|---|---|---|
| A: meshy-t2.5 smart topology 4000 | 5 + 10 = 15 | 3,864 / 5.36 MB (3x 2048 JPEG) | 3,864 / 210 KB (512) or 305 KB (1024) | base color, metal-rough, normal | Clean silhouette and bevels, texture reads well. The model came out as a thick equipment crate (0.95 x 0.70 x 0.53), not a flat wall panel. 512 vs 1024 is hard to tell apart at 13.5 m. |
| B: meshy-7.1 standard, raw | 20 + 10 = 30 | 328,758 / 15.52 MB (3x 2048 JPEG) | not shipped (9.8 MB at 512, 9.9 MB at 1024) | same | Best look: flat panel (1.90 x 1.12 x 0.23), crisp rivets, vent, hazard stripe. Far too heavy for the 300-draw-call, many-instance budget. |
| B simplified to ~4k | same | same | 4,502 / 304 KB (512) or 403 KB (1024) | same | Same-budget comparison. The simplifier (error 0.5, border unlocked) crumples the surface, and the normals turn noisy with cyan rim artifacts. Geometry detail was baked into the normal map and the low mesh does not match it. Worse than A at game distance. |

Screenshots (Playwright MCP, dev page `compare.html`, game lighting: hemisphere + sun + cyan rim, ACES 1.4, fog):
- `docs/evidence/r15_meshy_terrain/compare_close.png` (A 512, A 1024, B 4k 512, B 4k 1024, B raw)
- `docs/evidence/r15_meshy_terrain/compare_game.png` (camera z 13.5, fov 38, each model scaled to 3 m wide)

Node Chrome could not launch in the sandbox (`kill EPERM`), so the page `compare.html` at the repo root is rendered through the Playwright MCP browser on the dev server (`/compare.html?mode=close|game`). It is not part of the Vite build (only `index.html` is).

### Projection for 10 more pieces

| Tier | Credits (10 pieces) | Dist added | Risk |
|---|---|---|---|
| A: t2.5, 4000 tris, WebP 512 | 150 | about 2.1 MB (3.1 MB at 1024) | Prompt must say "flat, shallow depth" so shapes do not come out as crates. |
| B: 7.1, simplified to ~4k | 300 | about 3.0 MB (4.0 MB at 1024) | Visibly crumpled at 4k; doubles the cost for a worse result. |
| B: 7.1 at about 20k+ tris | 300 | not measured, expected several MB each | Needs a gentler simplify (lower error, locked borders) and a re-test. |
| B raw | 300 | about 98 MB | Not viable. |

### Recommendation

Use tier A (meshy-t2.5 smart topology, target 4000, WebP 512) for the remaining pieces: half the credits, the smallest files, and clean low-poly shapes that hold up at 13.5 m. Constrain prompts toward flat, shallow-depth pieces. Use 7.1 only for a few hero pieces if a gentler simplify (about 15 to 20k tris) is tested first. Not yet wired into the renderer.
