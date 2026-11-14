# full-3d-quarter-view — Requirements (G4+)

선행: `reanimated-slice` (G3, 2D/2.5D) 완료, `restored-motion` (G2) PASS. 작성 메모: 이 spec은 이미 구현된 Full 3D 코드를 사후에 문서화한 것이다(사전 사용자 검토를 거친 spec이 아님). 기호·수치는 `src/` 및 `reference/manifests/meshy-assets.json` 기준이다.

## 목표

Quarter-View 트윈스틱 3D 액션 슈터. 시작 → Security Console(Gate C 개방) → Core Warden 처치 → Reactor Core 파괴(Meltdown, Gate D 개방) → Exit 탈출/패배 → 재시작이 완결된다. 모든 3D 이동·전투·맵·렌더는 `new-design`이다(Abuse 이동 복원은 `src/engine/motion.ts`에 봉인).

## Requirements (EARS)

### 시뮬레이션

- R4.1 THE simulation SHALL run at a fixed 60 Hz (`SIM_HZ_3D = 60` in `src/ui/main.ts`, `ABILITY_3D.dt = 1/60`), advancing the player with `stepBody3D` (`src/engine/motion3d.ts`) and the world with `stepWorld3D` (`src/game3d/world3d.ts`), at most 4 steps per frame.
- R4.2 THE capsule body SHALL use `ABILITY_3D` (`radius 0.42`, `height 1.82`, `runTopSpeed 9.2`, `jumpVel 9.5`, `gravity 26.5`, `terminalFallVel -18.5`, `stepUpHeight 0.38`) with wall/pillar sliding and ramp floor snapping via `Collider3D` (`solids`, `pillars`, `ramps`, `isSolidActive`).
- R4.3 WHEN Shift or right mouse is pressed and `dashTicks === 0 && dashCooldown === 0`, THE body SHALL Jet-Dash at `dashSpeed 21.0` for `dashTicks 11` with `dashCooldownTicks 66`, toward the move axes or the aim direction if stationary.
- R4.4 THE `stepWorld3D` SHALL be deterministic: the same `InputState3D` sequence from `newWorld3D()` yields the same world (used by `tools/game/playthrough.ts`).

### 맵 (`buildFacilityMap3D`)

- R4.5 THE map SHALL consist of 4 zones along +X: Zone A Cryo Bay (x 0..23.2), Zone B Bio-Processing (23.2..51), Zone C Reactor Core Boss Arena (51..78), Zone D Extraction Gauntlet (78..99); `bounds` x 0..98, z -10..10; `spawn` (3.2, 0, 0).
- R4.6 THE map SHALL include 2 upper catwalks at y 2.2 (`catwalk-a` x 15.2..22.2, `catwalk-b` x 29.8..44.2), 4 walkable ramps (`ramp-a-up`, `ramp-a-down`, `ramp-b-up`, `ramp-b-down`), a sunken acid vat (`floor-b-vat`, `acid-b1`, `surfaceY -0.18`), 7 pillars (`pil-a1`, `pil-b1`, `pil-b2`, `pil-c1`..`pil-c4`), 11 bio-barrels, 3 med stations (`med-a`/`med-b`/`med-c`, heal 35/45/55) and 15 enemy spawns.
- R4.7 THE south perimeter walls SHALL keep full collision height but render low (`visualMaxY 0.78` or 1.4/1.5 on dividers) so the quarter-view camera sees inside.
- R4.8 THE doors `gate_c` (x 50.7..51.4) and `gate_d` (x 77.7..78.4) SHALL block movement until present in `openDoors`.
- R4.9 THE map SHALL be completable: `tools/game/reach3d.ts` drives real `stepBody3D` through START → Scattergun catwalk → CONSOLE → CORE → EXIT.

### 목표 진행

- R4.10 WHEN the player is within `consolePos.radius 2.1` on catwalk B (|Δy| ≤ 1.4) and presses F (or is within 1.35), THE console SHALL unlock, add `gate_c` to `openDoors`, and set phase `warden`.
- R4.11 THE Reactor Core (`coreMaxHp 240`) SHALL ignore damage while any `warden` enemy is alive.
- R4.12 WHEN `coreHp` reaches 0, THE world SHALL add `gate_d`, set phase `escape`, set `meltdownTicks = 90 * 60` (5400), and emit `meltdown`.
- R4.13 WHEN `meltdownTicks` reaches 0 while playing, THE run SHALL be `lost`; WHEN the player reaches `exitPos` (radius 2.5, |Δy| ≤ 1.5) after `coreDestroyed`, THE run SHALL be `won`; WHEN `hp` reaches 0, `lost`.
- R4.14 THE restart key R SHALL produce a fresh `newWorld3D()`.

### 무기 (`WEAPON_META`)

- R4.15 THE player SHALL have 4 weapons: 1 PULSE RIFLE (cooldown 8, ammo 999, damage 18, speed 34), 2 SCATTERGUN (cooldown 28, ammo 28, 7 pellets, damage 13 each), 3 GRENADE (cooldown 34, ammo 14, damage 86, radius 4.1, up to 4 bounces), 4 RAIL-CANNON (cooldown 44, ammo 10, hitscan `maxRange 36` stopped by `castRaySolidDistance3D`).
- R4.16 THE weapons 2, 3, 4 SHALL be locked until their pedestal (`ped-scatter` Catwalk A, `ped-grenade` Zone B, `ped-rail` Zone C) is collected.
- R4.17 WHEN a bio-barrel (hp 20) is destroyed, THE explosion SHALL chain to neighboring barrels via `fuseTicks`.

### 적·보스

- R4.18 THE enemies SHALL be `crawler` (hp 38), `stalker` (78), `spitter` (62), `warden` (920, radius 1.05, height 3.05).
- R4.19 WHEN the Core Warden hp ≤ 50% of `maxHp`, THE phase SHALL become 2 with a 16-tick stagger.
- R4.20 THE Warden slam SHALL spawn a `ShockwaveRing3D` at y 0..0.72, so a jump above 0.72 dodges it.

### R3.3 조명 격리

- R4.21 THE headlamp (`w.light`, E key, rules from `src/game/light.ts`) SHALL be read only by the HUD and renderer (`Scene3DRenderer`); worlds that differ only in `light` SHALL be identical over 360 ticks (test: `R3.3 Strict Light Isolation`).

### 렌더·자산

- R4.22 THE renderer SHALL be Three.js `0.187` WebGL2 with `PCFSoftShadowMap`, `ACESFilmicToneMapping` (exposure 1.4), `FogExp2(0x090e14, 0.015)`, and `EffectComposer` = `RenderPass` + `UnrealBloomPass(strength 0.42, radius 0.32, threshold 0.84)` + `OutputPass`.
- R4.23 THE camera SHALL be a quarter-view `PerspectiveCamera(fov 38)` at focus + (-2.2, 15.6, 14.4) with cursor look-ahead (clamped ±1.6 / ±1.4) and shake.
- R4.24 THE operative, warden and bio-stalker SHALL be rigged multi-clip `SkinnedMesh` (66 joints each) with clips per `meshy-assets.json`: operative `idle, walk, run, jump, attack, death`; warden and bio-stalker `idle, walk, run, attack, death`.
- R4.25 THE pulse rifle (`pulse-rifle.glb`) SHALL attach to the operative's `mixamorigRightHand` bone via `RIFLE_SOCKET`.
- R4.26 THE cursor SHALL aim in 360° through a ray cast to the world (`screenToWorldAim`), with a laser sight and reticle.
- R4.27 IF a GLB fails to load, THEN THE renderer SHALL fall back to capsule/primitive meshes and the game SHALL remain playable.

### 입력

- R4.28 THE controls SHALL be: WASD/arrows move, Space jump, Shift or right mouse dash, left mouse fire, 1–4 weapon, F interact, E headlamp, Esc/P pause, R restart.

### 불변식

- R4.29 THE `src/engine/motion.ts` and `reference/{fixtures,holdout}/**` SHALL stay unmodified (S1·S2·S3·M05 exact match).
- R4.30 THE build SHALL NOT include the original EXE, data, or captures (`tools/release/check-dist.ts`).

## 범위 밖

사람 플레이 관찰(G5), 3분 플레이 시간 사람 측정, 난이도 밸런스, 원본 사격 복원(C01 NOT RUN), 푸시·배포·제출.
