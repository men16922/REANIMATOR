# G3 보고서 — 작은 완성 게임 (reanimated-slice)

2026-11-14 · Kiro 세션. 판정: **PASS (기계 검사 범위)**. 사람 플레이 관찰·재미·플레이 시간은 미확인(G5).

## 결과

| 검사 | 결과 | 근거 |
|---|---|---|
| `make check` (typecheck + 테스트 25 + 기준 시나리오 3 + 도달성 + build) | exit 0 | `Makefile` |
| `make smoke-local` (설치된 Chrome 157.0.8103.78) | 12/12 PASS | `tools/smoke/smoke.ts`, `docs/evidence/g3/smoke_light_{on,off}.png` |
| 맵 완주 가능성 (복원 엔진 BFS) | start→core, core→exit 도달 | `tools/game/reach.ts` |
| 조명이 물리·전투·적에 영향 없음 | 300 tick 동일(조명 제외) | `tests/game.test.ts` |
| 조명 경계 (0에서 강제 off, 15 미만 재점등 거부, 최대 cap) | PASS | 같은 파일 |
| 일시정지·포커스 상실 시 입력 해제·재시작 초기화 | PASS (브라우저) | smoke |
| holdout 회귀 (엔진 수정 후 재실행) | 4/4 PASS | `docs/evidence/g3/holdout_regression_after_g3.jsonl` |
| 빌드 산출물에 원본 파일 없음 | JS 12.6 kB, 원본 자산 미포함 | `dist/` |

## 복원 vs 신규 설계

- 복원: 플레이어 이동 규칙 전부(`src/engine/motion.ts`).
- 신규 설계: 타일 충돌(발 지점·반폭 6·키 28), 맵, 무기(지연 3 tick은 Lisp `laser_ufun`의 `fire_delay1 3` 값을 빌린 것이며 원본에서 관찰하지 않음), 크롤러, 피해, 코어·출구, 조명, 그래픽, 15 Hz tick(원본 tick rate 미측정).

## 엔진 변경과 회귀 (G2 이후)

1. `Collider` 인터페이스로 충돌 기하만 분리. 기준 시나리오는 `planeCollider`로 기존 상수 유지.
2. 신규 설계: 지상에서 바닥이 없으면 낙하 시작(원본 0x38704의 지면 탐침은 재구성하지 않음).
3. **버그 수정**: 착지 상태(6)에서 입력이 없을 때 정지 처리가 빠져 공중의 xacel이 남아 속도가 무한 증가. 바이너리 0x3a3e0의 정지 분기는 모든 지상 상태에 적용되므로 그에 맞게 수정. 도달성 BFS 디버깅 중 발견.
4. 각 변경 후 기준 시나리오 3개 PASS, holdout M05 재실행 PASS. holdout 결과로 엔진을 조정하지 않음.

## C01 원본 사격 관찰: NOT RUN

- 하네스로 상반신 객체·조준각·탄약을 기록하는 데는 성공(조준각 127–128°, 무기 타입 0, 탄약 0).
- 발사 입력을 B2(4번째)와 B1(3번째) 위치에 각각 30 tick 넣었으나 상반신 aistate가 0으로 유지됨. 두 실행의 로그는 sha256 `7ef2713d…` 로 **바이트 동일** → 어느 위치의 발사 입력도 반영되지 않음.
- 하네스 개발 중 추가로 찾은 엔진 제약(바이너리 근거): `current_weapon_type` 등은 객체 문맥 필요, `with_obj0`는 연결 객체 없으면 오류, 함수 본체 크기 제약(작은 함수로 분할).
- 원인 미확인. 시간 예산 안에서 중단하고 사격은 new-design으로 구현. 증거: `docs/evidence/g3/c01_attempts/`, 하네스 `reference/harness/HARNESS.C01.v9{,b}.LSP`.

## 도구

- Vite 8.3.8, TypeScript 7.0.2, @types/node 26.6.6, @playwright/test 1.65.1 (exact, lockfile).
- Playwright 번들 headless shell은 이 Mac에서 빈 페이지조차 rAF 0 frame/s, 스크린샷 timeout → 사용 불가로 판단하고 삭제(598 MB). 시스템 Chrome 채널(40 frame/s)을 읽기 전용으로 사용. Chrome이 없으면 스모크는 NOT RUN(exit 2).
- `fsevents` install script는 승인하지 않음(빌드 불필요).
- 이 환경에서 백그라운드 개발 서버 실행이 차단되어, 스모크는 서버 없이 Playwright request routing으로 `dist/` 파일을 제공한다.

## 미확인·한계

- 사람이 직접 플레이해 보지 않았다. 조작감·난이도·재미·3분 목표 달성 여부 모두 미확인.
- 음향·음량 조절 없음. 그래픽은 단색 사각형 수준.
- 적은 1종, 무기 1종, 맵 1개. 조명의 대가는 배터리뿐이라 선택의 재미가 약할 수 있다(G5 관찰 대상).
