# R2 boss presentation (branch `r2/boss`)

Browser/visual behaviour is **unverified** (no Chrome in the build sandbox). Logic is covered by `tests/boss-fx.test.ts` and `tests/game3d.test.ts`; `make check` exit 0.

## Simulation change (the only one)
`world3d.ts`: `bossIntroTicks` / `bossIntroDone`, `BOSS_INTRO_TICKS = 210` (3.5 s), `skipBossIntro3D(w)`.
First step in `core` with a living Warden starts the intro: player input is replaced by neutral input (aim kept), the Warden stays dormant. Never replays, also not after respawn. Bot and `reach3d` unchanged apart from +210 idle ticks (playthrough 4213 -> 4423 ticks, still won; reach3d 3431 ticks unchanged). Tests that teleport into the vault set `w.bossIntroDone = true`.

## Effects
- Intro: pan to boss, push-in, hull ignites, roar beat at 42% (ring, shake, light pulse), "CORE WARDEN" title card, letterbox, Enter/Esc skips. Skipped automatically in title attract mode.
- Telegraphs (`bossTelegraph3d.ts`, unlit, pooled): slam = growing half-dome + floor lane bars; charge = chevron lane with scroll + floor stripe + heel sparks; volley/barrage = predicted plasma lanes (merged quad mesh, one draw), muzzle glow, converging motes; summon = portal rings + rising motes. All scale with windup progress.
- Phase change: armour plate debris, core colour I cyan / II orange / III red, screen flash (post-pass `uFlash`), ambient/sun pulse, short slow-mo. Reduce flashing: flash 0.12, shorter slow-mo.
- Exposed window: core glow flare, gold hull pulse, world-space "EXPOSED" marker, big gold damage number, core sparks.
- Damage numbers: one instanced glyph layer (`popups3d.ts`, 40 popups, 1 draw). Small numbers on normal enemies are off under Reduce flashing.
- Boss death: ~2 s chain of explosions, then white-out and core reveal burst, then Meltdown as before.
- Mechanics: wall-slide sparks, wall-jump ring, stomp trail + landing shockwave, dash-cancel flash, rail charge motes/glow scaled by charge, combo "xN" popup, data-log hologram (wire frame + projection cone), data stream on collect, cracked secret wall (procedural texture, amber glow) + debris on open.
- Meltdown: existing alarm light orbits the player (no new lights), ambient/background siren pulse, red screen tint, micro rumble, `#meltdown` pill pulses (`body.meltdown-alert`).

## Browser repro (`__reanimatorAdvance(inputs, setup)`)
Setup for the vault: `{x:76,y:0,boots:true,tanks:2,weapons:[1,2,3,4],console:true,openDoors:['door_boss'],hp:220}`.
- Intro: `inputs = Array(80).fill({})`. Expect `__reanimator().fx.deathSeq == -1`, `cinematic.active == true`, `cinematic.pan -> 1`, `roared == true`; the world is frozen in manual mode, so wait ~1 s for the camera to ease. Title card visible at ~45-70%.
- Phases: add `skipIntro:true, bossPhase:2` (or 3) to the setup, then step ~120 ticks near the Warden. Telemetry `fx.bossPhase` updates on the real `boss_phase` event (damage past 2/3 and 1/3 HP, e.g. rail shots), `fx.phaseFlash`/`fx.envPulse` rise to 1 then decay.
- Exposed: after a slam, `warden.exposedTicks > 0`; marker and `fx.popups > 0` after a hit.
- Death: set `bossPhase:3` and shoot with rail; `fx.deathSeq` runs 0 -> 2 s.
