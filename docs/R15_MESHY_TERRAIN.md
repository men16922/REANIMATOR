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
