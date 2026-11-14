# G2 보고서 — 복원 세로 구현 (restored-motion)

2026-11-14 · Kiro 세션. 판정: **PASS (범위 한정)**. Canvas/UI는 미착수(G3).

## 결과

| 시나리오 | 구분 | 구간 | 행 | 필드 | 상태 |
|---|---|---|---|---|---|
| S1-spawn-fall-run-wall | 개발 (M01·M03) | n3–102 | 100 | x y xvel yvel dir state xacel yacel gravity fyvel fyacel | PASS |
| S2-jump | 개발 (M02) | n151–185 (착지 포함) | 35 | 동일 | PASS |
| S3-wall-air-jump | 개발 (전 M04 holdout) | n3–61 | 59 | 동일 | PASS |
| M05-holdout-jump-in-place | **holdout** | n3–90 | 88 | 동일 | **PASS** |

- 허용 오차: 전 필드 정확 일치(0). 엔진 실행 전에 고정했고 FAIL 후 넓히지 않음.
- 증거: `docs/evidence/g2/holdout_M05_result.jsonl`, 판정 직전 해시 `holdout_M05_pre_run_hashes.txt`(엔진 `ffbdafe8…`).
- 원본 근거: 원본 EXE `8ba92587…1074f` 실행 로그(하네스 v8). 각 시나리오 3회 sha256 동일. 엔진은 expected를 읽지 않음, 비교기만 읽음.

## holdout 이력 (정직한 기록)

1. 첫 holdout M04는 `--holdout` 첫 판정에서 **FAIL** (n=59 `xacel` expected -8, actual 0). 기록: `holdout_M04_result.FIRST_JUDGEMENT.jsonl`(읽기 전용).
2. 원인 분석(바이너리 0x14760/0x3a1d8 + 로그)으로 엔진 규칙 3개 수정: 터미널 속도 시 `yacel=0`, state 4→5 tick 시작 전이, 공중 xacel·벽 충돌 처리.
3. 계약 §5에 따라 M04를 개발 시나리오 S3으로 이동. 새 holdout M05는 원본에서 **엔진 수정 전에** 생성·해시 후 봉인(내용은 판정 전에 보지 않음). 판정은 1회.
4. 수정 후 S2의 구간을 착지(n185)까지 늘렸다. 이는 수정 후 검증이므로 `scenarios.json` knownLimits에 명시.

## 변조·gate 확인

- 비교기: PASS/FAIL(첫 차이)/길이 불일치/누락 필드/ERROR(손상)/NOT RUN(없음·빈 집합) 테스트 15개 통과.
- 변조: 벽 x 31로 바꾸면 FAIL, 입력 스크립트 변조는 ERROR, 기준 파일 없음은 NOT RUN.
- `make check` = 엔진 테스트 + 개발 시나리오. fixture 제거 시 exit 2, 엔진 상수 변조(`start_accel` 8→7) 시 exit 2, 복원 후 exit 0. `make smoke-local`은 NOT RUN(exit 2).
- Make 3.81은 `export PATH`를 단순 명령에 적용하지 않아 `$(NODE)` 절대 경로로 고정(첫 실행에서 v26.11.0 사용을 발견·수정).

## 복원 범위와 한계 (복원 주장 상한)

- 복원한 것: 평지 이동 시작(좌우 비대칭)·정지·좌측 벽, 중력·점프·천장·낙하/점프 착지, 공중 입력(벽 접촉 상태).
- 지형은 원본 맵 데이터가 아니라 **관찰한 기하 상수**(floorY 91, ceilY 43, wallLeftX 32)를 시나리오가 선언한다. level00 전체 충돌 복원이 아니다.
- 미검증: 경사 이동, 자유 비행 중 수평 이동/상한 10, 달리기 중 점프, |xvel|>9 정지, walk_top_speed, 객체 충돌, 사다리, RNG(NOT RUN).
- 착지 tick에서 벽에 막힌 xvel=-8(M04 n62) 설명 불가 → S3 창에서 제외.
- 판정 종류는 `reference-state`(상태 비교, 하네스 계측 있음). 비계측 관찰 비교는 G1의 생성 화면 일치 1건뿐.
- holdout은 2개 판정에서 1 FAIL → 규칙 수정 → 1 PASS. 같은 규칙군의 일반화 증거이지 전체 호환성이 아니다.

## 다음 (G3)

사격·적·맵·조명 등 게임 요소와 Canvas. 복원 범위 밖의 동작은 `new-design`으로 구분 표기. 필요한 경우 사격(C01)·피격(C02) 관찰 가능성부터 확인.
