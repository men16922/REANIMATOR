# R9 Parry and Scan Pulse

Two Metroid Dread style additions that Abuse lacks. Both are opt-in by input, so a run that never presses the keys is tick-identical to a build without them.

## Melee Counter (parry)

- Keys: `X` or `C`. Edge-triggered (`InputState3D.counter`).
- Window: the last `PARRY_WINDOW_TICKS` (8, about 0.13 s) of a crawler or stalker lunge windup. The renderer blinks the foe white while `parryOpen` is set.
- Hit (within `PARRY_REACH` 3.6 m): foe staggers 50 ticks, takes 45 damage, drops a med or ammo pickup (not from hive larvae, which respawn and would farm drops), the player gets 24 ticks of invulnerability and a free dash. Sound `combat.parry`, event `parry`, hit-stop, short slow-mo, "COUNTER" popup.
- Miss: `parry_whiff` event and a 30 tick lockout.
- Onboarding hint appears when a crawler or stalker winds up nearby (never for spitters or the warden) and retires after about 10 s of display or the first X press.

## Scan Pulse

- Key: `Z`. Edge-triggered (`InputState3D.scan`). The HUD pill `SCAN [Z]` reads READY, ACTIVE or the cooldown in seconds.
- Sim state (`PlayerState3D`): `scanTicks` (reveal flag, `SCAN_TICKS` 240 = 4 s), `scanCooldown` (`SCAN_COOLDOWN_TICKS` 600 = 10 s from the press), `scanPrev`. Nothing in movement, combat, doors or AI reads them.
- `scanTargets3D(w, radius = SCAN_RADIUS 14 m)` is a pure query (nearest first, optional reusable `out` buffer so the renderer allocates nothing per frame) over unbroken breakables (`breakId`), unfound secret-room walls and untaken pickups.
- Renderer (`metroid3d.ts`): while the flag is set, a pool of 10 edge outlines (amber for secrets first, then cyan for breakables, each nearest first) and 10 rings (pickups) is shown, pulsing and fading with the timer. Existing basic line and mesh materials, no new lights, at most 20 extra draw calls, none when idle. `reduceMotion` removes the pulse.
- Sound `world.scan` on the `scan` event.

## Verified (make check exit 0)

- Scan timer, cooldown, edge-only trigger and determinism over 1500 ticks (`tests/game3d.test.ts`).
- Radius query: inside and outside radius, broken blocks, found secrets, taken pickups.
- Scan presses leave enemies, HP, player position and pickups unchanged.
- Sound bank covers every event (53 events, `tests/audio.test.ts`). Flat placeholder box scan passes.
- Bot result and reach3d unchanged (no input path uses `counter` or `scan`).

## Unverified

- Browser visuals (parry flash, scan outlines and rings, HUD pill), audio feel and the key bindings in a real browser. Chrome cannot run in this environment.
- Parry window timing as a human-feel value (8 ticks is a design guess, not playtested).
- Draw call count with scan active is estimated from the pool size, not measured.

## Key bindings after the R9 merge (decision)

Audit of `src/ui/main.ts` key handlers. Only the `keydown` handler maps `KeyX`, `KeyC` and `KeyZ`. Crawl Slide has no key of its own (it triggers from the existing crouch/move input in tunnels), so nothing else claims these keys.

| Key | `playing` | `result` (death/win screen) |
| --- | --- | --- |
| `X` | Melee Counter | none |
| `C` | Melee Counter | Resume at Save (button label "Resume at Save (C)") |
| `Z` | Scan Pulse | none |

The result-screen `C` handler runs first and returns before the playing-only handlers, and the playing handlers are skipped when `mode !== 'playing'`. Each key therefore has one meaning per context. `X` is the unambiguous counter key, `C` is a secondary alias in play only. No code change was needed.

## Integration notes

- `scanTargets3D` now classifies a solid by its gate (`breakId ?? doorId`). A gate that is also the `doorId` of an unfound secret room (the Security lean wall `break_lean_security`) is listed under `secrets` (amber), not `blocks`. Covered by `tests/abuse9.test.ts`.
- Sound event counts: parry adds 3 events (50 to 53), abuse adds pickup recipes; `tests/audio.test.ts` merged without change.
- Browser checks (Chrome unavailable): unverified.
