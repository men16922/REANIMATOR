# 진행 기록

R3까지의 전체 기록(몬스터·지형, 보스, 오디오, 통합 병합 상세)은 [archive/PROGRESS_LOG_through_R3.md](archive/PROGRESS_LOG_through_R3.md).

## 요약 타임라인 (2026-11-14 ~ 11-15)

- 11-14 G0–G4: 원본 취득·실행 관찰, Ghidra/REA 분석, 이동 물리 TS 엔진 `motion.ts`, 로그 비교기, holdout M05, 2.5D 슬라이스, Restoration Lab, dist-guard. 상세 [G0](evidence/G0_REPORT.md) [G1](evidence/G1_REPORT.md) [G2](evidence/G2_REPORT.md) [G3](evidence/G3_REPORT.md) [G4](evidence/G4_REPORT.md).
- 11-14 Full 3D 쿼터뷰 + OSS 릴리스, 11-15 Metroidvania 3D(6섹터, 사이드뷰) Wave 1–3.
- 11-15 몬스터·지형 개선(적 AI·모션, 섹터 드레싱, 조명 프리셋), 병렬 3트랙(monsters/terrain/audio) 통합, 문 램프 instance 버퍼 7 vs 8 수정(`27af96f`).
- 11-15 R1 통합: gameplay/perf/juice/title(`c8beede`..`da59783`).
- 11-15 R2 통합: fix/boss/audio/brand. `main.ts` 충돌 2곳 수동 해결.
- 11-15 R3 통합: foes/fix/mood/classic. 충돌 2곳(`main.ts` import, `index.html`+Classic 블록) 수동 해결. `make check` exit 0(211/211, reach3d 52 waypoints, dist-guard 13 files).

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

## 2026-11-15 — R9 통합 (r9/fix, world, abuse, parry)

- Status: main에 `--no-ff` 4회 병합(fix, world, abuse, parry; abuse와 parry 병합 순서는 실행 중 뒤바뀜, 결과 동일), 푸시 없음.
- 충돌: `tests/game3d.test.ts` 1곳, 양쪽 테스트 유지.
- 통합 보강: `scanTargets3D`가 기댐 가짜 벽(`break_lean_security`)을 시크릿으로 분류(+테스트). 키 X/C/Z는 컨텍스트별 한 의미(사망 화면 C는 Resume, 플레이 중 C는 카운터 보조). [R9_PARRY](R9_PARRY.md).
- 봉인 파일 무변경. `make check` exit 0(테스트 459/459, reach3d 52 waypoints 3432 ticks, 봇 5362 ticks HP 112/160 56 kills, dist-guard 13 files 14,790,497 B). 브라우저 검증은 하지 않았다(unverified).
- R10 Classic: audit, CRT toggle transition, reduce-flash sweep (docs/R10_CLASSIC.md). make check 465/465.

## 2026-11-15 — R10 통합 (r10/classic, opening, boss, hunter)

- Status: main에 `--no-ff` 4회 병합, 푸시 없음. 충돌 2곳(`tests/audio.test.ts` 사운드 수 59, `scene3dFull.ts` 두 body 클래스 토글 모두 유지). `body.classic .hunter-pill` 규칙 추가.
- 봉인 파일 무변경. `make check` exit 0(519/519, 봇 5533 ticks HP 95/160 57 kills, reach3d 52 waypoints 3432 ticks, dist-guard 13 files 14,819,279 B). 브라우저 검증 unverified.

## 2026-11-15 — R11 polish (hunter armour, opening cinematic)

- Status: 2 commits on main, no push. Sealed files untouched. Hunter: 5 merged armour meshes on bones, accent follows alert colours. Opening: HUD/minimap hidden then faded in, letterbox, display-only wake pose, title card; 4 new tests. Visuals unverified (Chrome cannot launch).

## 2026-11-15 — R11 final fix pass

- Status: 1 commit on main, no push. Sealed files untouched. Hunter steel/plates root-caused and fixed, showcase hold exit, pause Escape resume, English chrome. 7 new tests. `make check` exit 0 (534/534, bot Normal 5533 ticks HP 95/160 57 kills, reach3d 52 waypoints 3432 ticks, dist-guard PASS). Playwright check done on the dev server.
- Note: the "first showcase call ignored" report matched the loading screen (logo over the scene) still fading out after the first call resolved. A Vite dependency-reload a few seconds after first load can also replace the page; that is dev-server behaviour, not game code.

## 2026-11-15 — R9–R11 세션 마감

- Status: 문서 마감 커밋, 푸시 없음(github.com DNS 실패, 사용자가 `git push origin main` 실행). 봉인 파일 무변경.
- 오케스트레이터 Playwright 관찰: R9 uiAudit 12개 시나리오 ok, 스캔 윤곽, Vault Nook 발견과 카메라 추적(`8376998`), 콘솔 경고 0. R10/R11 오프닝(레터박스, HUD 없음, 무릎 꿇은 operative, 1996), HUD 한 줄 HUNTER pill, 헌터 외형 개선. `3c8e7a0` 최종 외형은 재확인 전.
- `__reanimatorAdvance` 후 타이틀 재출현 보고: 실제 Chrome에서 재현 불가(상세 STATUS). 유력 원인은 동시 편집에 의한 Vite 리로드. 코드 변경 없음.
- Unverified: 패리/카운터 창 체감, G5 사람 플레이, `make smoke-local`(실제 Chrome 필요).

- R12: English-only text (lore KO tables, locale, language toggle removed). Crawler/spitter procedural gait amplified (yaw swing added) so single-mesh enemies visibly move; `tests/enemy-locomotion.test.ts` added; `make check` passed.
- R12 enemy locomotion: airlock crawlers were stuck against `airlock-crate` (1.4 m) at x 11.02 with `vx` -8.8 (pose ran in place). Sim now hops low obstacles, gives up to patrol behind walls/doors, separates stalled foes, and drives pose from real displacement with hysteresis. Bot keeps its dash for Warden charges. Bot Normal 5522 ticks HP 95 (pin updated), Story 5606 HP 146, Hard 5633 HP 48. `make check` exit 0 (544/544). Playwright sampling in six sectors showed crawl/leap/land/idle with changing x.

## 2026-11-15 — R12 integration

- Status: merged r12/look, r12/motion, r12/onboard, r12/robust with `--no-ff`, no push, sealed files untouched. Onboard behaviour won the no-save resume conflict. `debug.stoppedOn` fixed. Re-pinned bot: Normal 5444 HP 140, Story 5812 HP 143, Hard 5121 HP 133 (min 100). SHOWCASE_REEL ticks 4750/5400. `make check` exit 0 (568/568, reach3d 52 waypoints 3432 ticks).

## R12 post-fix: crate crawlers and tutorial hold

- Root cause 1: floor foes lunged and backed off from the 1.4 m airlock crate at a player on the floor (the `abs(dy) < 2.2` attack gate and the back-off while the lunge recharged), so they oscillated at the crate edge in place. Foes now attack and back off only when the player is not more than 0.7 m below them; otherwise they walk off and drop down (within the existing 1.5 m ledge guard).
- Root cause 2: the onboarding hold compared against the world tick, which keeps counting through menus and the opening, so e-airlock-2 and e-drop-airlock were already released in the browser. `tutorialWakeTick` now starts the 1200-tick hold when e-airlock-1 wakes.
- Bot: Normal won 5123 ticks HP 118 (re-pinned, was 5444/140), Story won 5812, Hard won 5121 min HP 100. Reckless probe hpLost 281. SHOWCASE_REEL cuts 6 and 7 retimed to 4700 and 5110. reach3d PASS 52 waypoints 3432 ticks.
- Tests: two new deterministic tests in tests/assist.test.ts. Real-time browser check: unverified (not run).

## 2026-11-15 · R13 integration

- Status: merged r13/alive, r13/combat, r13/ux, r13/reel with `--no-ff`, no push, sealed files untouched. Conflicts in `enemyMotion.ts`, `enemyRig3d.ts`, `scene3dFull.ts`: kept ux `crawlerStride`/`gaitStep`/`smoothDisplaySpeed`/`latchHysteresis`/`runLean(kind, speed, moveW)`, alive `enemyTravelSpeed`, combat `stepGroundSpeed` spike filter, sprint cap, hip bob and sprint turn. Removed alive `CRAWLER_STRIDE` and combat `runLean(speed)` and their tests.
- Sim jerk audit (`tools/game/enemyJitter.ts`): door-queue teleports came from `separateEnemies3D` (0.6 to 0.8 m per tick); blast knockback launched foes at up to 24 m/s (0.4 m per tick for 12 ticks); queued chasers shuffled because chase pushed forward and separation pushed back. Fixes: proportional separation slide capped at 0.07 m/tick and 0.19 m with own speed, knockback launch cap 12 m/s, wait behind a stalled foe ahead. Normal before/after: max step 0.79 to 0.18 m, pops over 0.2 m 45 to 0, chase reversals 43 to 2.
- Render: live Chrome sampling showed the display lagging running foes by up to 1.5 m and surging 0.25 to 0.3 m per frame while `stepGlide` caught up. `stepGlide` now decays a display offset, so the body keeps the sim speed. After: display max step equals the sim max step (0.177 m crawler, 0.174 m stalker), 0 frames over 0.2 m.
- Re-pins: bot Normal 5208 ticks HP 126 (was 5123/118), Story 5599 HP 139, Hard 5094 HP 114 min 100. SHOWCASE_REEL last cut 5110 to 5160 (airlock). Judge Reel combat Counter frame 118 to 110 (crawler window now frames 101 to 116). Reel lab cut scales the lab to 0.86 so the caption ends below the match grid (screenshot `docs/evidence/r13_integration/reel_lab_caption.png`).
- `make check` exit 0 (625/625, reach3d 52 waypoints 3432 ticks, dist-guard PASS). New test `tests/r13-smooth.test.ts`.

## 2026-11-15 · R14 integration

- Status: merged r14/charlight, r14/terrain, r14/transit with `--no-ff` (HEAD `f740169`), no conflicts, no push, sealed files untouched.
- User feedback addressed: rooms crossed too fast (transit), coarse terrain (terrain), characters reading as outline only (charlight). Enemy running (a repeated note) was handled in R13 and not changed in R14.
- Transit: 42-tick side-door walk-through with jump, dash and fire ignored, 150-tick entry grace for foes within 14 m (released on hit), 3 m doorway clearance, `FrameRectSmoother` edge-speed cap, shaft zoom easing, sector title card, reduce-motion cut.
- Terrain: Meshy unreachable (api.meshy.ai, no key), so procedural `terrainMaps.ts` and `terrainDetail.ts` (about 9.8k triangles in 18 strips), `drawBudget` counts terrain strips.
- Charlight: `charLight3d.ts` per-kind key, fill, crevice darkening, exposure and softer rim, GLSL injected in `applyEnemyRim3D` and `applyWardenLook3D`.
- Verification: `make check` exit 0 (649/649, reach3d 52 waypoints 3432 ticks, dist-guard PASS 13 files 14,891,509 B). Bot unchanged by render-only branches: Normal 4978 ticks HP 126, Story 4880 HP 142, Hard 5319 HP 104 (min 100). SHOWCASE_REEL cuts 2150/4420/4920 unchanged.
- Browser: Playwright on `http://localhost:5173`, 0 console errors or warnings, no page errors on five showcase scenes; screenshots in `docs/evidence/r14/`.
- Caveats: no human playtest (G5 unperformed); terrain and charlight verified by tests, a no-error run and screenshots only; Meshy terrain upgrade stays in NEXT_PLAN.

## 2026-11-15 · R15 Meshy terrain

- `.env` gitignored (separate commit). Meshy API probe failed: could not resolve `api.meshy.ai` (HTTP 000), so no assets were generated and code is unchanged. Kiro MCP write blocked by EPERM, not added. See `docs/R15_MESHY_TERRAIN.md`.

- R15 terrain kit: 11 Meshy GLBs ingested offline, instanced per sector in `terrainKit.ts`; a delegated sub-agent verified six sectors in the Playwright MCP browser (draw calls 148 to 299, 0 console errors, screenshots in `docs/evidence/r15_meshy_terrain/`) and ran `make check`. New user requests (Metroid abilities, tutorial mode, transient DATA LOG, retro UI, intro review) were added to NEXT_PLAN, not implemented.
