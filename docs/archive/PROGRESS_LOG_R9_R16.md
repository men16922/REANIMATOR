# PROGRESS_LOG 이전 기록 (R9–R16)

2026-11-16 R18 정리에서 PROGRESS_LOG.md에서 이동. 삭제 없음.

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

## 2026-11-16 · R16 Metroid abilities (FEAT-002)

- Three optional-route abilities added: Blast Core (blast plate, Blast Cache), Scan Lens (scan hatch, Lens Cache), Thermal Plating (heat seal, Heat Cache). Design, coordinates, reach3d impact and the two count-based test updates are in `docs/R16_METROID_ABILITIES.md`. Bot pins unchanged. Tutorial (FEAT-003) not started. Browser view unverified.

## 2026-11-16 · R16 tutorial mode, minimal HUD, release text (FEAT-003)

- `src/ui/tutorial.ts` (pure) plus wiring: one skippable prompt at a time, ability prompts on pickup, `T` skip, `Extras > Tutorial` replay. Default HUD no longer lists controls or skills. Player-facing text scrubbed of development-tool mentions, README rewritten as a game README. `make check` exit 0 (672/672). `make smoke-local` not run (Chrome unavailable in the sandbox). Summary: [R16_RETRO_TUTORIAL_UI](R16_RETRO_TUTORIAL_UI.md).
