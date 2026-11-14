# Design: Metroidvania 3D (Side-View)

## 구조

| 층 | 경로 | 역할 |
|---|---|---|
| 인계/실행 가이드 | `docs/plans/KIRO_METROIDVANIA_HANDOFF.md` | Wave 2–3 Kiro 전면 인계 명세 |
| 타입 | `src/game3d/types3d.ts` | 공유 계약 (Wave 0–1 완료) |
| 시뮬레이션 | `src/game3d/world3d.ts`, `map3d.ts`, `bot3d.ts` | 60 Hz 결정적 상태, 레벨(`map3d.ts` Wave 1 완료), 봇 |
| 이동 | `src/engine/motion3d.ts` | XY 사이드뷰 이동, 점프, 공중 점프 (Wave 1 완료) |
| 렌더러·포즈 | `src/render3d/riggedModels.ts`, `scene3dFull.ts`, `fallback2d.ts` | `riggedModels.ts` split-body IK·점프 스크럽·백페달 완료; `scene3dFull.ts` 사이드뷰 카메라 Wave 2 대기 |
| HUD | `src/ui/` (`minimap.ts`, `audio.ts`, `main.ts`) | 미니맵·오디오·HTML/CSS 완료; `main.ts` 연동 Wave 2 대기 |
| 봉인 | `src/engine/motion.ts` 등 | 변경 금지 (R8) |

## 월드: 6개 섹터 (Wave 1 `map3d.ts` 확정 배치)

```
                              [security (Save/Console)]
                                        │ (top / biolabs 연계)
[airlock (Start/Exit)] ──blue/escape── [shaft (4.4m Gate / Scatter 하부)] ──yellow── [biolabs (ETank/Rail)] ──red── [core (Warden/Core)]
                                        │
                                      green
                                        ▼
                       [mines (Thruster Boots / ETank / Grenade / Save)]
```

- 평면은 XY, `z = 0` 이동면(배경 기둥 `z = -2.4`, 렌더 전용 깊이 레이어). 카메라는 플레이어를 따라가는 사이드뷰 원근 카메라.
- 각 방은 `RoomDef3D`이며 `gridX/Y/W/H`가 미니맵 좌표다(`airlock (0,1,3x1)`, `shaft (3,0,2x4)`, `mines (0,3,3x1)`, `biolabs (5,1,3x2)`, `security (5,0,3x1)`, `core (8,1,3x2)`).

## 능력 게이트 순서 (`map3d.ts` 기준)

1. `airlock`: Pulse 기본 소지 → `door_airlock_shaft`(`blue`) 개방.
2. `shaft` 최하단: `ped-scatter` `(38.5, -11.0, 0)` 확보 → `door_shaft_mines`(`green`) 개방.
3. `mines`: `thruster_boots` `(3.0, -8.6, 0)`, `etank_mines` `(5.5, -8.6, 0)`, `ped-grenade` `(8.5, -8.6, 0)`, `save_mines` `(20.0, -11.0, 0)` 확보 → `door_shaft_biolabs`(`yellow`, Cracked Bio-Wall) 파괴 개방.
4. `shaft` 상부 + `biolabs`: `thruster_boots` 공중 점프로 `shaft` 상부 `4.4 m` 게이트 및 `biolabs`(`etank_biolabs` `(55.0, 4.5, 0)`, `ped-rail` `(65.5, 2.2, 0)`) / `security`(`save_security` `(45.5, 8.8, 0)`, `consolePos` `(54.5, 8.8, 0)`) 도달.
5. `biolabs` → `core`: Rail-Cannon + Security `console` 활성화 → `door_boss`(`red`) 개방 → `e-core-warden` & `corePos` 파괴.
6. 탈출: Meltdown 후 `door_escape`(`escape`) 개방 → `room_airlock` 상부 `exitPos` `(5.5, 5.2, 0)` 탈출.

정확한 도달성은 Wave 2에서 `tools/game/reach3d.ts`가 능력 집합별로 검증한다.

## 능력 상태

`abilities = { thrusterBoots: boolean }`, `Body3D.jumpsUsed: number`, `energyTanks: number`, `maxHp = 100 + 30 * energyTanks`.
`motion3d.ts`의 `stepBody3D()`는 `input.maxJumps`(1 또는 2)와 `input.dropDown`, `input.lockZ`를 받아 공중 점프·코요테 타임·점프 버퍼·원웨이 플랫폼 하강을 처리하며, 지상 착지 시 `jumpsUsed = 0` 및 `state = 4` (`landTicks = 5`)를 설정한다.

## 문

`MapSolid3D.doorLock`이 종류를 정한다. 탄 충돌 시 `weapon → DoorLockKind3D` 표로 판정한다.

| 잠금 | 해제 조건 |
|---|---|
| blue | Pulse 명중 |
| green | Scattergun 명중 |
| yellow | Grenade 폭발 |
| red | Rail 명중 + Security 키 |
| console | 콘솔 반경 내 `F` |
| escape | Meltdown 시작 |

`isSolidActive`가 열린 문 id 집합(`w.openDoors`)을 참조해 충돌을 끈다.

## 저장

`SaveSnapshot { roomId, hp, maxHp, ammo, abilities, tanks, openDoors, visitedRooms, pickups }`. 저장은 시뮬레이션 상태의 직렬화 복사이며 `light`를 포함하지 않는다. 저장 위치는 메모리와 `localStorage` 키 `reanimator.save.v1`.

## 미니맵

`visitedRooms: Set<string>`은 시뮬레이션이 갱신하고 HUD는 읽기만 한다. 방 사각형은 `gridX/Y/W/H`, 문 색은 `doorLock`, 아이콘은 `hasSave/hasBoss/hasExit`로 그린다.

## 포즈 파이프라인 (Wave 1 `src/render3d/riggedModels.ts` 구현 완료)

입력: `PlayerPoseState3D` (`stepRiggedAnimation3D` 7번째 인자). 별도 `pose3d.ts` 파일 없이 `riggedModels.ts`에 통합 구현되었으며 Wave 2 `scene3dFull.ts` 연결 대기 중이다.

- **Split-body**: `scene3dFull.ts`가 플레이어 `rig.root.rotation.y`를 `aimSignX > 0 ? +PI/2 : -PI/2`로 고정한다.
- **양손 XY 360° 라이플 IK**: `applyTwoHandedRifleIK` + `riflePivot` 월드 기저 고정으로 월드 공간 쿼터니언 정렬을 적용한다(Mixamo `+Y` 본 축 때문에 로컬 오일러 축 회전 사용 금지).
- **점프 3단계 & 루트 클램프**: `pose.vy`에 맞춰 Meshy `jump` 클립(`1.867s`) 중 지상 웅크림 `0.00..0.50s`를 건너뛰고 **`0.53s..0.80s`(상승) / `0.80s..1.08s`(하강)** 구간을 스크럽한다. `hipsBaseY`로 `+0.42m` 루트 스파이크를 클램프하며, `pose.landingFactor`로 착지 무릎 완충 포즈를 적용한다.
- **역방향 다리 백페달**: `moveX`와 `aimSignX`가 반대 부호이면 walk/run 클립 `timeScale`을 음수로 재생한다.
- 모든 계산은 시뮬레이션을 읽기 전용으로 사용한다.

상세 파일별 Wave 2–3 작업 명세는 `docs/plans/KIRO_METROIDVANIA_HANDOFF.md`를 따른다.

## R3.3 격리

`w.light`는 `scene3dFull.ts`와 HUD 모듈만 import/참조한다. `tests/game3d.test.ts`의 `deepEqual` 테스트를 사이드뷰 월드에 맞게 유지하며, 문/저장/업그레이드 로직 포함 입력 시퀀스를 추가한다.

## 복원 보존

`#lab`, `motion.ts`, 봉인 파일은 손대지 않는다. `motion3d.ts`는 `motion.ts`를 import만 하고 수정하지 않는다. 신규 코드는 new-design으로 표시한다.

## 검증 전략

| 항목 | 방법 |
|---|---|
| 섹터 그래프 | 단위 테스트: 대칭 이웃, 전체 도달성 |
| 문/무기 매핑 | 단위 테스트: 6종 × 6무기 표 |
| 부츠 게이트 | `reach3d`: 부츠 없음 → 4.4 m 불가, 부츠 있음 → 가능 |
| 탱크/저장 | 단위 테스트: +30 HP, 1회 획득, 저장 후 사망 복귀 |
| 포즈 | 단위 테스트: 순수 함수 출력, 역다리 부호, 점프 3단계 경계 |
| R3.3 | 360틱 `deepEqual` |
| 전체 | `make check`, 봇 완주(`playthrough.ts` 갱신), `make smoke-local` |

## 위험

- 4.4 m 게이트 높이는 기본 점프 최고점과 마진이 필요하다. 물리 값 확정 전까지 `reach3d`가 판정한다.
- 기존 쿼터뷰 `full-3d-quarter-view` 코드와 교체 범위가 크다. 타입은 이미 메트로이드바니아용으로 갱신되어 있다.
- 신규 리깅 클립(jump 3단계)은 기존 Meshy 클립 `jump`만으로 스크럽한다. 추가 자산은 범위 밖이다.
