# R12 robust track: bot respawn routing, combat, debug hooks

Game rules are unchanged. The bot change is confined to `src/game3d/bot3d.ts`. Browser behaviour was not observed in this track (sandbox), so everything that needs a DOM or Chrome is **unverified**.

## 1. Respawn routing

Root causes of the bot getting lost after a forced defeat:

- The bot's step index stayed past the respawn point, so it walked toward objectives it had already passed.
- The save step's `done` predicate reads `lastSaveId`, so it is not monotonic. Finishing a later step does not imply an earlier save step stays done.
- The lift ride froze inputs while the bot was off the car.
- The core and warden steps used a `tolX` that did not match their steering, so they never finished.

Fix: `replan()` in `src/game3d/bot3d.ts` runs when `w.run.deaths` changes. It picks the nearest waypoint inside `[0, first unfinished objective after the latest finished one]` and walks earlier steps as plain waypoints until the frontier. The lift ride step walks off when level with the target. Warden and reactor core steps use `tolX` 0.8.

Test: `tests/bot-robust.test.ts` forces defeats at four kill schedules, `[400]`, `[1700]`, `[3500]` and `[4400, 5100]`, on Normal, Story and Hard. The old bot failed 9 of those 12 runs. A dense sweep of 93 double-kill schedules per difficulty passes.

## 2. Combat

`incomingShotTicks()` dashes on the dash i-frames when a hostile shot lands within 5 ticks. The bot also counters crawler, stalker and Warden windows that are in reach.

| Run | Old | New |
|---|---|---|
| Normal | 5522 ticks, HP 95 | 5708 ticks, HP 126 |
| Story | 5606 ticks, HP 146 | 5807 ticks, HP 160 |
| Hard | 5633 ticks, HP 48 (min 48) | 5121 ticks, HP 133 (min 100, never under the 100 base pool) |
| Hard damage taken | 320 | 81 |

Stress grid of 12 Hard variants (damage 1.35/1.6/2.0 x enemy HP 1/1.25 x tempo 1.1/1.25): old bot wins 5 of 12, new bot 12 of 12. The harsh probe (damage x1.6, tempo x1.25) is pinned in tests.

Tests and constants changed to match:

- `tests/assist.test.ts`: Normal pin 5708 ticks / HP 126, Hard HP floor 40 to 80.
- `tests/game3d.test.ts` difficulty curve: `lost >= 80` became `>= 50`, and `min < 100` became `min < maxHp`, because the bot now loses 82 on Normal.
- `SHOWCASE_REEL` ticks in `src/ui/demo.ts`: 2700 to 3000, 3950 to 4100, 5050 to 5150, 5470 to 5650.

## 3. Debug hooks

What changed (FEAT-002, `src/ui/main.ts`):

- A `debugEpoch` counter increments on every synchronous debug entry. `__reanimatorShowcase` and `__reanimatorUiAudit` capture it and stop after any await if it changed, resolving with a snapshot plus `superseded: true`. A stale async hook can no longer call `show('title')` over a world the caller is driving.
- `enterManual()` is the single teardown: `exitShowcase()`, `hideIntro()`, `dismissLoading()` unconditionally (it used to run only when models were loaded, which left the logo screen over a playing world), attract camera cleared, then `show('playing')`.
- `__reanimatorAdvance` takes `{ continue: true }` to keep the current world.
- Advance and Step return `debug`, and snapshots carry `layers` and `worldSerial`.

Hook reference:

- `__reanimator()`: snapshot, now including `layers` and `worldSerial`.
- `__reanimatorAdvance(inputs, setup?, { continue? })`: default builds a fresh world (`newWorld3D()`), then applies `setup` and runs the input frames. With `continue: true` it keeps the current world, applies `setup` on top, then runs the inputs.
- `__reanimatorStep(inputs, alpha?)`: always continues the current world.
- `__reanimatorRunBot(maxTicks, untilStep?, showResultOnEnd?)`: runs the bot.

Advance and Step return the snapshot plus:

```
debug: {
  world: 'fresh' | 'continued',
  worldSerial: number,      // increments whenever `world` is replaced
  ticksRun: number,
  stoppedOn: 'inputs' | 'status',
  layers: { title, loading, intro, showcase: boolean, topLayer: string }
}
```

`layers` is read from the DOM (`src/ui/debugLayers.ts`). `stoppedOn` is `status` when the run ended before all frames because the run ended.

## 4. Result screen copy and restart

`src/ui/resultCopy.ts` holds `resultCheckpointLine({ won, lastSaveId, nearRespawn })`, used by `showResult()`. It returns an empty string on a win, the Save station resume line when a save exists and the difficulty is not Story, a "near where you fell" line on Story (the rolling checkpoint), and "No Save station reached yet. Play again restarts the run." otherwise. This fixes the old text that said "last Save station" on Story. `tests/result-copy.test.ts` covers all four cases.

Restart paths read and correct: Restart and `R` call `restartCurrent()` which starts a fresh world with `deaths = 0`. Resume calls `resumeAtSave()` which uses `respawnPlayer3D`. A first-room death with no save hides `#resume-save` and focuses Restart.

## 5. Verification

- `make check`: exit **0**, 555 of 555 node tests pass, dist-guard PASS (13 files).
- Browser checks (`make smoke-local`, Playwright on the debug hooks, result screen visuals): **unverified**, not run in this track.
