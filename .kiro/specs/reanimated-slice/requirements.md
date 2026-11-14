# reanimated-slice — Requirements (G3)

선행: `restored-motion` G2 PASS. 작성 메모: 이 spec은 구현과 같은 세션에 작성됐다(사전 사용자 검토를 거친 spec이 아님).

## 목표

시작 → 교전 → 코어 회수 → 탈출/패배 → 재시작이 완결되는 작은 브라우저 2D 액션. 플레이어 이동만 복원 엔진, 나머지는 new-design.

## Requirements (EARS)

- R3.1 THE game SHALL use the restored rules in `src/engine/motion.ts` for player motion; collision geometry comes from a tile collider (new-design).
- R3.2 WHEN the player presses E, THE light SHALL toggle subject to battery rules (drain 1/tick on, recharge 0.4/tick off, forced off at 0, relight only at ≥ 15).
- R3.3 THE light SHALL NOT change motion, combat, or enemies (test: worlds identical except `light`).
- R3.4 THE map SHALL be completable: start → core → exit reachable under the restored motion engine (BFS check in the gate).
- R3.5 WHEN Esc is pressed or focus is lost, THE game SHALL pause and release held inputs.
- R3.6 WHEN hp reaches 0, THE run SHALL end as lost; WHEN the core was taken and the exit is reached, THE run SHALL end as won; restart SHALL produce a fresh world.
- R3.7 THE first screen SHALL offer Play as the primary action and a "How it was revived" panel that separates restored and new parts.
- R3.8 THE build SHALL NOT include the original EXE, data, or captures.

## 범위 밖

원본 사격·피격 복원(C01 관찰 NOT RUN), 음향, 3인 관찰, 3분 플레이 시간 측정.
