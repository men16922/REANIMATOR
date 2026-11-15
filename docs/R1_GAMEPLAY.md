# R1 gameplay depth (track D, branch `r1/gameplay`)

Controls (existing key map, no UI change): Space jump, A/D move, Shift or RMB dash, S/Down drop through / stomp modifier, LMB fire, 1-4 weapon, E interact.

| Mechanic | How | Notes |
|---|---|---|
| Wall slide | Airborne, press into a wall | Caps fall speed at 3.2 m/s, all players |
| Wall jump | Space while sliding | Needs Thruster Boots (so it cannot bypass a boots gate) |
| Dash cancel | Space during a dash | Keeps 62% dash speed, spends a jump; event `dash_cancel` |
| Stomp | Airborne Shift + S | Dives at 27 m/s, landing blast radius 3 m, 60 dmg, 20 tick stagger, refunds dash on hit; event `stomp` |
| Rail charge | Hold LMB, release | 48 ticks full charge, auto-fires at full; 125 -> 260 dmg, wider beam |
| Scatter | Close range | Up to 1.7x damage and heavy knockback inside 5 m, falls to 0.55x past 9 m |
| Matchups | `WEAPON_MATCHUP_3D` | Crawler weak to Scatter, Stalker armored vs Pulse (0.7x) but weak to Grenade/Rail, Spitter weak to Pulse |
| Combo | Kills within 180 ticks | Each kill refunds the dash, 3+ chain heals 5 HP (not during meltdown); event `combo` |
| Core Warden | 3 phases at 2/3 and 1/3 HP | See below |
| Secrets | 2 Cracked Bio-Walls (yellow, Grenade) | Cryo Alcove west of spawn, Roof Cache above the airlock (reach the shaft upper deck with Boots) |
| Data logs | 6, one per sector | Pickup range 1.25 m x 1.4 m |
| Extraction ambush | Meltdown | Dead slots `e-esc-*` revive along the escape route, med kits go offline, enemy damage x1.3 |

## Core Warden

Patterns cycle deterministically per phase (`WARDEN_CYCLE_3D`), every one has a windup and raises `boss_telegraph`:
- Phase I: slam (shockwave, jump it), volley (5 plasma). Slam leaves a weak-point window.
- Phase II: charge (locked heading, ground-level only; dash through or jump onto a platform; wall crash exposes it), volley (7), slam.
- Phase III: barrage (3 rings, alternate flat lane / gap), charge, summon (revives 2 hidden crawlers `e-core-m1/2`).
Exposed window (`warden.exposedTicks > 0`, `state === 'stagger'`): damage x2; guarded damage x0.8. `warden.bossPattern` names the current attack for renderers/UI.

## World fields

- `w.collectibles[]` `{id, kind:'log', sector, title, x, y, z, taken}`
- `w.completion` `{percent, found, total, logsFound, logsTotal, secretsFound, secretsTotal, upgradesFound, upgradesTotal, weaponsFound, weaponsTotal}`
- `w.secretsFound: string[]`
- `w.combo` `{count, ticksLeft, best}`
- `w.run` `{deaths, damageTaken, bestCombo, stomps, wallJumps, score}`
- `w.player.railCharge` (0..`RAIL_CHARGE_TICKS`), `w.player.kills`
- `getRunSummary3D(w)` -> `{clearTimeTicks, clearTimeSeconds, deaths, kills, collectiblesFound, collectiblesTotal, completionPercent, secretsFound, bestCombo, score, rank, won}`
- Enemy: `bossPattern`, `patternIndex`, `exposedTicks`, `chargeDir`, `barrageLeft`, `meleeCooldown`, `minion`; `phase` is `1|2|3`.
- Body3D: `wallDir`, `stomping`, one-tick flags `wallJumped`, `dashCanceled`, `stompStarted`, `stompLanded`.

## Events (`w.events`, `SoundEvent3D {type, value?}`)

`wall_jump`, `dash_cancel`, `stomp`, `combo` (value = chain), `boss_telegraph` (value = cycle index), `boss_charge`, `boss_summon` (value = count), `boss_phase` (value = phase), `boss_exposed` (value = phase), `collect` (value = log index), `secret` (value = found count). Mapped to existing sound recipes in `src/ui/audioLogic.ts` until dedicated ones exist.

## Difficulty

Sector damage x0.8 / 1.0 / 1.2 / 1.4 / 1.6 / 1.7 and enemy HP x0.85 / 1 / 1.1 / 1.3 / 1.45 / 1.55 (airlock..core). Warden HP 2600.
Bot (`tools/game/playthrough.ts`): won, 4213 ticks (70 s), min HP 88, total HP lost 95, final HP 122 of 160, 0 deaths.
Reckless probe (`tools/game/difficulty.ts`, 3600 ticks): HP lost 172, deaths 1, stalls near x 41 (was 248 / 2).
