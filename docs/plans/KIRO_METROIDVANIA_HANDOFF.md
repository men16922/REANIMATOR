# Kiro 인계서: Full 3D Side-View Metroidvania (REANIMATOR)

이 문서는 **2026-11-15** 시점부터 `REANIMATOR` 프로젝트의 **Wave 2 구현·통합과 Wave 3 최종 검증·커밋/푸시까지 모든 잔여 작업을 Kiro(IDE 및 `kiro-cli`)에 전면 이관**하기 위한 단일 기준 문서다.

- 선행 커밋 베이스라인: `HEAD a9cabde` (`origin/main`, `https://github.com/men16922/REANIMATOR`)
- 현재 워킹 트리 상태: **Wave 0(규명·계약) + Wave 1(물리·6섹터 맵·3D 리그 IK/점프·HUD/미니맵/오디오 자산) 작성 완료, Wave 2(시뮬레이션·3D 렌더·입력/부트·테스트/도달성) 미전환(컴파일 미완료 상태)**
- 현재 미전환으로 인한 알려진 컴파일 오류: `src/game3d/world3d.ts(219,9)` (`TS2322`) 및 `src/game3d/world3d.ts(237,15)` (`TS2367`) — 구 `'A'|'B'|'C'|'D'` 섹터 ID와 신 `SectorId3D` 불일치 때문. **절대 Wave 2 완료 전에는 `git commit` 하지 말 것.**

---

## 1. Kiro 즉시 실행 가이드

### 1-A. Kiro IDE 채팅창에 그대로 붙여넣을 마스터 프롬프트

```text
@docs/plans/KIRO_METROIDVANIA_HANDOFF.md @.kiro/steering/reanimator.md @.kiro/specs/metroidvania-3d/tasks.md

현재 워크트리는 Metroidvania 3D 전환 Wave 1까지 작성되어 있고, Wave 2부터 모든 작업이 Kiro에 이관되었다.
봉인 파일 목록(R8)을 절대 수정하지 말고, 아래 순서로 Wave 2(4개 스트림 병렬 또는 순차)와 Wave 3(게이트·시각 검증·문서 동기화·git commit/push)를 끝까지 완료하라.

1. Wave 2 병렬 파일 단위 소유권을 엄격히 지켜서 src/game3d/world3d.ts, src/game3d/bot3d.ts, src/render3d/scene3dFull.ts, src/render3d/fallback2d.ts, src/ui/main.ts, tests/game3d.test.ts, tools/game/reach3d.ts, tools/smoke/smoke.ts, tools/smoke/capture-showcase.ts 를 Metroidvania Side-View 규격으로 완성하라.
2. Wave 1에서 이미 구현된 motion3d.ts / map3d.ts / riggedModels.ts IK·점프·역방향 다리 / minimap.ts / index.html / style.css / audio.ts 계약을 되돌리지 말고 그대로 소비하라.
3. Wave 3에서 make check, make smoke-local, Playwright 헤드리스 스모크/쇼케이스 스크린샷 육안 확인(미니맵·HUD 겹침, 사이드뷰 카메라, 양손 라이플 IK, 상승/하강 점프, 역방향 백페달, Thruster 공중 점프)을 통과한 뒤 docs/를 동기화하고 main에 commit & push 하라.
```

### 1-B. `kiro-cli` 4-Way Wave 2 병렬 실행 명령

Mac 터미널에서 Node v26 바이너리와 `kiro-cli`(`2.37.1`)가 `PATH`에 잡혀 있어야 한다.

```bash
export PATH="/Users/men1692/Desktop/AWS/Kiroween2026/.tools/node-v26.13.1-darwin-arm64/bin:/Users/men1692/.local/bin:$PATH"
cd /Users/men1692/Desktop/AWS/Kiroween2026

# Wave 2 — 4개 스트림 파일 충돌 없이 동시 실행 (각 터미널/백그라운드 탭에서 실행 후 wait)
kiro-cli chat --no-interactive --trust-all-tools \
  "docs/plans/KIRO_METROIDVANIA_HANDOFF.md의 [Wave 2-A] 명세대로 src/game3d/world3d.ts, src/game3d/bot3d.ts(및 필요 시 playthrough 관련 로직)만 수정하라. 다른 스트림 파일이나 봉인 파일은 건드리지 마라." &

kiro-cli chat --no-interactive --trust-all-tools \
  "docs/plans/KIRO_METROIDVANIA_HANDOFF.md의 [Wave 2-B] 명세대로 src/render3d/scene3dFull.ts와 src/render3d/fallback2d.ts만 수정하라. src/render3d/riggedModels.ts는 이미 완성되어 있으니 계약을 읽고 그대로 호출하라." &

kiro-cli chat --no-interactive --trust-all-tools \
  "docs/plans/KIRO_METROIDVANIA_HANDOFF.md의 [Wave 2-C] 명세대로 src/ui/main.ts, tools/smoke/smoke.ts, tools/smoke/capture-showcase.ts만 수정하라. index.html/style.css/minimap.ts/audio.ts는 이미 준비되어 있다." &

kiro-cli chat --no-interactive --trust-all-tools \
  "docs/plans/KIRO_METROIDVANIA_HANDOFF.md의 [Wave 2-D] 명세대로 tests/game3d.test.ts와 tools/game/reach3d.ts만 수정하라. sealed tests/game.test.ts 및 tests/reference.test.ts는 절대 수정 금지." &

wait
```

### 1-C. Wave 3 통합 · 검증 · 최종 푸시 실행 명령

```bash
kiro-cli chat --no-interactive --trust-all-tools \
  "docs/plans/KIRO_METROIDVANIA_HANDOFF.md의 [Wave 3] 절차대로 전체 컴파일/게이트(make check), make smoke-local, 쇼케이스 캡처 및 스크린샷 육안 검수, .kiro/specs/metroidvania-3d/tasks.md 및 docs/ 문서 동기화, git commit & push까지 완수하라. make reference-holdout은 리비전당 1회만 실행하고 sealed 파일 무변경 여부를 git diff로 확인하라."
```

---

## 2. 절대 불변 규칙 (Invariants & Sealed Files)

1. **봉인 파일 수정 금지 (`R8`)** — 아래 파일은 1바이트도 변경하면 안 된다:
   - `src/engine/motion.ts`
   - `src/engine/collider.ts`
   - `src/game/light.ts`, `src/game/map.ts`, `src/game/world.ts`
   - `tools/game/reach.ts`
   - `tests/game.test.ts`, `tests/reference.test.ts`
   - `reference/fixtures/**`, `reference/holdout/**`
2. **레퍼런스 3종(S1/S2/S3) 무손상**: `node tools/reference/verify.ts` 3/3 PASS와 `node --test tests/reference.test.ts tests/game.test.ts` 30/30 PASS가 항상 유지되어야 한다. `make reference-holdout`는 최종 리비전에서 1회만 실행한다.
3. **고정 60Hz 결정성**: 모든 물리·AI·전투·문·업그레이드 상태는 `src/game3d/` + `src/engine/motion3d.ts`의 60Hz 고정 틱(`dt = 1/60`) 안에서 결정적으로 돌며, Three.js 렌더러(`src/render3d/**`)나 UI(`src/ui/**`)에서 게임플레이 상태를 변경하지 않는다(`R3.3`).
4. **숨겨진 2D 랩 보존**: `#lab` DOM 토글 등 기존 디버그 Lab 경로가 깨지지 않도록 유지한다.
5. **IP / 저작권 금지어**: UI 문구·코드 주석·문서에 원작 게임명 직접 표기 대신 자체 세계관(`Cryo Airlock`, `Central Transit Shaft`, `Sunken Mines`, `Bio-Labs`, `Upper Security Deck`, `Core Vault`, `Thruster Boots`, `Energy Tank`)을 유지한다.
6. **문서 줄 수 상한 (`.claude/harness-config.json`)**:
   - `docs/AGENT_BRIEF.md <= 60줄`
   - `docs/STATUS.md <= 120줄`
   - `docs/NEXT_PLAN.md <= 120줄`
   - `docs/PROGRESS_LOG.md <= 120줄`
   - `docs/LESSONS.md <= 40줄`
7. **TypeScript 설정 (`tsconfig.json`)**: `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `allowImportingTsExtensions: true`, `verbatimModuleSyntax: true`.
8. **Wave 1 작업물 보존**: `src/engine/motion3d.ts`, `src/game3d/map3d.ts`, `src/render3d/riggedModels.ts`의 IK/점프/역방향 백페달, `src/ui/minimap.ts`를 임의로 되돌리거나 재작성하지 말 것.

---

## 3. 왜 전환했는가: Quarter-View 5대 결함 진단 & Wave 1 해법

이전 Quarter-View 3D 빌드(`a9cabde`)에서 발견된 달리기/점프 부자연스러움 5가지와 Wave 1의 해결 구현:

1. **결함 1 (옆걸음 스케이팅)**: 이전에는 캐릭터 전체 루트(`root.rotation.y`)를 마우스 조준 각도(`aimYaw`)에 고정해, 이동 방향과 무관하게 다리가 옆으로 미끄러졌다.
   - **Wave 1 해법 (`riggedModels.ts`)**: Side-View XY 평면에서 루트는 좌(`-PI/2`) 또는 우(`+PI/2`)로만 회전시키고, 이동 방향과 조준 부호가 반대일 때(`moveX * aimSignX < 0`) run/walk 클립 `timeScale`을 음수로 재생해 **역방향 다리 백페달**을 구현했다.
2. **결함 2 (무장 미정렬)**: `RightArm`이 비무장 달리기 스윙을 하고, `idle`/`jump`에서 총구가 아래를 향했다.
   - **Wave 1 해법 (`riggedModels.ts`)**: `applyTwoHandedRifleIK()`와 `riflePivot` 월드 기저 고정으로 XY 360° 조준 시 오른손(총 손잡이)과 왼손(총열 포어그립)을 월드 공간 쿼터니언으로 정렬해 상시 조준 자세를 유지한다. Mixamo 리그의 `+Y` 본 축 특성 때문에 로컬 Z/X 회전이 아닌 월드 기반 쿼터니언 정렬을 사용했으므로 **절대 오일러 축 회전으로 되돌리지 말 것**.
3. **결함 3 (`operative.glb` 점프 0.00~0.50초 웅크림 + `+0.42m` 루트 스파이크)**: Meshy/Mixamo `jump` 클립(`1.867s`)은 `0.00~0.50s`가 지상 예비 웅크림이고 `Hips.y`에 `+0.42m` 루트 높이가 구워져 있어 `0.70s` 물리 포물선과 어긋났다.
   - **Wave 1 해법 (`riggedModels.ts`)**: `stepRiggedAnimation3D()`가 `PlayerPoseState3D.vy`에 따라 클립 시간을 **`0.53s..0.80s`(상승) / `0.80s..1.08s`(하강)** 구간으로 직접 스크럽하고, `hipsBaseY`로 `Hips.y` 스파이크를 클램프하며, `landingFactor`로 착지 무릎 완충 포즈를 적용한다.
4. **결함 4 (`state === 4` 착지 데드 코드)**: 기존 `motion3d.ts`는 착지 직후 상태를 덮어써 착지 애니메이션(`state = 4`)이 발동되지 않았다.
   - **Wave 1 해법 (`motion3d.ts`)**: `justLanded` 분기에서 `state = 4`, `landTicks = ABILITY_3D.landTicks` (`5`)가 정확히 설정되도록 수정했다.
5. **결함 5 (Quarter-View 투시 왜곡 & 120Hz 보간 부재)**: Y/Z 투시가 겹쳐 플랫폼 높낮이 판독이 어려웠고, 60Hz 렌더 스냅으로 고주사율에서 끊겼다.
   - **Wave 2 목표 (`scene3dFull.ts`, `main.ts`)**: Z를 고정(`lockZ = true`)한 정통 XY Side-View 원근 카메라(살짝 깊이 레이어가 보이는 2.5D 메트로이드 스타일) + `alpha = accumulator / dt` 포즈/위치 보간을 적용한다.

---

## 4. 현재 워킹 트리에 구현된 Wave 0–1 계약 (정확한 좌표·심볼)

Wave 2 담당 에이전트는 아래 파일들을 반드시 먼저 읽고 정확히 이 심볼들을 소비해야 한다.

### 4-1. `src/game3d/types3d.ts` (신규 — 비순환 공유 계약)
- `WeaponSlot3D`: `0 | 1 | 2 | 3` (`Pulse | Scattergun | Grenade | Rail`)
- `SectorId3D`: `'airlock' | 'shaft' | 'mines' | 'biolabs' | 'security' | 'core'`
- `DoorLockKind3D`: `'blue' | 'green' | 'yellow' | 'red' | 'console' | 'escape'`
- `UpgradePickupKind3D`: `'thruster_boots' | 'energy_tank'`
- `PlayerPoseState3D`:
  ```ts
  {
    aimSignX: 1 | -1;
    aimPitch: number;
    aimDirX: number;
    aimDirY: number;
    vy: number;
    grounded: boolean;
    landingFactor: number;
    moveX: number;
  }
  ```
- 기타 주요 타입: `RoomDef3D`, `SaveStation3D`, `UpgradePedestal3D`, `MapSolid3D`, `Pillar3D`, `Ramp3D`, `Collider3D`, `AcidPool3D`, `BarrelSpawn3D`, `WeaponPedestal3D`, `MedStation3D`, `EnemySpawn3D`, `Level3D`, `SoundEventType3D`, `SoundEvent3D`.

### 4-2. `src/engine/motion3d.ts` (Wave 1 수정 완료 — 미검증)
- `ABILITY_3D`:
  - `dt = 1/60`, `radius = 0.42`, `height = 1.82`
  - `runTopSpeed = 9.4`, `jumpVel = 10.6`, `doubleJumpVel = 9.8`
  - `gravity = 24.5`, `terminalFallVel = -19.5`
  - `dashSpeed = 21.5`, `dashTicks = 11`, `dashCooldownTicks = 58`, `landTicks = 5`
- `Body3D` 추가 필드: `coyoteTicks`, `jumpBufferTicks`, `jumpsUsed`, `prevJumpHeld`, `dropThroughTicks`
- `MoveInput3D` 추가 필드: `dropDown?: boolean`, `maxJumps?: number`, `lockZ?: boolean` (기본 `true`)
- 함수:
  - `spawnBody3D(x, y, z)`
  - `stepBody3D(prev, input, col)` — 코요테 타임, 점프 버퍼, 가변/비대칭 점프 중력, Thruster 공중 점프(`maxJumps = 2`), 원웨이 `'platform'` 착지 및 `dropDown` 통과, `justLanded` -> `state = 4`
  - `floorHeightAt3D(x, z, currentY, radius, col, skipPlatforms?)`, `resolveHorizontal3D(...)`

### 4-3. `src/game3d/map3d.ts` (Wave 1 수정 완료 — 산술 설계, 런타임 미검증)
`buildFacilityMap3D()` / `buildCollider3D()`가 제공하는 6개 섹터와 정확한 월드 좌표:
- **6개 방 (`rooms`)**:
  - `room_airlock`: `x: 0..24, y: 0..9`, 미니맵 `grid (0,1, 3x1)`, `hasExit: true` (시작점 및 상부 탈출 발코니 포함)
  - `room_shaft`: `x: 24..42, y: -12..14`, 미니맵 `grid (3,0, 2x4)` (수직 허브 샤프트, 상부 `4.4m` Double-Jump 게이트 보유)
  - `room_mines`: `x: 0..24, y: -12..-4`, 미니맵 `grid (0,3, 3x1)`, `hasSave: true`
  - `room_biolabs`: `x: 42..70, y: -1..8`, 미니맵 `grid (5,1, 3x2)`
  - `room_security`: `x: 42..70, y: 8.4..14`, 미니맵 `grid (5,0, 3x1)`, `hasSave: true`
  - `room_core`: `x: 70..98, y: -1..10`, 미니맵 `grid (8,1, 3x2)`, `hasBoss: true`
- **Z 레인**: `z = 0` 기준 플레이어 이동면(`-3.2..3.2`), 배경 기둥(`pillars`)은 `z = -2.4`.
- **잠금 문 (`solids` 내 `door` + `doorLock`)**:
  - `door_airlock_shaft`: `blue` (`x: 23.6..24.4, y: 0..3.6`) — Pulse로 개방
  - `door_escape`: `escape` (`x: 23.6..24.4, y: 5.2..8.6`) — Meltdown 후 개방 (`room_shaft` ↔ `room_airlock` 상부 발코니)
  - `door_shaft_mines`: `green` (`x: 23.6..24.4, y: -11..-7.4`) — Scattergun으로 개방
  - `door_shaft_biolabs`: `yellow` (`x: 41.6..42.4, y: 0..3.6`) — Grenade로 폭파 개방
  - `door_boss`: `red` (`x: 69.6..70.4, y: 0..4.0`) — Rail-Cannon + Security 콘솔 연동 후 개방
- **무기 받침대 (`pedestals`)**:
  - `ped-scatter` (Slot 1 Scattergun): `(38.5, -11.0, 0)` — `room_shaft` 최하단
  - `ped-grenade` (Slot 2 Grenade): `(8.5, -8.6, 0)` — `room_mines`
  - `ped-rail` (Slot 3 Rail): `(65.5, 2.2, 0)` — `room_biolabs`
- **능력·탱크 업그레이드 (`upgrades`)**:
  - `thruster_boots`: `(3.0, -8.6, 0)` — `room_mines` (Grenade 받침대 옆)
  - `etank_mines`: `(5.5, -8.6, 0)` — `room_mines` (`maxHp +30`)
  - `etank_biolabs`: `(55.0, 4.5, 0)` — `room_biolabs` (`maxHp +30`)
- **세이브/충전 스테이션 (`saveStations`)**:
  - `save_mines`: `(20.0, -11.0, 0, r=1.6)`
  - `save_security`: `(45.5, 8.8, 0, r=1.6)`
- **주요 오브젝트/보스**:
  - `consolePos`: `(54.5, 8.8, 0, r=2.2)` (`room_security`)
  - `e-core-warden`: `(83.0, 0, 0)` (`room_core`)
  - `corePos`: `(93.5, 0, 0, r=1.85)` (`room_core`)
  - `exitPos`: `(5.5, 5.2, 0, r=2.2)` (`room_airlock` 상부 탈출구)
- **Wave 2/3 주의 확인 포인트**: `room_biolabs` 내 `bio-plat-3` (`x:52..58, y:4.5`)에서 `bio-grate-up` (`x:62..68`, 현재 `y:4.4`로 낮춤. 이전 6.6은 부츠 없이 보안 갑판에 우회 가능했음) 점프 도달성 및 `room_shaft` 상부 `4.4m` 게이트 도달성을 `tools/game/reach3d.ts`로 반드시 수치 검증할 것. (만약 1회 점프로 불가한 구간이 의도된 Thruster Boots 게이트라면 `thruster_boots` 미보유 시 `false`, 보유 시 `true`가 나와야 하며, `bio-plat-3 -> bio-grate-up`은 `mines`에서 이미 `thruster_boots`를 얻고 진입하므로 2단 점프 포함 도달 가능해야 함)

### 4-4. `src/render3d/riggedModels.ts` (Wave 1 수정 완료 — 시각 검증 대기)
- `stepRiggedAnimation3D(inst, desired, dt, timeScale = 1, upperBodyDeltaYaw = 0, aimWeaponReady = false, pose?: PlayerPoseState3D)`
- 이미 구현된 기능:
  - `applyTwoHandedRifleIK` + `RIFLE` 오프셋 + `riflePivot` 월드 기저 고정
  - `pose.vy` 기반 3단계 `jump` 클립 스크럽(`0.53..0.80..1.08`)
  - `hipsBaseY` 루트 스파이크 클램프 + `landingFactor` 무릎 완충
  - `moveX`와 `aimSignX` 반대 시 `timeScale` 부호 반전 백페달
- **렌더러(`scene3dFull.ts`) 호출 규약**: 플레이어 리그의 `rig.root.rotation.y = pose.aimSignX > 0 ? Math.PI * 0.5 : -Math.PI * 0.5`로 설정하고 7번째 인자 `pose`를 반드시 전달한다. (별도 `pose3d.ts`를 새로 만들지 말고 이미 구현된 `riggedModels.ts`를 사용한다.)

### 4-5. UI · 오디오 · HTML 자산 (Wave 1 완료)
- `src/ui/minimap.ts`: `MinimapViewState`, `renderMinimap(ctx, w, h, state)` 구현 완료.
- `index.html`: `#minimap-wrap`, `#minimap`, `#boots-pill`, `#etank-pill`, `#etank-count`, `#revived` 배치 완료.
- `src/ui/style.css`: `canvas { display: block; }` 및 `#minimap-wrap { top: 3.2em; right: 0.85em; }` 등 스타일 반영 완료. (Wave 3 스크린샷에서 `#hud-top`과 겹치지 않는지 시각 확인 필수!)
- `src/ui/audio.ts`: `doubleJump`, `doorBlast`, `saveStation`, `upgrade` 웹오디오 신스 추가 완료.

---

## 5. Wave 2 상세 명세 (Kiro 구현 대상)

### [Wave 2-A] 시뮬레이션 & 봇: `src/game3d/world3d.ts`, `src/game3d/bot3d.ts` (및 playthrough 확인)
1. **컴파일 오류 해결 및 타입 통합**:
   - `types3d.ts`의 `SectorId3D`, `DoorLockKind3D`, `UpgradePickupKind3D`, `PlayerPoseState3D`, `SoundEvent3D`를 사용하도록 기존 `'A'|'B'|'C'|'D'` 존 로직 전면 교체.
   - `WorldState3D` / `PlayerState3D` 상태 확장:
     - `abilities: { thrusterBoots: boolean }`
     - `energyTanks: number`, `maxHp = 100 + 30 * energyTanks`
     - `visitedRooms: SectorId3D[]`, `currentRoom: SectorId3D`
     - `openedDoors: string[]`, `collectedUpgrades: string[]`, `lastSaveId: string | null`
     - `dropDown` 입력 및 `maxJumps: abilities.thrusterBoots ? 2 : 1`을 `stepBody3D()`에 전달.
     - `jumpsUsed`가 1에서 2로 증가할 때 `SoundEvent3D` `'doubleJump'` 발행.
2. **Side-View XY 조준 & 발사 규약**:
   - 입력 상태 `InputState3D`에서 마우스 월드 조준(`aimWorldX`, `aimWorldY`, `z = 0` 고정) 또는 `aimDirX/Y`를 받아 XY 평면 360° 탄환·레이저 발사.
   - `PlayerPoseState3D`를 `world3d.ts` 또는 헬퍼에서 계산·노출해 렌더러가 `aimSignX`, `aimPitch`, `aimDirX`, `aimDirY`, `vy`, `grounded`, `landingFactor`, `moveX`를 읽기 전용으로 받도록 한다.
3. **6종 문 해금 로직**:
   - `blue`: Pulse(`slot 0`) 사격 또는 근접 트리거로 영구 개방 (`doorBlast` 사운드 + `openedDoors` 기록, `solid.open = true`).
   - `green`: Scattergun(`slot 1`) 사격으로 개방.
   - `yellow`: Grenade(`slot 2`) 폭발/타격으로 Cracked Bio-Wall 파괴 개방.
   - `red`: Rail-Cannon(`slot 3`) + `consoleActivated` 상태에서 개방 (미충족 시 명확한 안내 이벤트/힌트).
   - `console`: `consolePos`(`room_security`) 상호작용/도착으로 활성화.
   - `escape`: `coreDestroyed` (Meltdown 시작) 후 자동 개방되어 `room_airlock` 상부 탈출로(`exitPos`) 연결.
4. **업그레이드 · 세이브 스테이션**:
   - `upgrades` 픽업 시 `thruster_boots` 활성화 또는 `energyTanks += 1` (`maxHp += 30`, 체력 +30/풀회복), `upgrade` 사운드 이벤트.
   - `saveStations` 진입/상호작용(`F` 또는 근접 체류 쿨다운) 시 HP 전량 회복, 탄약 보충, `lastSaveId` 갱신, `saveStation` 사운드 이벤트.
   - 사망 후 재시작/복원 시 `lastSaveId` 체크포인트 지원 여부는 `tests/game3d.test.ts` 계약과 맞출 것.
5. **봇(`src/game3d/bot3d.ts`)**:
   - Quarter-View 4존 방식 대신 Side-View 6섹터 메트로이드바니아 진행 루트(`airlock -> shaft -> mines(Scattergun/Thruster/Grenade/Save) -> shaft -> biolabs(ETank/Rail) -> security(Console/Save) -> core(Warden/Core) -> shaft(4.4m Thruster gate 또는 escape) -> airlock exit`)를 따라 점프·원웨이 플랫폼 하강(`dropDown`)·2단 점프·문 색상에 맞는 무기 전환 사격을 수행하도록 `computeBotInput3D` 재설계.
   - 주의: 프로젝트 내 `tools/game/playthrough` 계열 스크립트가 있다면 `world3d`/`bot3d` 시그니처와 호환되게 함께 확인(없다면 새로 억지로 만들 필요는 없으나 `package.json` / `Makefile` 스크립트가 호출하는 모든 파일 확인).

### [Wave 2-B] 3D Side-View 렌더러: `src/render3d/scene3dFull.ts`, `src/render3d/fallback2d.ts`
1. **Side-View 원근 카메라 (`scene3dFull.ts`)**:
   - 기존 45° Quarter-View 고정 오프셋(`camera.position` 대각선)을 **Z축 정면(+Z에서 `-Z`를 바라보는 2.5D Side-View)**으로 전환.
   - 권장 구도: 플레이어 위치 `(px, py)` 기준 `target = (px + aimSignX * 1.4, py + 1.05, 0)`, `camera.position ≈ (targetX, py + 2.1, 14.5 ~ 16.5)`에 스무딩 추적 + 룸 경계 클램프/방 전환 시 부드러운 댐핑 적용. 배경 기둥(`z = -2.4`)과 원근 깊이감이 자연스럽게 보이되 점프·발판 높낮이(`Y`) 판독에 투시 착시가 없어야 한다.
2. **레이캐스트 마우스 조준 (`screenToWorldAim`)**:
   - Normalized Device Coordinates -> Raycaster가 **`z = 0` XY 평면(`THREE.Plane(new THREE.Vector3(0, 0, 1), 0)`)**과 교차하는 정확한 `(worldX, worldY)`를 반환하도록 수정.
3. **120Hz+ 렌더 보간 + `riggedModels.ts` 연결**:
   - 60Hz 고정 틱 사이에서 `alpha` 보간 위치로 플레이어/적/투사체 메시 갱신.
   - 플레이어 리그에 `rig.root.rotation.y = pose.aimSignX > 0 ? Math.PI * 0.5 : -Math.PI * 0.5` 설정 후 `stepRiggedAnimation3D(inst, desired, dt, timeScale, upperBodyDeltaYaw, true, pose)` 호출.
4. **신규 비주얼 요소**:
   - 잠금 문(`blue` / `green` / `yellow` / `red` / `console` / `escape`) 색상별 에너지 실드 / Cracked Bio-Wall 셰이딩 및 개방 상태 처리.
   - `saveStations`, `upgrades`(`thruster_boots`, `energy_tank`), 플레이어 헤드램프(`SpotLight` 또는 전방 `PointLight`)가 조준 방향(`aimDirX`, `aimDirY`)을 비추고, Meltdown 시 경고 적색/비상 조명 전환.
5. **Canvas 2D 폴백 (`src/render3d/fallback2d.ts`)**:
   - WebGL2 비가용 환경에서도 Side-View XY 투영으로 플랫폼·문 색상·업그레이드·세이브 스테이션·적·투사체가 정상 렌더되도록 업데이트.

### [Wave 2-C] 브라우저 엔트리 & 스모크: `src/ui/main.ts`, `tools/smoke/smoke.ts`, `tools/smoke/capture-showcase.ts`
1. **`src/ui/main.ts`**:
   - 입력 매핑: `A/D` 또는 `←/→` 좌우 이동, `W/Space` 점프(누른 순간 edge + 코요테 + 공중 2단 점프), `S/↓` 원웨이 플랫폼 하강(`dropDown`), `Shift` 대시, `1~4` 무기, `R` 또는 `F` 콘솔/세이브 상호작용, 마우스 커서를 Side-View `z=0` 평면 월드 좌표로 투영해 `aimDirX/Y` 산출.
   - HUD 업데이트: `#boots-pill`, `#etank-pill`, `#etank-count`, 무기 해금 표시, `#minimap` 캔버스에 `renderMinimap(ctx, w, h, state)` 매 프레임 또는 상태 변경 시 호출.
   - 신규 사운드 이벤트(`doubleJump`, `doorBlast`, `saveStation`, `upgrade`)를 `audio.ts`에 연결.
   - `window.__reanimator` 및 `window.__reanimatorAdvance` 디버그/테스트 훅을 유지해 스모크 스크립트가 상태(`currentRoom`, `abilities`, `energyTanks`, `visitedRooms`, `pose`)를 조회·진행할 수 있게 함.
   - `#lab` 숨겨진 2D 랩 토글 호환 유지.
2. **`tools/smoke/smoke.ts` & `tools/smoke/capture-showcase.ts`**:
   - Playwright(로컬 Chromium 또는 headless shell)로 `dist` 또는 dev 서버에 접속해 `console.error`/`pageerror` `0`건, WebGL2 또는 2D 폴백 정상 렌더, 사이드뷰 이동·점프·2단 점프·사격·문 개방·미니맵·세이브·완주 또는 쇼케이스 장면 스크린샷 캡처를 새 메트로이드바니아 월드에 맞게 갱신.

### [Wave 2-D] 3D 테스트 & 도달성 검증기: `tests/game3d.test.ts`, `tools/game/reach3d.ts`
1. **`tools/game/reach3d.ts`**:
   - `buildFacilityMap3D()` 및 `stepBody3D()`를 사용해 6개 섹터 전 구간의 물리적 도달성을 결정적 시뮬레이션으로 검증.
   - 핵심 게이트 검증 항목:
     - Airlock -> Shaft 진입 가능 (Blue door 통과)
     - Shaft 하부 -> Mines 진입 및 `ped-scatter`, `thruster_boots`, `etank_mines`, `ped-grenade`, `save_mines` 도달 가능
     - `thruster_boots = false`일 때 Shaft 상부 `4.4m` 게이트 도달 불가(또는 게이트 의도 검증), `thruster_boots = true`일 때 도달 가능
     - Shaft -> Bio-Labs (`ped-grenade` 후 `yellow` door 통과) -> `bio-plat-3` -> `bio-grate-up` -> `etank_biolabs`, `ped-rail` 도달 가능
     - Bio-Labs / Shaft 상부 -> Security Deck (`save_security`, `consolePos`) 도달 가능
     - Security 활성화 + Rail 후 `red` door 통과 -> Core Vault (`e-core-warden`, `corePos`) -> `escape` door -> `room_airlock` `exitPos` 탈출 가능
   - 주의: sealed `tools/game/reach.ts`는 절대 건드리지 말 것!
2. **`tests/game3d.test.ts`**:
   - `motion3d` (원웨이 플랫폼 착지 + `dropDown`, 코요테 타임, 점프 버퍼, Thruster 2단 점프, `justLanded` -> `state = 4`), `world3d` (6종 문 잠금/해금, Thruster/EnergyTank 효과 `maxHp = 100 + 30*tanks`, SaveStation 회복, 봇 진행), `reach3d` 연계 검증을 포함한 단위/통합 테스트 구축.

---

## 6. Wave 3 최종 검증 · 시각 검수 · 커밋 절차

Wave 2가 모두 끝나면 Kiro는 아래 순서대로 Wave 3를 실행한다:

1. **게이트 실행**:
   ```bash
   export PATH="/Users/men1692/Desktop/AWS/Kiroween2026/.tools/node-v26.13.1-darwin-arm64/bin:/Users/men1692/.local/bin:$PATH"
   make check
   make smoke-local
   ```
   - `make check`에는 `typecheck`, `test-engine`, `reference-verify`, `reach`, `build`, `dist-guard`가 포함된다. 추가된 `tests/game3d.test.ts` 및 `reach3d`가 `Makefile`에 연결되어 있는지 확인하고, 필요 시 `Makefile`에 `test-game3d` / `reach3d` 타깃이 반영되었는지 점검·실행한다 (`tests/game.test.ts`와 `tests/reference.test.ts`는 수정 금지).
   - 최종 통과 리비전에서 `make reference-holdout`를 **딱 1회** 실행해 홀드아웃 PASS 확인.
2. **Playwright 스모크 & 쇼케이스 스크린샷 육안 확인**:
   - `tools/smoke/smoke.ts` 및 `tools/smoke/capture-showcase.ts` 실행.
   - 생성된 PNG를 직접 열어 아래 항목을 육안으로 검수한다:
     - Side-View 카메라 구도 및 Z축 배경 기둥·조명 가시성
     - 캐릭터가 달릴 때 하체가 지면을 미끄러지지 않고, 조준 반대 방향 이동 시 다리가 역방향 백페달을 밟는지
     - 점프 상승(`0.53~0.80s` 자세)과 하강(`0.80~1.08s` 자세) 포즈 분리 및 착지 완충
     - 양손 라이플 IK가 XY 360° 조준선을 향하는지
     - `#minimap-wrap` (`top: 3.2em; right: 0.85em;`), `#boots-pill`, `#etank-pill`이 `#hud-top` 또는 다른 HUD와 겹치지 않는지 (겹치면 `style.css` 수치 미세 조정 후 재검증)
3. **봉인 파일 무결성 & 문서 동기화**:
   - `git diff --name-only`로 봉인 파일(`src/engine/motion.ts`, `collider.ts`, `src/game/*`, `tools/game/reach.ts`, `tests/{game,reference}.test.ts`, `reference/**`)이 수정 목록에 전혀 없는지 확인.
   - `.kiro/specs/metroidvania-3d/tasks.md` 체크박스 모두 완료 처리.
   - `docs/PROGRESS_LOG.md`, `docs/STATUS.md`, `docs/NEXT_PLAN.md`, `docs/AGENT_BRIEF.md`, `docs/KIRO_USAGE.md`를 최신 검증 수치·커밋 해시로 갱신(줄 수 상한 `60/120/120/120/40` 엄수).
4. **Git Commit & Push**:
   - 사용자 요청대로 `main` 브랜치에 정리된 커밋 메시지를 작성해 `git add` -> `git commit` -> `git push origin main` 수행. (`node_modules/`, `.tools/`, 임시 스크린샷 아티팩트 등 추적 불필요 파일이 커밋되지 않도록 `.gitignore` 확인)
