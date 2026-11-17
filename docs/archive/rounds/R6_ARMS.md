# R6 Arms: Flamer (5) and Rocket (6)

Branch `r6/arms` (from main `7e58f01`). 새 설계이며 원본 Abuse의 데이터·코드는 쓰지 않았다. 브라우저 확인은 하지 않았다(**unverified**). 검증은 `make check` exit 0(321/321 테스트, reach3d, build, dist-guard).

## 무기 사양

| | 5 Flamer | 6 Rocket |
|---|---|---|
| 발사 | 누르고 있는 동안 3틱마다 화염 틱. 투사체 없음, 총구 기준 원뿔 판정 | 로켓 1발, 쿨다운 52틱 |
| 사거리/형상 | 4.6 m, 반각 0.36 rad(약 21°), 벽·지형이 가림(LOS), 몸 반경만큼 여유 | 직선. 속도 7 m/s에서 시작해 30 m/s²로 가속, 상한 27 m/s, 수명 150틱(만료 시 폭발) |
| 피해 | 틱당 2(근접 100%, 최대 거리 60%). 둥지 3, 통 2 | 직격과 폭발 피해 110(거리 감쇠, 하한 35%), 반경 3.8 m, 적 넉백 11 |
| 상태 | burn: 150틱 지속, 12틱마다 5 피해(상성 배율 적용), 사망 시 해제 | 자기 폭발로 로켓 점프 |
| 탄약 | 연료 90(틱당 1). 연료 0이면 Pulse로 복귀 | 로켓 8발 |
| 드롭 비율 | 드롭 값 v당 `ceil(v*2.2)` | `ceil(v*0.3)` |
| 모델 | `buildFlamer` 연료통+노즐, 메시 병합 후 9 이하 | `buildRocket` 어깨 발사관, 9 이하 |
| 반동 | kick 0.14, decay 24(가벼운 떨림) | kick 1.4, decay 5(가장 무거움) |

### 상성

`WEAPON_MATCHUP_3D[kind][5/6]`, `HIVE_MATCHUP_3D[5/6]`.

| | crawler | stalker | spitter | warden | hive |
|---|---|---|---|---|---|
| Flamer | 1.5 | 1.0 | 1.1 | 0.35 | 1.8 |
| Rocket | 1.1 | 1.2 | 1.0 | 1.0 | 1.6 |

burn 틱도 같은 상성 배율을 거치므로 Warden에는 틱당 1(최소값)만 들어간다. Flamer는 통(barrel)을 약 30틱에 터뜨린다. 로켓은 잠금 문과 Rail 판을 열지 않는다(`DOOR_REQUIRED_WEAPON` 불변).

### 로켓 점프 (`ROCKET_JUMP_3D`, `rocketJump3D`)

- 폭발 중심과 플레이어 중심 거리 ≤ 3.2 m이면 밀려난다. 거리 비례 `f`. 수평 `9*f`(상한 |vx| 13), 수직 `12*f*uy`.
- 수직은 `vy`가 8.4 m/s를 넘지 않게만 올리고(이미 넘었으면 건드리지 않음), 체공 1회에 한 번만 적용한다(`rocketBoosted`, 착지 시 해제). 지면에서 단독으로는 약 0.76 m 상승.
- 자기 피해 `round(7*f)`. 무적·콤보 끊김 없음, HP는 1 아래로 내려가지 않는다. 이벤트 `rocket_jump`(value = 자기 피해).
- 이론 상한: 점프 정점 2.29 m + 캡 1.44 m + step-up 0.38 m = 4.11 m, 게이트 4.4 m 미만.

## 획득 위치 (좌표, `map3d.ts`)

| id | 무기 | x, y | 위치 |
|---|---|---|---|
| `ped-flamer` | 5 | 43.8, 4.4 | Bio-Labs 서쪽 상단 단(`bio-ledge-w`). 첫 발판(`bio-plat-1`, y 2.2)에서 점프 1회. 선택 경로. Boots 불필요 |
| `ped-rocket` | 6 | 51.5, 8.8 | Security Deck, 콘솔(54~55) 서쪽. 콘솔 너머이고 보스 문(red, 69.6~70.4)보다 앞 |

`weaponsTotal` 3 → 5, completion total 20 → 22. 탄약 드롭, Ammo Expansion(+초기 탄약의 50%), Save 충전(초기 탄약 × (1 + 0.5 × 확장 수))에 둘 다 포함된다. 5·6 탄약은 해금 전에는 드롭을 받지 않는다(2~4는 기존대로).

## UI

- HUD 칩 `wpn-5`, `wpn-6`(`index.html`), 키 5·6, Q 순환은 6종. 획득 배너 `WEAPON_BANNER[5/6]`.
- Classic HUD 슬롯 6개(`SLOT_X0=74`, `SLOT_W=25`, `SLOT_PITCH=26`, 끝 x=229, KILLS 열 232 앞). 7×7 픽셀 아이콘: 불꽃, 미사일.
- 화염 연출(렌더 전용, `fx3d.armsEmitters`): 총구 화염 줄기, 불붙은 적 화염·연기, 바닥 잔불 글로우(데칼), 산성 풀 위 잔불은 증기. `w.embers`는 렌더 전용 목록이고 로직이 읽지 않는다(테스트로 확인).
- 로켓: `vfxStyle3d` 스타일, 배기 불꽃과 연기 트레일, 총구 후폭풍. 폭발은 기존 `explosions` 경로를 쓴다.
- `scene3dFull.ts`는 페데스털 색만 추가(5 주황, 6 노랑). 로켓 메시는 만들지 않았다(투사체는 파티클 풀로만 그린다).

## 이벤트 ID와 오디오 매핑 (트랙 C용)

`audioLogic.EVENT_SOUND`는 50종(이전 46 + 4). 전용 레시피가 없어 기존 레시피를 `cueForEvent`로 조정해 빌렸다.

| 이벤트 | 현재 매핑 | pitch / gain | 비고 |
|---|---|---|---|
| `flamer` | `weapon.scatter` | 점화(value 1) 0.55 / 0.7, 유지(value 0) 0.7 / 0.4 | 첫 틱과 이후 5틱마다 |
| `rocket` | `weapon.grenade` | 0.7 / 0.95 | 발사 |
| `burn` | `weapon.hit` | 1.7 / 0.3 | burn 틱이 들어간 틱마다 1회 |
| `rocket_jump` | `player.stomp` | 1.25 / 0.75 | value = 자기 피해 |

폭발 소리는 기존 `explosion` 이벤트가 낸다. `tests/audio.test.ts` 이벤트 수를 50으로 갱신했다.

## reach3d 검사 (`tools/game/reach3d.ts`)

- `rocketJumpReaches`: 실제 `stepWorld3D`로 Boots·Crawl Slide 없이, 적 제거, 모든 문 개방 상태에서 탐색한다. 점프 시점 4 × 점프 유지 2 × 발사 시점 8 × 조준 4(90°, 62°, 35°, 118°) × 수평 입력 2 × 대시 2, 추가로 24틱 뒤 두 번째 로켓.
- 사이트 5곳: Boots 게이트 3(shaft 상부 38,4.4→31,8.8 / security 65,4.4→65,8.8 / 55,4.5→65,8.8, 발이 목표 높이에 닿으면 실패) + 터널 2(`tun-underfloor`, `tun-service`, 출구에 착지하면 실패).
- 결과: 우회 0건, 게이트 최대 상승 2.68 m / 4.40 m.
- 대조 실험: 수직 캡·세기·반경을 풀면 게이트에 닿는다(탐색이 무뎌지지 않았다는 증거). 실행 후 상수를 복원한다.
- `buildCompletionLegs`에 `ped-flamer`, `ped-rocket` 구간 추가, `checkCompletion`이 모든 페데스털에 구간이 있는지 확인.
- 소요 약 10 s 추가(reach3d 전체 약 26 s).

## 균형

- 봇 결과는 변경 전과 같다(`createBot3D` 수정 없음): won, 최종 HP 112/160, 사망 0, 5362틱, 처치 56. 봇은 Flamer 페데스털을 지나가지 않고, Rocket은 `past console`에서 주워 쓰지 않고 지닌다(무기는 `chooseWeapon`이 매 틱 정한다). 새 무기를 쓰게 하면 시간과 HP가 달라지므로 쓰게 하지 않았다.
- `difficulty.ts`(reckless): `{"ticks":3600,"hpLost":245,"deaths":2,"kills":4,"endX":41.18}`. main과 동일(새 무기는 reckless 정책에서 쓰이지 않는다).
- completion 비율은 봇 기준 `found 10/22`(45%).

## 변경 파일

`types3d.ts`(슬롯 6, 이벤트 4), `world3d.ts`(메타, 상성, 원뿔, burn, 로켓, 로켓 점프, 엠버, 탄약), `map3d.ts`(페데스털 2), `reach3d.ts`, `heroGear3d.ts`, `heroPose.ts`, `classicHud.ts`, `fx3d.ts`(화염·로켓 레시피), `vfxStyle3d.ts`, `scene3dFull.ts`(색 1줄), `audioLogic.ts`, `flow.ts`, `main.ts`·`index.html`(칩과 키 연결만). 테스트: 신규 `tests/arms.test.ts`(30), 수치 갱신 `audio/classic/game3d/metroid/ui`.

main.ts 변경은 슬롯 목록(1~6), 키 5·6, 배너, HUD 전달 인자뿐이다. 트랙 D가 UI를 고치면 `[1, 2, 3, 4]` 반복문과 `wpn-5/6` 칩이 충돌할 수 있다.

## 재현

```
make check                                  # 6 무기, 321 테스트, reach3d(ROCKET JUMP 줄 포함)
node --test tests/arms.test.ts
node tools/game/reach3d.ts | grep -E "ROCKET|METROID"
```

브라우저(unverified): `__reanimatorAdvance(inputs, setup)`의 `setup`(`DebugSetup3D`, `main.ts` 약 1063행)에 `weapons: [1,2,3,4,5,6]`을 주면 5·6이 초기 탄약으로 해금된다.

```js
// 화염: 불붙는 크롤러 앞에서 5번 무기를 쥐고 1초간 사격(60 입력)
__reanimatorAdvance(Array(60).fill({ fire: true, weaponSlot: 5, aimX: 48, aimY: 1.1 }), { weapons: [1,2,3,4,5,6], x: 44, y: 0, skipIntro: true })
// 로켓 점프: 6번 무기로 발밑을 조준해 1발
__reanimatorAdvance([{ fire: true, weaponSlot: 6, aimX: 6.2, aimY: -0.5 }, ...Array(40).fill({ aimX: 6.2, aimY: -0.5 })], { weapons: [1,2,3,4,5,6], x: 5, y: 0, skipIntro: true })
```
