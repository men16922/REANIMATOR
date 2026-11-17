# R3 foes: Abuse-style ambush, swarm and spawner combat (track D, branch `r3/foes`)

Mechanics are newly designed. No original Abuse code or data is used; only movement physics is a restoration.

## Mechanics

| Mechanic | Behaviour | Telegraph / fairness |
|---|---|---|
| Dropper (`variant: 'dropper'`) | Crawler hanging on a ceiling. Idle until the player is within 2.0 m horizontally, below it, with a clear line. | 28 tick windup (`DROP_WINDUP_TICKS_3D`): body trembles, grit falls. Then it lets go, flips upright in flight, hits once mid-air (12) or on touchdown (14), never both. Shooting it off the ceiling makes it fall harmlessly. |
| Climber, ceiling | Crawls along the ceiling toward the player (3.4 m/s x sector tempo) inside `[crawlMin, crawlMax]`, windups and drops when above. | Same 28 tick windup. |
| Climber, wall | Crawls up/down a wall to the player's height, windups, leaps off the wall (`wallDir`) at 7.5 m/s. | 24 tick windup (`LEAP_WINDUP_TICKS_3D`). |
| Hive | Destructible nest on the floor. Every 150/tempo ticks it revives one dead larva slot (2 per hive = concurrent cap) while the player is in its sector and within 30 m. 220 base HP x sector HP scale. Weak to Grenade (x2.2), Rail x1.3, Scatter x0.9, Pulse x0.8. | Larvae pop out with a hop; hive swells and glows on each birth. Destroying it stops spawning, drops an ammo pickup, counts as a kill (combo, +200 score). |
| Swarm (crawlers) | About half the pack (hash bit) flanks: it runs past the player to the side opposite its home before attacking. Bodies within 0.95 m repel each other. At most 2 crawlers are in windup/attack at once. | A flanker that is blocked for 8 ticks gives up and fights normally. |
| Tempo | Move speed and attack cadence scale by sector: airlock 0.95, shaft 1.05, mines 1.12, biolabs 1.2, security 1.3, core 1.4 (`SECTOR_TEMPO_3D`). Does not apply to the Warden. | Windup lengths never change. |

Layout: 4 hives (mines 1, biolabs 2, security 1, none elsewhere), 11 ceiling/wall crawlers (ids `e-drop-*`, `e-climb-*`), appended after the original roster so earlier tests keep their order. Larva slots are `e-hive-<hiveId>-<n>` (`minion: true`, hidden while dead).

## New fields

- `EnemyState3D`: `variant` (`'none' | 'dropper' | 'climber'`), `surface` (`'floor' | 'wall' | 'ceiling'`), `surfaceAngle`, `wallDir`, `crawlMin`, `crawlMax`, `dropping`, `leapVx`, `hive`.
- `surfaceAngle` (radians, rotation about world Z, smoothed 0.3 rad/tick by the sim): body up-vector is `(-sin a, cos a)`. Floor 0, ceiling PI, wall with open space east -PI/2, west +PI/2. Gameplay `y` is always the bottom of the body box, so the renderer pivots about the box centre.
- `w.hives[]`: `HiveState3D { id, zone, x, y, z, radius, height, hp, maxHp, alive, active, spawnTimer, spawnCount, hitFlashTicks, spawnFlashTicks }`.
- `Level3D.hives: HiveSpawn3D[]`; `EnemySpawn3D` gains optional `variant`, `surface`, `wallDir`, `span`.
- Constants: `DROP_WINDUP_TICKS_3D`, `LEAP_WINDUP_TICKS_3D`, `CLIMB_SPEED_3D`, `HIVE_HP_3D`, `HIVE_CAP_3D`, `HIVE_INTERVAL_TICKS_3D`, `HIVE_FIRST_SPAWN_TICKS_3D`, `HIVE_MATCHUP_3D`, `SECTOR_TEMPO_3D`.

## Events

`enemy_drop` (value 0 on release, 1 on touchdown), `hive_spawn` (value = hive index), `hive_destroyed` (value = hive index). Mapped in `src/ui/audioLogic.ts` to `enemy.crawler.land`, `enemy.crawler.alert`, `enemy.warden.death` (borrowed recipes). `tests/audio.test.ts` event count is now 32.

## Bot and balance

- Bot gets four hold-and-clear steps (`hive mines`, `hive bio west`, `hive security`, `hive bio east`) and targets nests after live enemies (`pickThreat`).
- Bot: won, 4901 ticks (81.7 s), 0 deaths, final HP 126 of 160, min HP 86, 50 kills, all 4 hives destroyed. Baseline before this track: 4423 ticks, HP about 122.
- `tools/game/difficulty.ts` reckless probe (3600 ticks): HP lost 200, deaths 2, kills 2 (baseline 196 / 1). Still inside the existing test bound (<= 2).
- The bot shoots ceiling crawlers on sight, so droppers mostly fall off the ceiling before springing. Human players who walk in unaware see the full ambush (covered by `tests/foes.test.ts`).
- `tools/game/reach3d.ts`: boots gates (3), dash and wall-hop bypass checks unchanged and passing. New `checkFoePlacement` verifies every hive stands on floor and every hanger touches a ceiling/wall solid along its span.

## Renderer changes (minimal)

- `scene3dFull.ts`: crawlers apply `surfaceAngle` (rotation about Z around the box centre, pitch compensated by facing); simple organic hive meshes (icosahedron mound, glowing sacs, spire) from `w.hives`; the floor lunge decal is skipped for ceiling/wall windups.
- `fx3d.ts`: grit particles while a hanger winds up; bursts for `hive_spawn` and `hive_destroyed`; small shake on touchdown.

## Browser reproduction (unverified, no browser run in this track)

1. `make dev`, open the game, start a run.
2. Airlock: walk east along the ground under the bridge near x 15.5 and watch the ceiling crawler tremble, shed grit for about half a second, then drop.
3. Mines: after the green door, the nest at x 18 births larvae every 2 to 3 seconds; shoot it (Grenade kills it in one hit) to stop them. Wall crawler on the west wall near the vault.
4. Bio-Labs: ceiling climber slides along the ceiling to follow you; nests at x 48.5 and 66.5.
5. Security Deck: nest at x 58.5, ceiling and wall crawlers near the east wall.

## Tests

`tests/foes.test.ts` (14): placement, hive counts, dropper telegraph/drop/land/damage, shot-off fall, ceiling and wall climbers, hive cadence and cap, hive destruction and rewards, Pulse path, swarm separation and flanking, tempo, determinism, bot win window.
