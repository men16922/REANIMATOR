# restored-motion — Design

```
src/engine/motion.ts        순수 step()
tools/reference/hlog.ts     원본 hlog 파서 (expected 로더)
tools/reference/compare.ts  비교기 (expected vs actual)
tools/reference/verify.ts   시나리오 실행 CLI (exit code 반영)
reference/fixtures/         scenarios.json + expected/*.hlog.txt (원본 실행 기록, 수치만)
tests/*.test.ts             node:test (엔진 경계·비교기 FAIL/ERROR/NOT RUN)
```

## 지형 계약 (variant-contract geometry)

원본 level00 데이터를 읽지 않는다. 관찰된 기하 값만 시나리오에 선언한다: floorY=91, ceilY=43, wallLeftX=32. 이 값은 원본 관찰에서 나온 입력 조건이며 expected 값이 아니다. 이 지형 밖의 동작은 검증 범위 밖이다.

## tick 모델

로그 행 n은 입력 n 적용 전 상태. `row[n+1] = step(row[n], input[n])`. 초기 상태는 `initialStateId`로 스냅샷(n2 spawn, n151 정지)이며 스냅샷 이후 전이만 검증한 것으로 표시한다.

## 수치 규칙 (BEHAVIOR_MAP 참조, 0x3a1d8/0x38704)

- 수평: idle+xm>0 → xvel=9; xacel=±start_accel(8); |xvel+xacel|>limit이면 xacel=±limit−xvel; xvel+=xacel; 이동 후 xvel=실제 이동량.
- 수직: 소수 누산기 fyacel(+200/tick, 올림→yacel), fyvel; 부호 보정(음수 속도면 소수부 반전); yvel=이동 후 실제 변위.
- 착지: state 6을 3 tick 유지 후 2.
