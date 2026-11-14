# restored-motion — Requirements (G2)

선행: `abuse-reference` G1 PASS (`docs/evidence/G1_REPORT.md`). 판정 규칙: `docs/reference/VERIFICATION_CONTRACT.md`.

## 목표

원본 `mover` 경로(0x3a1d8/0x38704)의 수평 이동·정지·벽·수직 적분(중력)·점프를 순수 TypeScript 엔진으로 재구현하고,
원본 실행 로그(v8 hlog)를 독립 expected로 하는 비교기로 판정한다.

## Requirements (EARS)

- R2.1 THE engine SHALL be a pure function `step(body, input, terrain) -> body` with no DOM, clock, RNG, or fixture access.
- R2.2 THE engine SHALL NOT read expected values. 비교기만 expected와 actual을 함께 읽는다.
- R2.3 WHEN input xm≠0 from idle, THE engine SHALL reproduce the observed asymmetric start (right: xvel=+9, left: xvel=-8 then -9).
- R2.4 WHEN xm=0 while running, THE engine SHALL stop within the same tick without advancing x (observed).
- R2.5 WHEN a move is blocked by the left wall, THE engine SHALL set xvel=0, xacel=0, state=2.
- R2.6 THE engine SHALL reproduce gravity (8-bit fixed point), jump start (yvel=-15), ceiling contact, and fall landing.
- R2.7 THE comparator SHALL return PASS/FAIL/ERROR/NOT RUN per VERIFICATION_CONTRACT §7, with firstDifference and excludedFields.
- R2.8 IF fixtures are missing or corrupt, THEN the verifier SHALL return ERROR/NOT RUN and exit non-zero. 빈 집합은 PASS가 아니다.
- R2.9 THE holdout scenario SHALL be judged once, after development scenarios pass, and SHALL NOT be used to tune the engine.
- R2.10 THE verifier SHALL record scenarioId, reference hash, input hash, toolVersions, validationKind, measuredFields, excludedFields, toleranceContract, status.

## 범위 밖 (G2)

경사 이동, 객체 충돌, 사다리, 점프 착지 마지막 tick(n179 y=90 현상), 달리기 중 반대 방향 전환, walk_top_speed 경로, RNG, Canvas/UI.
이들은 excludedFields 또는 NOT RUN으로 남기며 PASS로 계산하지 않는다.

## 통과 조건

S1(이동·정지·벽·낙하 착지), S2(점프 상승·천장·하강) 개발 시나리오 PASS, holdout M04 1회 판정, 비교기 변조 테스트 통과.
