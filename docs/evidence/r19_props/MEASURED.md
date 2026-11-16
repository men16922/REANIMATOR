# R19 stage props: measured

Measured 2026-11-16 in the Playwright MCP browser (Chromium, 1200x900, WebGL2) against the Vite dev server. Value is `__reanimator().perf.drawCalls`, method as in `docs/evidence/r18_stages/MEASURED.md` (player placed every 3 m at floor, 2.2 m and 4.4 m, 140 ms settle, maximum kept). Budget 300 per sector.

## Props (Meshy meshy-t2.5 smart topology 4000, PBR refine, 15 credits each, optimized to WebP 512)

| Piece | File | Tris | Size | Placed size (longest side) | Normalised bounds (longest = 1) |
|---|---|---:|---:|---|---|
| foundry-conveyor | `public/assets/models/terrain/foundry-conveyor.glb` | 3,403 | 229,644 B | 4.6 m (about 0.48 m tall, 0.74 m deep) | 1.00 x 0.10 x 0.16 |
| slag-crucible | `public/assets/models/terrain/slag-crucible.glb` | 4,000 | 187,492 B | 2.5 to 3.5 m | 0.85 x 1.00 x 0.75 |
| coolant-column | `public/assets/models/terrain/coolant-column.glb` | 3,940 | 198,264 B | 3.0 to 4.4 m | 0.23 x 1.00 x 0.23 |

Glow is emissive only (`applyKitGlow`: emissive colour times the albedo map, so only the bright molten or coolant texels glow). No lights added.

## Placements (render only, collision unchanged, rear lane z -1.2 to -2.5, ceiling slab skipped)

| Room | Prop | Count | x positions (m) |
|---|---|---:|---|
| Stage 2 Conveyor Hall | foundry-conveyor | 3 | 32.4, 37.9, 43.8 |
| Stage 2 Slag Pits | slag-crucible | 4 | 61.5, 68.1 (basin lip), 76.8, 82.6 |
| Stage 2 Furnace Gate | slag-crucible | 2 | 159.9, 172.8 |
| Stage 3 Cryo Stacks | coolant-column | 1 | 34.8 |
| Stage 3 Power Spine | coolant-column | 1 | 144.5 |
| Stage 3 Warden Arena | coolant-column | 3 | 188.8, 190.3, 206.6 |

Stage 1 rooms are unchanged (a test asserts none of the three props appear there).

## Draw calls (max per room)

| Stage 2 room | Max | R18 | Stage 3 room | Max | R18 |
|---|---:|---:|---|---:|---:|
| Cargo Dock | 121 | 127 | Breach Hall | 123 | 127 |
| Conveyor Hall | 142 | 143 | Cryo Stacks | 146 | 146 |
| Slag Pits | 138 | 135 | Drain Tunnels | 143 | 139 |
| Culture Vats | 154 | 156 | Hatchery | 170 | 166 |
| Control Spine | 143 | 149 | Power Spine | 144 | 138 |
| Furnace Gate | 152 | 152 | Warden Arena | 148 | 133 |

All under 300. Each prop adds at most one instanced draw per 24 m strip.

## Screenshots

- `s2_conveyor_hall.png`: conveyor belt segments along the rear lane.
- `s2_slag_pits.png`: hanging slag crucibles with orange glow over the acid basin.
- `s3_cryo_stacks.png`: coolant column with cyan glowing rings at the right edge.

Note: in the Stage 3 shot the black squares at the top-left and the "ENTER / ESC: SKIP" text come from a cinematic overlay that the debug teleports re-triggered (HUD panel hidden under it). Not related to the props. Stage 3 Warden Arena was measured but not screenshotted.
