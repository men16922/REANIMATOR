# full-3d-quarter-view — Design

근거 유형: 전부 `new-design`. 복원 근거(`binary-static`/`runtime-observed`)는 `src/engine/motion.ts`에만 있고 이 spec은 그 파일을 수정하지 않는다. `motion3d.ts`는 Abuse의 즉시 가속·정지 느낌(`ABILITY` 비율)을 3D로 확장한 설계값이다.

## 모듈

| 파일 | 역할 | 주요 심볼 |
|---|---|---|
| `src/engine/motion.ts` | 봉인된 복원 이동 규칙 (무수정) | — |
| `src/engine/motion3d.ts` | 60 Hz 3D 캡슐 운동학 | `ABILITY_3D`, `Body3D`, `MoveInput3D`, `Collider3D`, `BoxSolid3D`, `Pillar3D`, `Ramp3D`, `spawnBody3D`, `floorHeightAt3D`, `resolveHorizontal3D`, `stepBody3D` |
| `src/game3d/map3d.ts` | 4구역 시설 데이터 | `buildFacilityMap3D`, `buildCollider3D`, `Level3D`, `MapSolid3D`, `AcidPool3D`, `WeaponPedestal3D`, `MedStation3D`, `EnemySpawn3D` |
| `src/game3d/world3d.ts` | 전투·목표·승패 시뮬레이션 | `newWorld3D`, `stepWorld3D`, `emptyInput3D`, `castRaySolidDistance3D`, `triggerExplosion3D`, `WEAPON_META`, `WorldState3D` |
| `src/game3d/bot3d.ts` | 결정적 폐루프 봇 (playthrough·showcase 공용) | `chooseWaypoint`, `avoidObstacles` |
| `src/render3d/riggedModels.ts` | GLB 로더·리그 인스턴스·애니메이션 | `preloadAllModels3D`, `instantiateRiggedModel3D`, `instantiateStaticModel3D`, `stepRiggedAnimation3D`, `flashRiggedMaterials3D`, `RIFLE_SOCKET`, `RiggedInstance`, `ModelKey3D` |
| `src/render3d/scene3dFull.ts` | Three.js 씬·카메라·후처리 | `Scene3DRenderer` (`screenToWorldAim`) |
| `src/render3d/fallback2d.ts`, `textures3d.ts` | Canvas2D 폴백, 절차적 텍스처 | — |
| `src/ui/main.ts` | 고정 tick 루프·입력·HUD·화면 | `SIM_HZ_3D = 60` |
| `tools/game/{playthrough,reach3d,bench}.ts` | 봇 완주, 도달성, 성능 | — |
| `tests/game3d.test.ts` | 5개 테스트 | — |

## 시뮬레이션 루프

`frame(t)`: `dt = min(0.1, Δt)` → `acc += dt` → `while (acc ≥ 1/60 && steps < 4) world = stepWorld3D(world, buildInput())` → `renderWorld()` → `hud()`. `stepWorld3D`는 `stepBody3D(player.body, MoveInput3D, buildCollider3D(level, openDoors))`를 호출하고 적·투사체·충격파·폭발·배럴·픽업을 같은 tick에서 갱신한다.

## 물리 (`motion3d.ts`)

- 상태 `Body3D.state`: 0 idle, 1 running, 2 jump rising, 3 falling, 4 landing, 5 dashing.
- 수평: `startAccelPerSec 84`, `stopDecelPerSec 96`, `airAccelPerSec 52`. 벽·기둥은 `resolveHorizontal3D`가 AABB/원기둥 밀어내기 후 속도를 슬라이드 방향으로 투영한다.
- 수직: `floorHeightAt3D`가 solid 상면, ramp 보간(`axis`, `yMinEdge`, `yMaxEdge`), pillar 상면 중 `currentY + stepUpHeight` 이내 최고점을 반환한다. 천장은 `prev.y + height ≤ s.minY + 0.15`일 때 차단한다. `y < -10`이면 바닥 안전 클램프.
- Jet-Dash: `dashTicks 11`, `dashSpeed 21.0`, 쿨다운 66. 대시 중 `vy = max(0, vy * 0.2)`, `dashInvulnTicks`로 무적 처리(`PlayerState3D`).

## 맵 좌표 (`buildFacilityMap3D`)

| 구역 | x 범위 | 내용 |
|---|---|---|
| A Cryo Bay | 0..23.2 | `catwalk-a` y 2.2 (`ped-scatter` 19.2, 2.2, -6.2), `ramp-a-up` x 10.2→15.2, `ramp-a-down` z -4.6→-1.0, `pil-a1`, `med-a` |
| B Bio-Processing | 23.2..51 | 아시드 vat x 31..40 z -1.8..2.4, `catwalk-b` x 29.8..44.2, `console-b` (38.8..40.0, y 2.2..3.45), `consolePos` (39.4, 2.2, -5.4), `ramp-b-up` x 25.0→29.8, `ramp-b-down` x 44.2→49.0, `ped-grenade` (33.0, 0, 6.2), `med-b` |
| C Reactor Core | 51..78 | `door-gate-c` x 50.7..51.4, `pil-c1`..`pil-c4` (±4.8, x 58.5/69.5, radius 1.05), `corePos` (74, 0, 0) radius 1.85, `ped-rail` (54.6, 0, -7.2), `med-c` |
| D Extraction | 78..99 | `door-gate-d` x 77.7..78.4, 배럴 도미노 `brl-d1`..`brl-d4`, `exitPos` (95, 0, 0) radius 2.5 |

적 스폰 15개: A 4(crawler 2, stalker 1, spitter 1), B 5, C 3(`e-c1` warden at 66.2, 0, 0), D 4 (`zone` 활성화는 `world3d.ts` 근접·`gate_c` 조건).

## 목표 상태기계

`phase`: `console` → (F 상호작용, `gate_c` 개방) `warden` → (Warden 사망 후 코어 피해 허용) `core` → (`coreHp 0`: `gate_d`, `meltdownTicks 5400`) `escape` → (exit 반경 도달) `won`. `status`: `playing | won | lost`.

## 무기·적 AI

- 투사체 종류 `pulse | scatter | grenade | enemy_acid | boss_plasma`. 수류탄 수평속도 16.5, `vy = 5.4 + dy*4.0`, 폭발 반경 4.1, 플레이어 자해 상한 `playerCapDamage = 18`.
- Rail: `castRaySolidDistance3D(w, ox, oy, oz, dx, dy, dz, 36)`으로 벽에서 멈춘 `BeamFX3D`(18 tick)와 선상 적 125 피해, 코어 105 피해.
- Warden 패턴: 예고(`windupTicks`) → 슬램 `ShockwaveRing3D`(phase 2 피해 26, phase 1 20) → `boss_plasma`; 점프로 회피. `damageCore`는 Warden 생존 시 무시.
- 이벤트 `SoundEvent3D.type`: `pulse, scatter, grenade, bounce, explosion, rail, dash, jump, hurt, unlock, slam, pickup, meltdown, win` → `src/ui/audio.ts`.

## 렌더 파이프라인 (`Scene3DRenderer`)

1. `WebGLRenderer`: `ACESFilmicToneMapping` 노출 1.4, `shadowMap.type = PCFSoftShadowMap`, `FogExp2(0x090e14, 0.015)`.
2. 조명: `HemisphereLight(0x8bb6df, 0x1c1714, 1.15)`, `DirectionalLight` sun(0xdcebff, 1.9, shadow 1024², ortho ±22, near 2, far 56, bias -0.0008), cyan rim, `alarmLight`(Meltdown), `muzzleLight`, 헤드램프 `SpotLight(0xd9f7ff, 0, 24, 0.42, 0.5, 1.2)`.
3. 후처리: `EffectComposer` → `RenderPass` → `UnrealBloomPass(Vector2(w/2, h/2), 0.42, 0.32, 0.84)` → `OutputPass`.
4. 카메라: `PerspectiveCamera(38, aspect, 0.4, 120)`. 위치 = `camFocus + (-2.2 + shake, 15.6, 14.4 + shake)`, 초점은 플레이어 + 커서 look-ahead(`0.18`배, ±1.6/±1.4), `lerp(min(1, dt*11))`. sun은 플레이어를 따라간다. 카메라와 플레이어 사이의 큰 벽·기둥은 자동 페이드.
5. 조준: `screenToWorldAim(ndcX, ndcY, world)` 레이캐스트 → `aimX/aimY/aimZ`, `aimYaw`. 시안 레이저와 회전 레티클.

## 리그 캐릭터 (`riggedModels.ts`)

- `SkeletonUtils.clone`으로 인스턴스마다 스킨·inverseBind 유지. 높이는 `targetHeight`로 정규화, `frustumCulled = false`.
- `mixamorig*` 본 탐색: `Hips, Spine1, Spine2, RightArm, RightForeArm, RightHand`.
- `attachRifle` 시 `RIFLE_SOCKET { pos [-0.01, 0.14, 0.04], rot [-0.15, π/2, -0.52π], scale 0.72 }`의 `riflePivot`을 `RightHand`에 부착, `muzzleLocal` (-0.52, 0.04, 0)이 총구 월드 좌표.
- 클립 루프: `death`/`jump`는 `LoopOnce + clampWhenFinished`, 나머지 `LoopRepeat`. 크로스페이드 0.14 s(`death` 0.1 s). 폴백 매핑 `run→walk`, `jump→run`, 그 외 `idle`.
- 상체 조준 트위스트: `spine1 += 0.42·δ`, `spine2 += 0.58·δ` (δ ∈ ±0.9). 달리기·걷기 중 오른팔 추가 회전.
- 피격 플래시 `flashRiggedMaterials3D`: hurt 0xff2f2f(0.75), dash 0x2bf0ff(0.55).

### 에셋 (`reference/manifests/meshy-assets.json`, schema `reanimator-meshy-assets-v2`)

| id | 종류 | joints | clips (durationSec) | optimizedBytes |
|---|---|---|---|---|
| operative | rigged | 66 | idle 1.667, walk 1.033, run 0.633, jump 1.867, attack 2.8, death 2.967 | 2,131,000 |
| warden | rigged | 66 | idle 4, walk 1.033, run 0.633, attack 1.833, death 2.967 | 4,186,512 |
| bio-stalker | rigged | 66 | idle 4, walk 1.033, run 0.467, attack 4.333, death 2.967 | 3,093,224 |
| pulse-rifle, bio-barrel, crawler, spitter, power-core, exit-gate | static | — | — | 562,032 / 474,200 / 596,704 / 608,696 / 600,268 / 1,275,864 |

모든 clip은 192 channels. 라이선스 `Private (비공식적인)`, 분류 `new-design`.

## R3.3 격리

`WorldState3D.light`는 HUD와 `Scene3DRenderer`에서만 읽는다 (`this.headlamp.intensity = w.light.on ? 34 : 0`, 콘 가시성, 위치는 총구/조준점). `visible = true`를 유지하고 intensity만 조절해 셰이더 재컴파일을 피한다. 시뮬레이션 분기에 `light`는 없다.

## 게이트

`make check` = `typecheck` + `test-engine`(`node --test tests/`) + `reference-verify` + `reach`(`reach.ts`, `reach3d.ts`) + `build` + `dist-guard`. `make reference-holdout`은 sealed M05 판정. `make smoke-local`은 build + 헤드리스 Chrome 스모크.
