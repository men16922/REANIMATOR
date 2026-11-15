# R13 combat track: Core Warden readability and enemy run gait

Display-side only. No edits to `src/game3d`, sealed files, or popup layout. No new lights.

## Problem

- In the Core Vault phase II fight the Warden read as a brown/orange blob. Its albedo was only darkened to 0.62, the rim was orange (`0xffa070`, 0.14) and a whole-body emissive wash in the phase colour (orange in phase II) matched the orange arena light.
- Rigged enemies (Bio-Stalker, Warden) ran awkwardly. A probe of a Bio-Labs chase showed two causes:
  1. `stepGroundSpeed` was almost unfiltered. Single-frame snaps from enemy separation, step-ups and knockback read as 30 to 47 m/s and pushed the gait cycle rate to 12 to 18 Hz for one frame, which kicks the legs a quarter cycle.
  2. Aggro chase speed reaches 9.6 m/s against a run reference of 5.5 m/s, so the run clip played at 1.75x. Between 2.6 and 4.6 m/s a 1.6x walk was mixed with a slow run.

## Changes

### Core Warden (`wardenLook3d.ts`, `wardenLookGfx3d.ts`, `riggedModels.ts`, `scene3dFull.ts`)

- Armour albedo x0.4 (gunmetal), metal 0.82.
- `applyWardenLook3D` replaces the shared rim for the boss: a cool rim (`0x9fd8ff`, 0.55) plus procedural armour seams and a chest core, computed in normalised mesh-local space so they ride the skinned body. The GLB has no emissive map, so the seams are procedural.
- Seam and core colour follow `BOSS_PHASE_COLORS` (I cyan, II orange, III red) through per-frame uniforms. Windup shifts them toward red (or purple for summon). The whole-body phase wash is gone; windup keeps a faint wash for the telegraph.
- When `exposedTicks > 0` the core turns gold-white (core 3.2, seams dimmed to 0.6x) and an additive flare sprite shows on the chest. It fades over the last 10 ticks. The flare is hidden at all other times.
- A cool steel-blue additive halo sprite sits behind the Warden for silhouette contrast against the orange arena.
- Cost: 2 sprites (2 draw calls in the boss scene while visible), no lights.
- Pure rules in `wardenLook()`; tests in `tests/warden-look.test.ts`.

### Run gait (`enemyRig3d.ts`)

- `stepGroundSpeed` caps readings at 14 m/s and slew-limits them (rise 120 m/s^2, fall 240 m/s^2; the sim accelerates at about 45 and stops at about 170). In the probe the peak cycle rate dropped from 18 Hz to 3.4 Hz.
- `sprintStretch`: above the run reference the stride grows with sqrt(speed / runRef), capped at 1.25. A 9.6 m/s chase now plays the run clip at 1.40x instead of 1.75x. Trade-off: at that speed the clip's feet slip by up to about 20% against the ground. This is a deliberate choice of slight slip over a sped-up leg cycle.
- Stalker walk to run blend band moved from 2.6..4.6 to 2.0..3.6 m/s, so a 3.8 m/s chase is a pure run.
- Bot playthrough skate frames (stride 1): 10 before, 2 after (`RIG_STATS=1`, `tests/enemy-rig.test.ts`).
- Tests: `tests/r13-gait.test.ts`.

## Evidence

- `docs/evidence/r13_combat/boss_phase2.png`: showcase `boss` (phase II), dev server, Playwright MCP.
- Run gait was not inspected visually in a browser. The evidence for it is the probe numbers and the tests above.
