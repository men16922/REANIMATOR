# 진행 기록

R3까지의 전체 기록(몬스터·지형, 보스, 오디오, 통합 병합 상세)은 [archive/PROGRESS_LOG_through_R3.md](archive/PROGRESS_LOG_through_R3.md).

## 2026-11-17 — R23 FEAT-001 R22 갭 수정 (로컬 커밋, 푸시 없음)

- Changed: `tools/meshy/terrain-kit.ts` finalize가 manifest의 모든 `terrain/*`로 register 행을 만든다(`registerRowsFromManifest`). ASSET_REGISTER terrain 표를 3행에서 17행으로 복구. `tests/terrain-kit.test.ts`에 register 행 대조와 17개 GLB 법선 복구 테스트 추가.
- Verified: `make check` exit 0(746/746). 봇 핀 Normal 4978/126, Story 4880/142, Hard 5319/104 0 deaths(측정 재확인).

## 2026-11-17 — R22 Frost 에셋, 실행 기록 (로컬 커밋, 푸시 없음)

- Changed: 287d595(GLB 3종 ingest), 3409aef(Bulwark 방패 메시, Stage 3 props), c1a8681(파이프 벽 뒷 레인, 스크린샷 재촬영), 기록 커밋(`records.ts`, 클리어·선택 화면, `tests/records.test.ts`).
- Verified: `make check` exit 0(744/744), Playwright로 Stage 2 클리어 화면과 새로고침 후 Stage Select 기록 확인.
- Unverified: `make smoke-local`, 오디오 청감, Stage 2·3 사람 플레이, 릴리스 `vite preview`.

## 2026-11-17 — R21 렌더 버그 2건, Cryo Bulwark, 스테이지 사운드, README (로컬 커밋, 푸시 없음)

- Changed: 8c2699b(Foreman 패리 플래시 흰 실루엣), bcf4e06(인트로 레터박스 `.bar` 충돌), f1b4286(Cryo Bulwark, 스테이지별 음악·앰비언트·발소리·스팅어, `tests/stage3-bulwark.test.ts`, `tests/audio.test.ts` 이벤트 수 59→60), b9f9d1d(README, 메타, dist 금지어 가드, 픽스처 문구 제거 플러그인).
- Verified: `make check` exit 0(737/737), `make release` exit 0, Playwright로 Foreman 윈드업·타격, SPIRE WARDEN 카드, Cryo Stacks, Bulwark 방패, Lab PASS, Stage 3 오디오 테마 확인.
- Unverified: `make smoke-local`(Chrome 실행 불가), 사람 플레이.

## 2026-11-16 — R20 Foreman 메시, 릴 Stage 2/3 컷, 폴리시 (로컬 커밋, 푸시 없음)

- Changed: de8a151(Foreman Meshy 메시·포즈), c3e21e8(릴 Stage 2/3 컷, clearFoes), fd78fd5(draw calls 306→287, 보스 카드, Foreman 음성·fx, 증기 흔들림, `tests/r20-polish.test.ts`), docs 커밋.
- Verified: `make check` exit 0(725/725). 봇 핀 Normal 4978/126, Story 4880/142, Hard 5319/104 min 100. Playwright 릴 전 컷 peak ≤ 287. Foreman 카드 스크린샷, Stage 3 보스 바 SPIRE WARDEN.
- Finding: Warden 인트로는 `core` 방·`bossIntroDone` false·Warden 생존일 때만 시작. Cryo Stacks 오버레이는 디버그 텔레포트 추정(unverified).
- Unverified: `make smoke-local`, `make release`, `vite preview`, 사람 플레이.

## 2026-11-16 — R18 스테이지 검증 (로컬 커밋, 푸시 없음)

- Changed: d7e91ab(브라우저 검증 수정, 목표 줄, draw calls), 4778f0c(Slag Foreman, 봇 테스트, 컬러 그레이드), docs 커밋(README 스크린샷, 릴 마지막 문구, 문서 정리: 이전 기록은 archive/STATUS_R8_R14.md, NEXT_PLAN_R4_R11.md, PROGRESS_LOG_R9_R16.md).
- Verified: 브라우저 draw calls Stage 2 방별 134-153, Foreman 전투 135, 최대 294(전투 쇼케이스). `make check` 결과는 이 커밋의 게이트 참조.
- Unverified: Stage 2·3 사람 플레이, `make smoke-local`, `make release`.

## 2026-11-16 — R15 Meshy 터레인 킷, R16 릴리스 1.0.0, Abuse 레벨 관찰 (로컬 커밋, 푸시 없음)

- Status: main 로컬 커밋 9384d5e, c3d2aeb, c40d5d6 (R15), 3219cbd, 36f609e, a5df9c8, 9c5bddc, bbf39b1 (R16), eef01b6 (Abuse 관찰). github DNS 실패로 푸시 불가.
- Changed: Meshy MCP로 터레인 11종(meshy-t2.5 smart-topology, 4k tris, PBR, 165 credits, 잔액 608), `src/render3d/terrainKit.ts` 인스턴싱+절차 폴백. DATA LOG 토스트·레트로 CSS·차분한 인트로, 깨진 Meshy 노멀 수정(에어록 암전), 능력 Blast Core·Scan Lens·Thermal Plating과 봉인 캐시, `src/ui/tutorial.ts`(화면 조작 목록 제거), 릴리스 1.0.0(manifest, 아이콘, CHANGELOG, `make release` zip, 플레이어 노출 면의 Kiro 문구 제거, 디버그 훅은 DEV 또는 `?debug=1`일 때만).
- Abuse 관찰: LEVEL00-04 SPE 파싱+Lisp 열람, DOSBox headless로 00→01→02→03→04 확인. 적 6/58/78/83/103. 00은 01-04로 가는 트레이너 허브, 04 출구는 게임 종료. 결과 `docs/reference/ABUSE_LEVEL_OBSERVATION.md`, `docs/evidence/abuse_levels/`.
- Verified: `make check` exit 0(672/672, reach3d 52 waypoints 3432 ticks, dist-guard PASS 30 files 17,448,133 B), 봇 핀 불변. 섹터별 draw calls 148-299.
- Unverified: `make smoke-local`(샌드박스에서 Chrome 실행 불가), 릴리스 zip `vite preview`, 새 능력 픽업·캐시 브라우저 동작, Abuse 스크린샷·팔레트(윈도 서버 없음), 실제 Abuse 플레이 길이, G5.
- Risks: `?debug=1`이 배포 빌드에서 디버그 훅을 켬. 전투 쇼케이스 장면 305 calls(>300, R16 이전에도 303-313). 구 세이브가 새 능력 플래그를 undefined로 읽을 수 있음. Meshy API 키가 채팅에 노출되어 교체 필요. 푸시 대기.
- Next: 스테이지 확장 결정 대기(안 A: 허브/튜토리얼 + 3스테이지 분할, 안 B: 현 맵을 Stage 1로 두고 2개 추가). 공통: 클리어 화면, 스테이지 선택, 출구 텔레포터, 타이틀 카드, 스테이지별 스위치·문 퍼즐, 세이브 포인트. GUI 세션에서 Abuse 관찰 재실행.

## 요약 타임라인 (2026-11-14 ~ 11-15)

- 11-14 G0–G4: 원본 취득·실행 관찰, Ghidra/REA 분석, 이동 물리 TS 엔진 `motion.ts`, 로그 비교기, holdout M05, 2.5D 슬라이스, Restoration Lab, dist-guard. 상세 [G0](evidence/G0_REPORT.md) [G1](evidence/G1_REPORT.md) [G2](evidence/G2_REPORT.md) [G3](evidence/G3_REPORT.md) [G4](evidence/G4_REPORT.md).
- 11-14 Full 3D 쿼터뷰 + OSS 릴리스, 11-15 Metroidvania 3D(6섹터, 사이드뷰) Wave 1–3.
- 11-15 몬스터·지형 개선(적 AI·모션, 섹터 드레싱, 조명 프리셋), 병렬 3트랙(monsters/terrain/audio) 통합, 문 램프 instance 버퍼 7 vs 8 수정(`27af96f`).
- 11-15 R1 통합: gameplay/perf/juice/title(`c8beede`..`da59783`).
- 11-15 R2 통합: fix/boss/audio/brand. `main.ts` 충돌 2곳 수동 해결.
- 11-15 R3 통합: foes/fix/mood/classic. 충돌 2곳(`main.ts` import, `index.html`+Classic 블록) 수동 해결. `make check` exit 0(211/211, reach3d 52 waypoints, dist-guard 13 files).

## 2026-11-16 — Abuse 레벨 관찰

- Changed: `tools/reference/spe-survey.ts`, `reference/harness/HARNESS.levels.LSP`, `scripts/observe_levels.sh`, `docs/reference/ABUSE_LEVEL_OBSERVATION.md`, `docs/evidence/abuse_levels/`.
- Observed: DOSBox(`SDL_VIDEODRIVER=dummy`)에서 레벨 00→04 자연 전환(아래 입력). 스폰이 정적 START와 일치. 레벨 04 출구 후 입력 훅 정지(엔딩 추정).
- Unverified: 스크린샷·팔레트(윈도 서버 없음), 실제 플레이 길이.

## 2026-11-15 — Post-R13 수정 (Judge Reel, 적 달리기)

- Judge Reel: DOM 호스트가 랩 열림을 내부 플래그로 기억해 외부에서 `#lab`이 바뀌면 훅 컷 종료 시 닫기를 건너뛸 수 있었다. 이제 매 프레임 DOM 기준으로 "랩은 훅 컷에서만" 불변식을 재확인한다. 릴 시계는 실제 dt(프레임당 최대 0.5 s)를 쓰고 월드는 프레임당 30틱까지 따라잡는다. 모드가 showcase를 벗어나면 릴을 멈추고, 종료 시 랩 mutation 체크를 해제한다. `tests/r13-reel-player.test.ts` 6개. 브라우저 2 s 샘플 표는 [R13_REEL](R13_REEL.md).
- 적 이동: 크롤러(정적 메시)의 절차 포즈 분기 전환을 0.11 s 감쇠 오프셋으로 블렌드(`PoseTransition`), 버텍스 셰이더 다리 스커틀(`applyCrawlerScuttle3D`, 보폭 위상 고정, 정지 시 0). 시뮬: 플레이어 위 상자에 올라앉은 크롤러가 내려온다(1줄, 봇 핀 불변). 근접 링/가속 변경은 봇 핀·HP 창을 깨서 되돌림. 전후 프레임 [r13_motion](evidence/r13_motion/README.md).
- `make check` exit 0(635/635, reach3d 52 waypoints 3432 ticks, dist-guard 13 files). 봉인 파일 무변경, 푸시 없음.

## 2026-11-15 — R6 통합 (r6/arms, fix, sound, demo)

- Status: main에 `--no-ff` 4회 병합(arms → fix → sound → demo), 푸시 없음, worktree 보존.
- 충돌: sound 병합 시 `audioLogic.ts`(EVENT_SOUND 두 블록, `seal_close` 피치)와 `main.ts`(무기 배너 루프). 전용 레시피를 택하고 arms 이벤트 4개를 `weapon.flamer_loop`·`weapon.rocket`·`enemy.burn`·`player.rocket_jump`로 매핑, 배너 루프는 슬롯 2~6에 팡파르 호출. demo 병합 시 `main.ts`는 `applyDebugSetup` 이동 충돌만이었고 `demo.ts`에 6무기 ammo 타입을 반영.
- 추가: `triggerExplosion3D`가 로켓(byWeapon 6) 폭발에 `explosion` value 1을 싣고 `cueForEvent`가 `weapon.rocket_explode`로 연결. `PENDING_EVENT_SOUND` 제거, `tests/audio.test.ts`·`tests/arms.test.ts`를 전용 레시피 기준으로 갱신. demo의 `KIT_LATE`(무기 6종)를 보안 데크 이후·보스 체크포인트에 사용.
- 봉인 파일 무변경. `make check` exit 0(테스트 344/344, reach3d 52 waypoints 3432 ticks, dist-guard 13 files 14,684,946 B). 브라우저 검증은 unverified.

## 2026-11-15 — R5 통합 (r5/metroid, render, rig, vfx)

- Status: main에 `--no-ff` 4회 병합(순서 metroid → render → rig → vfx), 푸시 없음.
- 충돌: `scene3dFull.ts` 1곳(render 병합 시). `metroid3d` 빌드와 `hazards3d.setClassic` 호출을 둘 다 유지. rig·vfx 병합은 자동. `stepRiggedEnemyAnimation3D` 잔여 참조 0, vfx의 `flashMaterials3D` cap 경로는 `scene3dFull.ts`에서 정상 호출. frontLift는 벽·램프 재질에만 적용.
- 봉인 파일 무변경. `make check` exit 0(테스트 291/291, reach3d 52 waypoints, dist-guard 13 files 14,652,123 B). 브라우저 검증은 오케스트레이터 진행 중.

## 2026-11-15 — R4-D 제출 패키지 (r4/docs)

- Status: 로컬 브랜치 `r4/docs`, 푸시 없음.
- Changed: `README.md` 전면 개편(영문, 한국어 요약), `docs/JUDGES.md` 신설, `docs/KIRO_USAGE.md`에 R1~R4 병렬 라운드 추가, `index.html`·`src/ui/{main,menu,style}.ts|css` Credits 패널(Extras), `package.json` description·keywords·license, 하네스 문서 정리(PROGRESS_LOG, NEXT_PLAN 전문은 `docs/archive/`로 이동, STATUS 이전판 복사).
- 봉인 파일 무변경. `make check` exit 0(r4/docs worktree 관찰, dist-guard PASS 13 files 14,577,537 B). 문서 링크 검사: showcase PNG 7장을 제외하고 깨진 링크 0.

## 2026-11-15 — R7 통합 (r7/soak, ui, cam, vista)

- Status: main에 `--no-ff` 4회 병합(순서 soak → ui → cam → vista), 푸시 없음. 브랜치 커밋 soak `489064a`, ui `6f55435`, cam `a1995f7`, vista `1446079`.
- 충돌: `main.ts`(ui 병합, 선언부와 훅부에서 soak와 ui 양쪽 유지), `scene3dFull.ts`(cam 병합, 카메라 블록에서 `frameMs.fx` 계측과 cam의 구도 계산 유지). vista는 자동 병합.
- 통합 보강 `f146b2d`: `teardownLevel()`에 `vista.dispose()`와 `frameRect.reset()` 추가. vista는 `ensureWorldBuilt`에서 재빌드 전 해제하고 있었으나 teardown 경로에는 없었다.
- 봉인 파일 무변경. `make check` exit 0(테스트 380/380, reach3d 52 waypoints, dist-guard 13 files 14,721,553 B). 브라우저 검증은 하지 않았다(unverified).

## 2026-11-15 — R8 통합 (r8/leak, assist, lore, lab)

- Status: main에 `--no-ff` 4회 병합(leak → assist → lore → lab), 푸시 없음. 브랜치 커밋 leak `4da9b61`, assist `06163b2`, lore `c1ab067`, lab `697c3ea`.
- 충돌: lore와 lab 병합 시 `index.html`, `main.ts`, (lore) `style.css`. 양쪽 유지로 해결. `SECTOR_SUBTITLE` 미사용 import 제거.
- M05: 원래 Lab이 이미 holdout 로그를 표시했고 R8도 동일한 읽기 전용 경로라 정책 충돌 없음.
- 봉인 파일 무변경. `make check` exit 0(테스트 427/427, reach3d 52 waypoints, dist-guard 13 files 14,775,872 B). 브라우저 검증은 하지 않았다(unverified).

## 2026-11-16 — R19 트레일러 릴

- `ShowCut.stage` + `Showcase.seek`가 컷별 스테이지 월드를 새로 만든다. 릴 12컷(90 s). Foreman HP 테스트, `FOREMAN_NAME` 상수, castShadow 히스테리시스. `make check` exit 0(718/718). Stage 1 봇 핀 불변. `make smoke-local`은 unverified.

R9–R16 상세: [archive/PROGRESS_LOG_R9_R16.md](archive/PROGRESS_LOG_R9_R16.md).

## R21 (partial)
- Done: Stage 2/3 coach chip fix (src/ui/flow.ts), Foreman heat tone-down (scene3dFull.ts), test in tests/r20-polish.test.ts. make check exit 0, 726/726.
- Unverified: Foreman strike visual, Spire Warden card visual, r19 black squares, smoke-local, release.
