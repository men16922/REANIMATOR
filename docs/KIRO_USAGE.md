# Kiro 사용 기록

Kiro가 실제로 수행한 작업만 적는다. (Codex의 계획·도구 정비는 제외)

## 2026-11-14 — G0 (spec `abuse-reference`)

- 수행: `/harness-sync` 컨텍스트 복원 → spec 3종 작성 → 원본 취득·해시·압축 목록 검사 → EXE 형식 판정 → 자산·권리 등록부 → DOSBox Staging 프로젝트 범위 설치 → 원본 1회 실행·캡처.
- 파일: `.kiro/specs/abuse-reference/*`, `reference/manifests/abuse-source.json`, `docs/reference/ASSET_REGISTER.md`, `docs/evidence/G0_REPORT.md`, `docs/evidence/g0/run1_t0.png`.
- 결과: 권리(EULA 역공학 금지)·형식(DOS/4GW LE) 쟁점 보고 → 사용자 옵션 A 지시.

## 2026-11-14 — G1 (spec `abuse-reference` task 7–8)

- 수행: Ghidra 12.2·Temurin 25 프로젝트 범위 설치, Ghidra arm64 native decompiler 소스 빌드, `scripts/rea-env.sh`.
- REA CLI 실사용: `inspect`(원본 → stub만, 변환본 → 1,544 procedures), `instructions` 0x1d3fd/0x3a1d8, `decompile-all` 1,544 함수.
- `scripts/le2elf.py` 작성: LE 파싱·fixup 17,885 적용·ELF 변환, Watcom 진입 문자열로 매핑 검증.
- builtin 등록 테이블 289개 추출(`docs/evidence/g1/builtin_table.json`), mover 경로 주소 연결.
- 관찰 하네스(`reference/harness/HARNESS.v7.LSP`) + `scripts/observe.sh` + `scripts/analyze_hlog.py`. 하네스 실패 3종을 바이너리 분석으로 원인 확인 후 수정.
- 결과: 3회 바이트 동일 trace, 정적 예측과 일치. holdout M04 3회 동일. `docs/evidence/G1_REPORT.md`.
- REA MCP: `scripts/rea-env.sh --mcp` stdio initialize+tools/list 255 직접 확인. `.kiro/settings/mcp.json` 작성은 권한 규칙으로 차단 → Kiro 내 MCP 연결 미완료.
- 미수행: hook(G2 검사 명령 생성 후), 커밋·공개.

## 2026-11-14 — G2 (spec `restored-motion`)

- 수행: spec 3종 작성 → 낙하·점프 소수 적분 규칙을 로그와 파이썬으로 맞춰 확정 → TS 엔진(`src/engine/motion.ts`), 로그 파서·비교기·verifier(`tools/reference/`), node:test 15개, `Makefile` gate.
- 하네스 v8(xacel/yacel/소수 누산기/gravity 기록 추가)로 개발·holdout 로그 생성, 시나리오당 3회 동일 해시.
- 실패와 수정(실제 기록): ① hlog 파서 무결성 검사 버그 → 수정. ② 첫 holdout M04 FAIL → 바이너리(0x14760 `yacel=0`)와 로그로 원인 확인, 엔진 수정, M04를 개발로 이동, 새 holdout M05 PASS. ③ Make 3.81이 PATH를 무시해 전역 Node 사용 → `$(NODE)` 절대 경로.
- 산출: `docs/evidence/G2_REPORT.md`, `docs/evidence/g2/`.
- 미수행: Kiro hook(실제 트리거 로그 없음), Kiro 내 MCP 연결, Canvas.
- Hook: `.kiro/hooks/engine-gate-on-save.json` 작성(PostFileSave → `make check`, 로그 `docs/evidence/g2/hook_runs.log`).
  - 정정(체크포인트): "다음 세션부터 활성"이라고 적었으나, 같은 세션에서 **실제로 4회 실행됨**: 2026-11-14 08:53:05Z, 08:53:12Z, 09:06:48Z, 09:07:05Z, 모두 `make check exit=0`. 마지막 출력 `docs/evidence/g2/last_hook_gate.log`. 어느 저장이 각 실행을 유발했는지는 로그에 파일명이 없어 특정하지 못했다.

## 2026-11-14 — G3 (spec `reanimated-slice`)

- C01 원본 사격 관찰 하네스 6회 시도(작은 함수 분할·객체 문맥 등 엔진 제약 3건 추가 발견) → 발사 미반영으로 NOT RUN.
- 엔진 `Collider` 분리, 타일 충돌, 맵, 도달성 BFS(`tools/game/reach.ts`), 무기·크롤러·조명·승패(`src/game/`), Canvas·UI(`src/render`, `src/ui`, `index.html`).
- BFS 디버깅으로 엔진 버그 발견·수정(착지 상태 정지 누락). 기준 시나리오·holdout 회귀 PASS.
- 스모크(`tools/smoke/smoke.ts`) 12/12, `make check` exit 0. Playwright headless shell 불능을 실측하고 Chrome 채널로 전환.
- 산출: `docs/evidence/G3_REPORT.md`, `docs/evidence/g3/`. 미수행: 사람 플레이, 음향, hook 실트리거.

## 2026-11-14 — G4 (안정화)

- 맵 확장·탈출 웨이브, WebAudio 효과음·음량, Restoration Lab(`src/ui/lab.ts`, 시나리오 로직을 `tools/reference/scenario.ts`로 분리해 verify와 공유), 성능 벤치, dist 권리 가드(`tools/release/check-dist.ts`), `docs/EVALUATION.md`, 관찰 양식.
- 검사: `make check` exit 0, `make smoke-local` 16/16, holdout 회귀 4/4.
- 실패 3건 기록(`docs/evidence/G4_REPORT.md`). 미수행: 사람 플레이, hook 실트리거.

## 2026-11-14 — Full 3D Quarter-View & OSS Release (agy Orchestrator + kiro-cli 2.37.1)

agy가 오케스트레이션하고 kiro-cli가 문서·spec 작업을 맡았다. 두 주체의 작업을 구분해 적는다.

- **agy 수행**: WebGL2·셰이더·헤드램프 연출 보정, 결정적 스모크 대기, `index.html` favicon, 실제 브라우저·시각 검증, 최종 검증 게이트(`make check`, `make reference-holdout`, `make smoke-local`, `capture-showcase.ts`), GitHub 릴리스.
- **kiro-cli 수행**:
  - Task A: `.kiro/specs/full-3d-quarter-view/{requirements,design,tasks}.md`.
  - Task B: `.gitignore`, `LICENSE`, `README.md`.
  - Task C: `.kiro/steering/reanimator.md` 및 `docs/**` 동기화(자산 등록부, 계획, 평가, G4 보고서, brief/status/plan/log/lessons).
- 검증은 agy가 관찰한 값만 인용했다(35/35, holdout 4/4, smoke 22/22, dist-guard 12 files 14,304,572 B). kiro-cli는 Task C에서 변이 명령을 실행하지 않았다.
- 미수행: Kiro 내 REA MCP 연결, hook 유발 파일명 기록, 사람 플레이(G5).

## 2026-11-15 — Metroidvania 3D Wave 1 병렬 구현 및 전면 인계
- Kiro 병렬 Wave 1 실행(`kiro-cli 2.37.1`):
  - Task 1A (`task-1412`): `.kiro/specs/metroidvania-3d/{requirements,design,tasks}.md`, `.kiro/steering/reanimator.md` 작성 (이후 인계 과정에서 `map3d.ts` 및 `riggedModels.ts` 실구현에 맞춰 정합성 보정)
  - Task 1B (`task-1413`): `src/game3d/map3d.ts` 6섹터 Metroidvania 맵·잠금 문·업그레이드·세이브 스테이션 작성 (런타임 unverified)
  - Task 1C (`task-1414`): `src/ui/minimap.ts`, `index.html`, `src/ui/style.css`, `src/ui/audio.ts` HUD 미니맵·상태 배지·사운드 신스 작성 (시각 unverified)
- `agy` 직접 구현·서브에이전트:
  - `agy` 직접: `src/game3d/types3d.ts` 공유 계약 + `src/render3d/riggedModels.ts` split-body·XY 360° 양손 라이플 IK·`vy` 점프 스크럽·역방향 백페달 작성
  - `agy` 서브에이전트 `1ef925e0`: `src/engine/motion3d.ts` 작성 완료 직후 할당량 `429`로 종료
- 인계 상태 및 검증: `reference-verify` 3/3 PASS, `tests/{reference,game}.test.ts` 30/30 PASS, `tsc`는 미전환 `world3d.ts` 2건 오류; 전체 `make check`·`make smoke-local` **unverified**. Wave 2–3는 `docs/plans/KIRO_METROIDVANIA_HANDOFF.md` 기준으로 Kiro가 전담 실행.

## 2026-11-15 — Metroidvania 3D Wave 2–3 통합 (Kiro 직접 수행)
- Kiro 에이전트가 이 세션에서 직접 수행: `world3d.ts` 재작성(6잠금·업그레이드·세이브·pose), `nav3d.ts`/`bot3d.ts`/`reach3d.ts`, `scene3dFull.ts`·`fallback2d.ts`·`main.ts` 사이드뷰 전환, `tests/game3d.test.ts`·`smoke.ts`·`capture-showcase.ts` 재작성, spec `tasks.md` 완료 처리, docs 동기화.
- 사용한 도구: 코드 탐색/편집, `make check`·`make smoke-local`·`make reference-holdout`·쇼케이스 실행과 PNG 육안 검수. 서브에이전트·병렬 `kiro-cli` 실행은 사용하지 않고 순차 수행했다.
- 관찰 값: `make check` 44/44, holdout 4/4, smoke 29/29(60.5 fps), 봇 완주 3377 ticks. 미수행: 푸시, 사람 플레이(G5), Kiro 내 REA MCP 연결.
