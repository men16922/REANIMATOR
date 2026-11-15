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

## 2026-11-15 — Boots 게이트 수정
- Kiro 서브에이전트가 `map3d.ts`/`bot3d.ts`/`reach3d.ts`/테스트 수정과 `make check` 실행. Chrome 실행 실패로 smoke는 미수행.

## 2026-11-15 — R1~R4 병렬 라운드 (오케스트레이터 + worktree 서브에이전트)

사용자 지시("6시간 재귀 개선, 원본보다 재미있고 첫인상이 강한 제출작")에 따라 4라운드 재귀 개선을 수행했다. 이 절은 오케스트레이터 세션의 사실 기록이다. 라운드마다 트랙 4개를 동시에 돌렸다.

### 실행 방식

- 트랙마다 `git worktree add /private/tmp/<이름> -b <브랜치> main`으로 격리된 worktree와 브랜치를 만든다. `node_modules`와 `.tools`는 심볼릭 링크로 연결하고 커밋하지 않는다. 각 서브에이전트는 이전 세션을 모르므로 브리핑에 목표·봉인 파일·검증 명령을 모두 적었다.
- 서브에이전트는 자기 브랜치에서 `make check`를 통과시키고 로컬 커밋만 한다(푸시 금지).
- 통합 에이전트가 `--no-ff`로 순차 병합하고 충돌을 해결한다. 병합 후 `make check`를 다시 돌린다.
- 오케스트레이터가 Playwright로 브라우저를 열어 스크린샷·콘솔·`window.__reanimator*` 디버그 훅으로 직접 검증한다(`.playwright-mcp/`).

### 라운드별 트랙

| 라운드 | 트랙(브랜치) | 병합 커밋 | 내용 |
|---|---|---|---|
| 0(선행) | improve/monsters, terrain, audio | `dd4abb6`, `3644f9f`, `bfd7773` | 적 AI·모션, 섹터 지형·조명, 오디오 재작성 |
| R1 | r1/gameplay, perf, juice, title | `c8beede`..`da59783` | 보스 3페이즈·벽점프·스톰프·레일 차지·콤보·수집품·시크릿 / 정적 배칭·컬링 / 히트스톱·셰이크·카메라 rig / 타이틀·어트랙트·온보딩 |
| R2 | r2/fix, boss, audio, brand | `fa5c847`..`8fa362d` | 버그 수정 / 보스 시네마틱·텔레그래프·데미지 숫자 / 절차 음악·리버브·사이드체인 / SVG 로고·플레이트 메뉴·로딩 화면 |
| R3 | r3/foes, fix, mood, classic | `0caca1d`..`bbdbbb8` | dropper/climber/hive/떼 / 버그 수정 / Abuse풍 조명·고어·연기 / Classic View |
| R4 | A 시각 폴리시, B 환경 위험, C 플레이어 캐릭터, D 제출 패키지(`r4/docs`) | `53ba898`..`297b9e6` | A 폭발·보스·코어·홀로그램 셰이더와 Classic 정리 / B 위험 장치 6종·기믹 3종 / C 영웅 리그·무기 모델 / D README, JUDGES, 이 문서, Credits 패널 |

### 발견하고 고친 버그 예

- 콤보·레일 차지 pill의 `hidden` 속성이 무시됨: `.pill`의 `display`가 UA의 `[hidden]` 규칙을 덮어 `.pill[hidden] { display: none; }` 한 줄로 수정(`38f0907`).
- 타이틀 워드마크가 SVG 좌측 상단 원점에 뭉침: 글리프 `<path>`의 `transform` 속성이 조립 애니메이션의 CSS `transform`에 덮였다. 배치를 감싸는 `<g>`로 옮겼다(`c47fcce`, `src/ui/brand.ts`).
- 문 램프 WebGL 오류 "Vertex buffer is not big enough": `InstancedMesh`를 문당 7개로 할당하고 8개씩 기록했다. 단일 상수 `DOOR_LAMPS_PER_DOOR = 8`로 정리하고 상수를 7로 돌리면 실패하는 테스트 추가(`27af96f`, `tests/render-buffers.test.ts`).
- Three.js 경고 `map: undefined`(재질 생성자에 `map`을 명시적 undefined로 넘기면 재질당 1회 경고): 값이 있을 때만 키를 넣도록 수정. 같은 커밋에서 `CONTINUE` 버튼의 `hidden` 무시(`button.mi[hidden]`)도 고쳤다(`c47fcce`, 회귀 테스트 `tests/r3-fix.test.ts`).
- 보스 시네마틱이 월드가 멈춘 동안 재생되지 않던 문제: 표시용 인트로 카운트다운(`nextIntroDisplayTicks`)을 렌더러에 추가(`c47fcce`).
- 이 중 CSS·SVG 문제는 단위 테스트가 아니라 브라우저에서만 보였다.

### 한계

- 서브에이전트가 사용자의 "원본 게임 느낌을 더 살려라" 요청을 받았을 때 병합 작업 범위 밖이라 코드를 바꾸지 않았고, 후속 라운드 항목으로 [NEXT_PLAN](NEXT_PLAN.md)에 남겼다.
- 푸시는 하지 않았다. Chrome 샌드박스 제한으로 `make smoke-local` 최신 기준은 unverified. 브라우저 확인은 오케스트레이터의 Playwright 관찰이다.
- R4 병합 중 충돌은 `scene3dFull.ts` 한 곳(mood 빌드 옆의 hazards3d 빌드와 Classic 글로우 호출)이었고 양쪽을 모두 유지했다. 병합 후 `make check`는 244/244 테스트로 통과했다.

### R4-D 작업 (이 에이전트)

- 수행: README 전면 개편, `docs/JUDGES.md`, 하네스 문서 정리(전문은 `docs/archive/`로 이동), 인게임 Credits 패널, `package.json` description·keywords·license.
- 검증은 오케스트레이터 보고와 `docs/PROGRESS_LOG.md` 참조.

## 2026-11-15 — R5 병렬 라운드 (오케스트레이터 + worktree 서브에이전트)

R4와 같은 방식(트랙별 worktree `/private/tmp/r5-{rig,metroid,render,vfx}`, 로컬 커밋, 통합 에이전트가 `--no-ff` 병합)으로 4트랙을 돌렸다. 이 절은 통합 에이전트의 사실 기록이다.

| 트랙(브랜치) | 커밋 | 내용 |
|---|---|---|
| r5/metroid | `4f2345f`, `b3407cb` | Crawl Slide·터널, 파괴 블록, 맵 단말·미니맵 `?`, Energy Tank·Ammo Expansion, 탈출 해치 |
| r5/render | `7c3c8b5` | 메시 병합, frontLift, 노이즈 증기, 보스 카메라, perf 텔레메트리 |
| r5/rig | `eb2d48d` | 적 리깅(`enemyRig3d.ts`), 보스 패턴, 보조 모션, LOD |
| r5/vfx | `2efc31c` | 피격 플래시·투사체 글로우·색수차 상한·팝업·사망 팝·레일 링 |

- 병합: 충돌은 `scene3dFull.ts` 1곳이었고 양쪽을 유지했다. `make check` 291/291 테스트로 통과(위 STATUS 기준선).
- 사용자 요청 대응: "적 애니메이션도 자연스럽게 리깅" → R5-Rig, "Abuse에서 미비한 건 Metroid에서" → R4 계획 문서(`R4_METROID_GAPS`)를 R5-Metroid로 일부 구현.
- 브라우저 검증은 오케스트레이터가 진행 중이며 아직 기록하지 않았다(unverified).

## 2026-11-15 — R6 병렬 라운드 (오케스트레이터 + worktree 서브에이전트)

R5와 같은 방식(worktree `/private/tmp/r6-{arms,fix,sound,demo}`, 로컬 커밋, 통합 에이전트가 `--no-ff` 병합)으로 4트랙을 돌렸다. 통합 에이전트의 사실 기록이다.

| 트랙(브랜치) | 커밋 | 내용 |
|---|---|---|
| r6/arms | `e84d514` | Flamer·Rocket 무기, 로켓 점프 제한, 페데스털, HUD 슬롯 6 |
| r6/fix | `267cea9` | 피격 플래시, 폭발 화구 셰이더, 맵 단말 텍스처, flat-boxes 진단 |
| r6/sound | `2c056e9` | 전용 레시피, 팡파르, 근접 루프, 탈출 음악 |
| r6/demo | `ed0c2f4` | 데모 투어, 쇼케이스 릴, 심사위원 가이드 |

- 병합 충돌은 `audioLogic.ts`와 `main.ts`에서 났고 양쪽 의도를 유지해 해결했다(PROGRESS_LOG 참조). 사운드 트랙이 미리 만들어 둔 무기용 레시피를 arms 이벤트에 연결한 것이 통합 단계의 실질 작업이었다.
- `make check` exit 0, 테스트 344/344. 브라우저 확인과 청취 검증은 하지 않았다(unverified).

## 2026-11-15 — R7 병렬 라운드 (오케스트레이터 + worktree 서브에이전트)

worktree `/private/tmp/r7-{ui,cam,soak,vista}`에서 4트랙을 돌리고, 통합 에이전트가 `--no-ff`로 병합했다(순서 soak → ui → cam → vista). 이 절은 통합 에이전트가 본 사실만 적는다.

| 트랙(브랜치) | 커밋 | 내용 |
|---|---|---|
| r7/ui | `6f55435` | z-index 스케일, 패널 스택 계약, UI 감사 |
| r7/cam | `a1995f7` | 룸 클램프·구도·동적 줌 카메라 |
| r7/soak | `489064a` | 레벨 teardown, 프레임 가드, soak 하네스 |
| r7/vista | `1446079` | 섹터별 원경 |

- **발견·수정한 UI 버그**: Extras 하위 목록이 보이지 않았다. 원인은 `.menu-list`에 걸린 진입 애니메이션이 하위 패널에서 끝나지 않아 항목이 투명하게 남은 것이다. `#lab`과 `#revived`는 배경이 투명해 타이틀 로고와 메뉴가 비쳤고 z 순서도 타이틀 아래였다. 브랜치는 z-index 토큰, 애니메이션 제거, 불투명 배경, `topLayer` 판정, `__reanimatorUiAudit`(각 컨트롤 중심점의 `elementFromPoint`가 자기 자신인지 검사)로 고쳤다. 이 버그는 단위 테스트가 아니라 브라우저에서 화면을 보고 발견했다.
- **통합 단계 작업**: 충돌 2곳(`main.ts`, `scene3dFull.ts`)을 양쪽 유지로 해결하고, soak의 `teardownLevel()`이 vista 해제와 카메라 `FrameRectSmoother` 초기화를 빠뜨린 것을 코드 확인으로 찾아 보강했다(`f146b2d`). `make check` 380/380.
- 브라우저 검증과 soak 실행은 이 통합 단계에서 하지 않았다(unverified).

## 2026-11-15 — R8 병렬 라운드 (오케스트레이터 + worktree 서브에이전트)

worktree `/private/tmp/r8-{leak,lab,assist,lore}`에서 4트랙을 돌리고 통합 에이전트가 `--no-ff`로 병합했다(순서 leak → assist → lore → lab). 이 절은 통합 에이전트가 본 사실만 적는다.

| 트랙(브랜치) | 커밋 | 내용 |
|---|---|---|
| r8/leak | `4da9b61` | 액터 해제(boneTexture, 지오메트리, 재질, mixer), soak trace |
| r8/assist | `06163b2` | 난이도 3단, 접근성 보조, 사망 원인 |
| r8/lore | `c1ab067` | 로그 서사, 엔딩 3단, 크레딧 롤 |
| r8/lab | `697c3ea` | Restoration Lab 재설계 |

- 통합 작업: 충돌 해결(index.html, main.ts, style.css), 미사용 import 제거, M05 접근 방식 점검, `make check` 427/427.
- 브라우저 검증은 하지 않았다(unverified).

## 2026-11-15 — R9 병렬 라운드 (오케스트레이터 + worktree 서브에이전트)

- 서브에이전트 4개(fix, world, abuse, parry)가 worktree에서 병렬 작업, 통합 에이전트가 `--no-ff` 병합과 `make check`를 수행했다. 충돌은 `tests/game3d.test.ts` 1곳. 키 배정 감사와 스캔의 기댐 벽 분류 보강을 통합 단계에서 추가했다. 브라우저 검증 unverified.

## R10 통합

- 병렬 worktree 4개(classic, opening, boss, hunter)를 서브에이전트가 병합·충돌 해결·`make check` 검증. 브라우저 검증은 하지 않았다(unverified).

## R11 및 세션 마감

- R11 polish 2커밋과 final fix pass 1커밋, 이후 문서 마감을 서브에이전트가 수행. 오케스트레이터가 Playwright(실제 Chrome)로 R9 uiAudit 12개 시나리오, 스캔·Vault Nook, R10/R11 오프닝과 헌터 pill을 직접 관찰했다. `__reanimatorAdvance` 재출현 보고는 재현되지 않았고 원인 후보(Vite 리로드)를 STATUS에 기록했다. 서브에이전트 샌드박스에서는 브라우저를 띄울 수 없어 해당 구간은 오케스트레이터 관찰이다. 푸시는 DNS 실패로 보류.
