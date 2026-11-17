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

### Run gait, part B (steering: running still looked awkward)

- Moving flag has hysteresis (start above 0.5 m/s, stop below 0.25), so a speed hovering near the old 0.35 threshold no longer flickers between idle and run.
- Stalker run posture: `runLean` tilts the spine forward up to 0.22 rad and lowers the head, `runBob` dips the hips twice per gait cycle (up to 4.5 cm), arms swing slightly forward. Both scale with speed and vanish at rest or during windup and strikes.
- A sprinting stalker (above 3 m/s) turns its body at 8 rad/s instead of 5.5, so it faces its run direction sooner (still under the 12 rad/s cap checked by `enemy-rig.test.ts`).
- Not inspected visually in a browser; the evidence is the tests.

## Evidence

- `docs/evidence/r13_combat/boss_phase2.png`: showcase `boss` (phase II), dev server, Playwright MCP.
- Run gait was not inspected visually in a browser. The evidence for it is the probe numbers and the tests above.

## Per-weapon hit feedback and per-kind deaths (FEAT-003)

Display only: `fx3d.ts`, `vfxStyle3d.ts`, `gore3d.ts`. No sim edits, no popup layout edits, no new lights.

- `FxDirector.inferWeapon` tags each tick's damage: new beam is rail, a vanished player projectile gives pulse, scatter, grenade or rocket, a new explosion gives grenade or rocket, otherwise the equipped slot (flamer burn ticks land here).
- `WEAPON_IMPACT` (vfxStyle3d): pulse cyan star, scatter wide orange pocks, grenade and rocket fire flash plus debris (rocket larger), rail violet narrow streak with the longest hit-stop (5 frames), flamer drifting embers with no hit-stop. Each weapon has its own colour, hit-stop and trauma. Reduce motion halves sparks, drops the weapon hit-stop and scales trauma by 0.4.
- Warden variants: exposed weak point gives a gold-white `crit` burst (22 sparks, ring 1.5, longer freeze). Armoured gives a cold `ping` fan and ring with no gore or fluid.
- Deaths (`DEATH_STYLE`): crawler 1.6x chunks and fluid; spitter unchanged; stalker slower chunks (0.65x), 5-frame freeze, longer slow-mo and a dust slump; hive pop spawns a crawler gib wave, acid steam and a freeze on `hive_destroyed`; Warden death sequence adds up to 8 sequential gib waves (3 to 5 chunks each) to the chained explosions. Waves use `GoreSim.spawnWave`, pooled in `ChunkPool` (160) and `DecalPool` (96), seeded RNG, `goreScale` respected.
- Tests: `tests/r13-impact.test.ts` (distinct weapon styles, crit and armour variants, per-kind deaths, pool capacity after 40 staged kills, determinism, bot-run inference).

## Verification

- `make check` exit 0 (bot pins and reach3d unchanged, dist-guard PASS).
- Unverified: weapon hit and death visuals were not captured in a browser (Playwright runner cannot launch Chrome here); only the boss phase II screenshot exists.
