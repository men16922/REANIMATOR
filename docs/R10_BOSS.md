# R10 Boss: Warden Counter and Set Pieces

## Warden Counter (FEAT-001)

- The R9 Melee Counter (`X`/`C`) now works on the Core Warden. Windows: the last `WARDEN_COUNTER_WINDOW` (10) ticks of a phase 2 or 3 **charge** windup and a phase 3 **slam** windup (16 ticks on Story, keyed off `diff.nearRespawn`; Normal and Hard use 10). Reach is `WARDEN_COUNTER_REACH` 7 m.
- Hit: the pattern is cancelled (no charge, no shockwave), the Warden is staggered for `WARDEN_EXPOSED_TICKS[phase] + 24` with `counterExposed` set. Damage taken in that window uses `WARDEN_COUNTER_EXPOSED_MULT` 3.0 (plain exposed is 2.0), plus a 40 point counter hit. The player gets the same 24 tick invulnerability and free dash as a normal parry. Event `boss_counter` (value = phase), plus `boss_exposed`. Sound `boss.counter`.
- Whiff outside the window reuses the parry lockout (`parry_whiff`, 30 ticks).
- Renderer: `parryOpen` blinks the Warden white (existing flash) and the telegraph core blinks gold. On `boss_counter`: 7 frame hit-stop, 0.22x slow-mo for 0.75 s, camera punch, gold ring burst, a `COUNTER!` popup, and a white-gold core flare while `counterExposed`. Reduce motion shortens everything and drops the flash and punch.
- HUD hint (`flow.ts`, id `wardenCounter`): on the first phase 2 charge telegraph, until the player presses counter.

### Determinism

The feature is opt-in by input. No code path reads `counter` unless it is pressed, and `parryOpen` is not read by any simulation decision other than `stepCounter3D`. The bot never presses counter, so it stays tick-identical.

## Set pieces and Meltdown drama (FEAT-002)

All display-side. Pure helpers in `src/render3d/setpieces3d.ts` (`meltdownIntensity`, `vignetteAlpha`, `debrisPerSecond`, `arenaSetPiece`, `hatchBeat`, `crackPath`), pooled meshes in `bossSetPieces3d.ts`, per-frame emitters in `FxDirector.setPieceTick`.

- Phase 2: floor fissures glow along the arena floor face (1 merged mesh), three vent glows and rising steam puffs.
- Phase 3: arena ambient shifts toward hot red (existing ambient light, no new lights) and ceiling debris falls across the arena.
- Meltdown: `meltdownIntensity` (smoothstep of elapsed fraction) drives a CSS screen-edge alarm vignette (`--meltdown-vignette`, `body.meltdown-alert::after`) whose pulse rate and depth grow as time runs out, and falling debris and hot streaks whose rate rises from 3 to 33 per second. The existing audio path already ramps siren period/pitch, countdown ticks and escape music layers from `meltdownTicks` (`audioDirector.ts`, `audioLogic.ts`, `escapeMusic`), so no audio change was needed.
- Hatch: the `win` event requests a 0.25x slow-mo for 1.1 s (0.7x for 0.25 s with reduce motion) and a spark burst.
- Reduce motion: no vignette pulse (steady, 60% strength), fewer debris, shorter beat.
- Draw calls: +1 mesh and +3 sprites while the fight is in phase 2 or 3 (boss scene was 142). No new lights.

### Determinism

Nothing here writes to `WorldState3D`. Particle randomness comes from the FX director's seeded display RNG, never `Math.random`. A test runs 120 ticks with and without the director attached and compares world state.

## Verification

- `make check` exit 0, 474/474 tests (460 baseline + 14 new).
- Bot: 5362 ticks, HP 112/160, 56 kills (unchanged). reach3d: 52 waypoints, 3432 ticks, escape fairness OK (unchanged).
- Sound events: 54 (was 53).

## Unverified

- Browser visuals: fissures, vents, steam, vignette strength, slow-mo feel, popup placement. Chrome is unavailable here.
- Draw call count with set pieces active is estimated (+4), not measured.
- Counter window length (10 ticks, about 0.17 s) is a design guess, not playtested.
