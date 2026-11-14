# G4 보고서 — 안정화

2026-11-14 · Kiro 세션. 판정: **부분 완료**. 기계 검사 항목은 완료, 사람이 해야 하는 항목(플레이 시간·재미)과 hook 실트리거는 미완.

## 완료

| 항목 | 결과 | 근거 |
|---|---|---|
| 맵 확장 (3분 흐름: 안전 구역 → 크롤러 홀 → 어두운 등반 → 코어 → 상단 통로 탈출) | 완주 가능, BFS 경로 ≈ 20 s(적 무시 하한) | `src/game/map.ts`, `tools/game/reach.ts` |
| 탈출 웨이브 (코어 회수 시 상단 통로 크롤러 활성) | 구현·테스트 통과 | `src/game/world.ts` (`dormant`) |
| 음향 (WebAudio 합성, 파일 없음) + 음량 슬라이더(타이틀·일시정지) | 스모크 확인 | `src/ui/audio.ts` |
| Restoration Lab (기록 vs 재구현, 필드 표, tick 스크러버, Demo mutation) | 브라우저에서 4 시나리오 PASS, 변조 FAIL(n=33 x) | `src/ui/lab.ts`, `docs/evidence/g3/lab_*.png` |
| verify와 Lab이 같은 시나리오 코드 사용 | `tools/reference/scenario.ts`로 분리, 회귀 PASS | |
| 성능 | 0.008 ms/tick, 플레이 중 60.5 fps(headless Chrome) | `tools/game/bench.ts`, smoke |
| 공개 빌드 권리 가드 | dist 3 파일 63 kB, 원본 218 해시·이름·MZ·extender 서명 없음. 심은 원본 파일 탐지 | `tools/release/check-dist.ts`, `make check` |
| 평가 기록 | `docs/EVALUATION.md`, G5 양식 `docs/evaluation/PLAYTEST_FORM.md` | |

## 미완

- 사람 플레이: 실제 플레이 시간(3분 목표), 난이도, 조명 선택의 재미 모두 미측정 → G5.
- (정정) Kiro hook `engine-gate-on-save`는 이 세션에서 4회 실행됨(`docs/evidence/g2/hook_runs.log`, 모두 exit 0). 유발 파일명은 미기록.
- `.kiro/settings/mcp.json` REA 등록(권한 차단) — 사용자 작업.
- 그래픽은 단색 도형. 신규 아트는 계획상 우선순위가 낮다(축소 순서상 장식 효과는 먼저 줄인다).

## 이번 단계 실패와 수정

1. 맵 변경 후 스모크의 시작 x 하드코딩(40)이 깨짐 → 게임이 노출하는 `START`를 사용.
2. Lab 변조 검사가 벽에 닿지 않는 M05를 골라 PASS → 변조가 영향을 주는 S1을 명시 선택(M05 PASS는 올바른 결과).
3. dist 가드가 설명문의 "DOS/4GW" 텍스트를 바이너리로 오인 → extender 배너 바이트로 한정.

## 후속 갱신 (2026-11-14, Full 3D Quarter-View)

위 표는 G4 당시(Canvas 단색 도형, dist 3 파일 63 kB) 기록이며 그대로 보존한다. 이후 `src/game3d/`(60 Hz)·`src/render3d/`(WebGL2)·Meshy 7.1 9종(`reanimator-meshy-assets-v2`)이 추가되었다. 최신 관찰: `make check` exit 0(35/35, `reach3d` 10 waypoint 573 ticks), `make reference-holdout` 4/4, `make smoke-local` 22/22(`webgl-3d`, `loadedModels: 9`, `60.5 fps`), `dist-guard` `12 files / 14,304,572 B / 218`. 갤러리 6장은 `docs/evidence/g4_playable/`. "그래픽은 단색 도형" 항목은 해소되었고, 사람 플레이(G5)는 여전히 미완이다.
