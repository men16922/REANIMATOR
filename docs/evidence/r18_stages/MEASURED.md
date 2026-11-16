# R18 stage verification: measured draw calls

Measured 2026-11-16 in the Playwright MCP browser (Chromium, 1200x900 viewport, WebGL2) against the Vite dev server
(`http://localhost:5173`). Value = `__reanimator().perf.drawCalls` (three.js `renderer.info.render.calls`, includes the
shadow pass). Budget: 300 per sector.

## Method

- Sectors: the player was placed with `__reanimatorAdvance([{}], {x, y, hp: 100}, {continue: true})` every 3 m across each
  room at floor, 2.2 m and 4.4 m heights (Stage 1 at that sector's floor heights), 140 ms settle per probe, maximum kept.
  Foes nearby are live, so these are idle-to-light-combat numbers.
- Showcase scenes: `__reanimatorShowcase(name)`, then 50 samples at 100 ms; the maximum is kept. These are the stress
  cases (combat: Scattergun held down into three foes, with muzzle flash, tracers, sparks and gore).

## Showcase scenes (worst case, after the R18 fixes)

| Scene | Before (R17) | After |
|---|---:|---:|
| combat (biolabs) | 305 (peaks to 313) | 294 |
| biolabs | 299 (peaks to 305) | 276 |
| security | 295 | 275 |
| mines | 247 | 236 |
| bestiary (mines) | 200 | 193 |
| escape (airlock) | 199 | 190 |
| boss (core) | 181 | 177 |
| slide (shaft) | 189 | 177 |
| opening (airlock) | 179 | 170 |
| classic (shaft) | 169 | 169 |

## Stage 1: Cryo Facility (sector sweep)

| Sector | Max | At (x, y) |
|---|---:|---|
| airlock | 155 | -8, 0 |
| shaft | 205 | 28, -11 |
| mines | 204 | 12, -8.6 |
| biolabs | 258 | 58, 4.4 |
| security | 251 | 43, 8.8 |
| core | 158 | 74, 0 |

## Stage 2: Foundry Line (room sweep)

| Room (sector) | Max | At (x, y) |
|---|---:|---|
| Cargo Dock (airlock) | 127 | 19.5, 0 |
| Conveyor Hall (shaft) | 143 | 32.5, 4.4 |
| Slag Pits (mines) | 135 | 68.5, 0 |
| Culture Vats (biolabs) | 156 | 94.5, 4.4 |
| Control Spine (security) | 149 | 128.5, 4.4 |
| Furnace Gate (core) | 152 | 160.5, 2.2 |

### Stage 2 re-measure after the Slag Foreman (2026-11-16)

Same method, every 3 m at floor, 2.2 m and 4.4 m. Max per area: Cargo Dock 140, Conveyor Hall 139, Slag Pits 134,
Culture Vats 153, Control Spine 145, Furnace Gate 148 (at 162, 2.2). Standing near the Foreman through windup, attack
and recover (ticks stepped with `__reanimatorStep`): 135. All under 300. Close-up: `foreman_lunge.png` (Foreman bar,
floor shockwave strip, Scattergun/Grenade fire).

## Stage 3: Reactor Spire (room sweep)

| Room (sector) | Max | At (x, y) |
|---|---:|---|
| Breach Hall (airlock) | 127 | 19.5, 0 |
| Cryo Stacks (shaft) | 146 | 34.5, 4.4 |
| Drain Tunnels (mines) | 139 | 92.5, 4.4 |
| Hatchery (biolabs) | 166 | 101.5, 4.4 |
| Power Spine (security) | 138 | 170.5, 0 |
| Warden Arena (core) | 133 | 188.5, 4.4 |

Every measured value is at or under 300. The highest is the combat showcase at 294.

## What changed to get there

- Rigged foes skip frustum culling, so every visible foe was drawn again in the shadow pass even when it was outside the
  sun's shadow box. Foes now cast shadows only within 7.5 m (x) and 5 m (y) of the camera focus. This is render-only.
- Blast pillars no longer cast shadows (they sit on the back plane, and their shadow was hardly visible).
- Weapon pedestal guns no longer cast shadows. Each pickup lost its separate ground decal plane; the pad plane is now larger instead.
- Static hazard pieces (merged per room) and the exit hatch are now view-culled like the other scenery.

## Functional checks in the same session

- Title > Stages: with a fresh save, Stage 2 and 3 are disabled ("Clear stage N-1 to unlock"). After Stage 1 is
  cleared, Stage 2 opens. After all three are cleared, all rows show BEST times, and this persists across reload
  (`reanimator.stages.v1` in localStorage).
- Stage 2: the title card shows (STAGE 02). All six levers open their door or bridge (conveyor, slag gantry, vat
  gantry, spine A/B, furnace) when the player presses interact within reach. The exit teleporter wins the world, and the
  clear screen shows TIME, KILLS n/58, BEST, COMPLETE and "Next stage: Reactor Spire".
- Stage 3: the title card shows. The Warden arena renders with the Warden bar. Pressing interact at the pad while the
  Warden lives keeps play going and shows "TELEPORTER LOCKED. DESTROY THE CORE WARDEN". After the Warden dies, interact
  wins. The clear screen has no Next-stage button.
- Bug fixed: the HUD objective line in Stages 2 and 3 read "OBJ: Shatter the Reactor Core!" (Stage 1 text). It now
  reads "OBJ: Reach the exit teleporter and press interact" (Stage 2, and Stage 3 after the Warden) or "OBJ: Slay the
  Warden to unlock the exit teleporter" (Stage 3 before). Covered by `tests/stage-flow.test.ts`.
- Console: no errors after the last reload.

The clear times in the screenshots (00:00.6, 01:02.1) come from the debug teleports and are not real play times.

Not run here: a full human playthrough of Stage 2 or 3 (unverified). The levers and exits were driven by debug
teleports. Gantry pits and the furnace gauntlet were rendered and seen in screenshots, not played through.

## Screenshots

`stage_select_locked.png`, `stage_select_unlocked2.png`, `stage_select_all_cleared.png`, `stage2_title_card.png`,
`stage2_slag_gantry.png`, `stage2_clear.png`, `stage3_title_card.png`, `stage3_hatchery.png`,
`stage3_warden_arena.png`, `stage3_clear.png`, `foreman_lunge.png`.
