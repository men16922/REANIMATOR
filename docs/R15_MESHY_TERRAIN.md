# R15 Meshy terrain kit (blocked)

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
