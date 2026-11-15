# 현재 상태

최종 갱신: 2026-11-15 · R14 통합(main, charlight·terrain·transit 병합, HEAD `f740169`, 푸시 없음) · 그 전: Post-R13 수정(Judge Reel 랩 오버레이·시계, 적 달리기 표현) · 그 전: R13 통합(main, alive·combat·ux·reel 병합과 적 이동 시뮬 수정, 푸시 없음). 이전: R9–R11 세션 마감(HEAD `3c8e7a0`). R10 병합: classic·opening·boss·hunter. R9 병합: fix·world·abuse·parry. 이전 상세판: [archive/STATUS_through_R3.md](archive/STATUS_through_R3.md).

## 구현 상태

- **복원(G0–G2)**: `src/engine/motion.ts`(15 Hz 설계값)가 S1·S2·S3와 sealed holdout M05에서 11개 필드 exact 일치. 브라우저 `#lab`(Restoration Lab)이 원본 로그와 엔진 재생을 나란히 보여 준다. 복원 범위는 이동 물리뿐.
- **시뮬** `src/game3d/world3d.ts`: 60 Hz 결정적, XY 레인(z=0). 6섹터, 잠금 문 6종, Thruster Boots(공중 점프) 게이트 2곳, Energy Tank, Save 스테이션, 보스 Core Warden 3페이즈, Meltdown 탈출. 봇 `bot3d.ts`+`nav3d.ts`가 완주한다.
- **R1** 손맛(히트스톱, 트라우마 셰이크, 카메라 rig), 타이틀·어트랙트, 성능 배칭, 게임플레이 깊이(벽점프, 스톰프, 레일 차지, 콤보, 수집품, 시크릿). [R1_GAMEPLAY](R1_GAMEPLAY.md)
- **R2** 버그 수정, SVG 브랜드 로고·플레이트 메뉴, 보스 시네마틱·텔레그래프·데미지 숫자, 절차 음악·리버브. [R2_BOSS](R2_BOSS.md), [R2_AUDIO](R2_AUDIO.md)
- **R3** 버그 수정, Classic View(`V`, 320x200 팔레트 디더·CRT·직교 카메라·픽셀 HUD), Abuse풍 조명·고어·연기, dropper/climber/hive/떼. [R3_CLASSIC](R3_CLASSIC.md), [R3_FOES](R3_FOES.md)
- **R4-A 시각 폴리시** (`r4/polish`): 픽셀 폰트 글리프·HUD 라벨 축약, Classic 램프 샤프트·글로우 축소, 노이즈 화구+충격파 폭발, 보스 슬램 파동·코어 보호막·로그 홀로그램 셰이더, 세이브 스테이션·업그레이드 모델. [R4_METROID_GAPS](plans/R4_METROID_GAPS.md)(Metroid 보강안, 구현은 문서만)
- **R4-B 환경 위험** (`r4/hazards`): 크러셔, 증기, 레이저, 코어 증기, 낙석, 배럴 체인, 화물 리프트+매복, 바이오 스위치·갠트리, 에어록 브리지 붕괴. 봇·내비·`reach3d` 위험 검사 포함. [R4_HAZARDS](R4_HAZARDS.md)
- **R4-C 플레이어** (`r4/hero`): operative 다리 본·반동·무기 스왑·벽 손·착지 포즈, 무기 모델 4종, 헤드램프 렌즈, 백팩 HP 표시등, `__reanimator().player` 텔레메트리.
- **R4-D 제출 패키지**: README 개편, [JUDGES](JUDGES.md), KIRO_USAGE 갱신, Credits 패널(Extras), package.json 설명·키워드.

- **R5-Metroid** (`r5/metroid`): Crawl Slide(터널 2곳), 파괴 블록 3, 맵 단말 6(미니맵 `?` 마커, `M` 키), Energy Tank 3, Ammo Expansion 2, 탈출 해치(final-shutter) 비트. `reach3d`에 터널·파괴·100% 완주·탈출 공정성 검사. [R5_METROID](R5_METROID.md)
- **R5-Render** (`r5/render`): 메시 병합(영웅 장비·hive·정적 위험물), 벽 재질 frontLift, 노이즈 증기 시트, 보스 카메라 블렌드, `perf.byGroup`·`bossFrame` 텔레메트리. [R5_RENDER](R5_RENDER.md)
- **R5-Rig** (`r5/rig`): 적 리깅(보폭 고정 걸음, 포즈 채널, 보스 패턴, 보조 모션, LOD, trace 지표). [R5_RIG](R5_RIG.md)
- **R5-VFX** (`r5/vfx`): 4틱 웜화이트 피격 플래시(상한 0.3), 투사체 글로우 파티클, 색수차 상한 0.42, 팝업 티어·스택, 사망 팝, 레일 준비 링·음, 스캐터 파동.

- **R6-Arms** (`r6/arms`): 무기 5 Flamer(원뿔·burn), 6 Rocket(가속·폭발·로켓 점프 제한), 페데스털 2곳, HUD 슬롯 6, 키 5·6. [R6_ARMS](R6_ARMS.md)
- **R6-Fix** (`r6/fix`): 표시 시간 기준 플레이어 피격 플래시, 폭발 화구 림 마스크, 맵 단말 캔버스 텍스처, `flat-boxes` 진단.
- **R6-Sound** (`r6/sound`): R3~R5 이벤트 전용 레시피, 팡파르 5종, 근접 루프, 탈출 음악. 병합 시 arms 이벤트(flamer·rocket·burn·rocket_jump)와 로켓 폭발(`explosion` value 1)을 전용 레시피에 연결, `PENDING_EVENT_SOUND` 제거. [R6_SOUND](R6_SOUND.md)
- **R6-Demo** (`r6/demo`): `src/ui/demo.ts` 데모 투어 11곳, 쇼케이스 릴, `__reanimatorShowcase`·`__reanimatorDemo`. 늦은 체크포인트(보안 데크 이후, 보스)는 무기 6종 지급. [JUDGES](JUDGES.md)

- **R7-UI** (`r7/ui`): z-index 토큰 스케일, `.menu-list` 애니메이션 제거(EXTRAS 목록이 보이지 않던 원인), `#lab`·`#revived` 불투명 배경, `src/ui/panels.ts`(topLayer, titleCovered), `window.__reanimatorUiAudit()`.
- **R7-Cam** (`r7/cam`): `src/render3d/cameraFrame.ts`(룸 클램프, 수직 구도 42%, FrameRectSmoother, 섹터 힌트, 동적 줌 0.92~1.28), 기본 거리 15.5 → 13.5, 보스 프레이밍 연동, 공중 데드존 1.7, `__reanimator().camera`.
- **R7-Soak** (`r7/soak`): `teardownLevel()`, frame try/catch 가드, webglcontextlost/restored, `window.__reanimatorSoak(n, {showcase})`, perf/fx 텔레메트리, audio `trackedVoices`. [R7_SOAK](plans/R7_SOAK.md)
- **R7-Vista** (`r7/vista`): 뒷벽 개구부와 섹터별 원경(`vistaGeo.ts`, `vistaScenes.ts`, `vista3d.ts`), 섹터당 draw call +4, `__reanimator().vista`.
- 병합 충돌 2곳: `main.ts`(soak·ui 선언과 훅 양쪽 유지), `scene3dFull.ts`(cam: soak의 `frameMs.fx` 계측과 cam의 구도 계산 양쪽 유지, 기존 하드코딩 앵커 제거). vista는 자동 병합. 통합 단계에서 `teardownLevel()`에 `vista.dispose()`와 `frameRect.reset()`을 추가했다(레벨 교체 시 원경 누수와 카메라 사각형 잔존 방지).

- **R8-Leak** (`r8/leak`): `src/render3d/disposeActor.ts`(Skeleton.boneTexture, 소유 지오메트리, 재질, mixer 해제), `disposeActor3D`, `__reanimatorSoak {trace:true}` 단계별 계측.
- **R8-Assist** (`r8/assist`): 난이도 Story/Normal/Hard(`newWorld3D({difficulty, assist})`, Normal은 항등), 조준 보조·자동 사격·0.8×·위험 경고, 사망 원인 15종과 `#result-cause`. [R8_ASSIST](R8_ASSIST.md)
- **R8-Lore** (`r8/lore`): 데이터 로그 6편(영·한), 로그 리더·아카이브, 섹터 부제, 인트로, 엔딩 3단(ASH/EMBERS/TRUE ENDING), 크레딧 롤, `__reanimatorShowLog`.
- **R8-Lab** (`r8/lab`): Restoration Lab 재설계(`labModel.ts`, `labView.ts`): 시나리오 카드, 분할 캔버스, 오버레이, 전송 컨트롤, 11필드×틱 히트맵, 검증 설명. `#lab-scenario`는 숨김 상태로 카드가 구동.
- 병합 충돌: `index.html`(lore 패널과 lab 영역 모두 유지, result-cause와 ending 공존), `main.ts`(showEnding과 사망 원인 팁 둘 다 호출, labView import), `style.css`(assist·lore 규칙 모두 유지). lore가 `SECTOR_SUBTITLE` 사용을 제거했으므로 미사용 import를 삭제했다.
- M05 정책 점검: 원래 Lab(`c8cded1`)의 `lab.ts`가 이미 `reference/holdout/m05_v8.hlog.txt`와 `scenarios.json`으로 M05를 표시했다. R8 Lab과 `tests/lab.test.ts`는 같은 데이터를 같은 비교기로 재생하는 읽기 전용 표시이며 엔진 수정·튜닝에 쓰지 않는다. 새 holdout 접근 경로 없음, 봉인 파일 무변경.

- **R9-Fix** (`r9/fix`): UI 감사가 숨김·비활성 컨트롤을 건너뜀, 탈출 pill 승리 후 숨김, 샤프트 Cracked Wall 프롬프트. [R9_FIX](R9_FIX.md)
- **R9-World** (`r9/world`): 섹터별 소품, 드로콜 예산(`drawBudget.ts`), 탈출 시 장식 틴트. [R9_WORLD](R9_WORLD.md)
- **R9-Abuse** (`r9/abuse`): 보안 데크 Vault Nook(기댐 열림 가짜 벽, 시크릿 5, 완료율 총 23), 픽업 자석, 묵직한 픽업 음. [R9_ABUSE](R9_ABUSE.md)
- **R9-Parry** (`r9/parry`): 근접 카운터(`X`/`C`), 스캔 펄스(`Z`). 키 배정 결정과 병합 보강(스캔이 기댐 벽을 시크릿으로 표시)은 [R9_PARRY](R9_PARRY.md).

- **R10-Hunter** (`r10/hunter`): Bio-Labs 동쪽 구역의 E.M.M.I.풍 사냥꾼 Reclaimer(소음 감지, 카운터 QTE, 일반 사격 면역, Rail 오버차지·열린 바이저·키 아이템 소지 이탈로 영구 비활성). HUD `HUNTER ZONE`, 붉은 색조·스팅, Ctrl/Alt 살금걸음. 봇 Normal 5533 ticks HP 95/160 57 kills(이전 5362/112/56). [R10_HUNTER](R10_HUNTER.md)

- **R11** (main 직접 커밋 `b94f861`, `0c77ca8`, `3c8e7a0`): 헌터 철제 갑옷을 리그 본에 장착(모든 재질 슬롯 steel, 몸통 실측 맞춤), 오프닝 HUD 페이드인·레터박스·기상 포즈·타이틀 카드, 쇼케이스 hold 종료, 일시정지 Escape 재개, UI 크롬 영어 고정(`CHROME_LANG`).

- **R12 Enemy locomotion** (main): root cause of "enemies do not move" was the sim, not the renderer. Airlock crawlers ran into `airlock-crate` (x 9..10.6, 1.4 m, above the 0.38 m step) and pressed against it at x 11.02 forever: `vx` stayed at -8.8 so the pose read `run`/`crawl`, `stuckTicks` drifted, and chase/recover cycled. Fix in `world3d.ts`: crate hop (0.4..1.5 m with headroom and a landing), give-up to `patrol` with a 150-tick re-aggro cooldown, sight check (walls/doors block, low cover does not), deterministic separation of stalled foes (gap 0.85 m), `vx` clamped to the real displacement and `speedNow` smoothed from it, walk/run hysteresis. Renderer: single-mesh foes use `speedNow` with a 0.6/0.25 m/s latch. Bot: keeps the dash for a Warden charge and dashes back through it when cornered. `__reanimatorAdvance` builds a fresh world by default; pass `{ continue: true }` (or use `__reanimatorStep`) to keep the current one. Bot Normal 5522 ticks HP 95/160 (was 5533/95), Story 5606 HP 146, Hard 5633 HP 48 min 48, 0 deaths. Tests `tests/enemy-ai.test.ts` (8). Playwright telemetry sampled in all six sectors.
- **R12 robust** (`r12/robust`, [R12_ROBUST](R12_ROBUST.md)): bot `replan()` after any respawn (old bot failed 9 of 12 forced-defeat schedules, new passes all plus 93 double-kill schedules per difficulty), shot dash-dodge and counters. Bot Normal 5708 ticks HP 126 (was 5522/95), Story 5807 HP 160 (was 5606/146), Hard 5121 HP 133 min 100 (was 5633/48); 12-variant Hard stress grid 12/12 (was 5/12). Debug hooks: `debugEpoch` cancels stale Showcase/UiAudit, `enterManual` teardown always dismisses loading, Advance `{continue}`, `debug` result object and `layers`. Result copy in `src/ui/resultCopy.ts`. `make check` exit 0, 555/555. Browser unverified.

- **R12 integration** (main, 4 merges: look, motion, onboard, robust): onboard wins the no-save conflict (defeat always resumable, spawn restart keeps the run, `resultCheckpointLine` and `canResume` updated). `debug.stoppedOn` now reads `world.status`. Bot re-pinned after merge: Normal 5444 ticks HP 140 (min 93, lost 39), Story 5812 HP 143, Hard 5121 HP 133 (min 100, floor 80 holds); all win with 0 deaths. SHOWCASE_REEL cuts 4750 (biolabs, Meltdown) and 5400 (airlock) replace 5150/5650 (shaft, past the win). `make check` exit 0, 568/568, reach3d 52 waypoints 3432 ticks, dist-guard PASS. Unverified: browser look of hatch, reticle and bestiary pass, `make smoke-local`, G5 play.
- **R13 integration** (main, 4 merges: alive, combat, ux, reel, plus sim fixes): one enemy locomotion model. Crawler: ux `crawlerStride` + stride-locked `gaitStep` (3.4 Hz at 6.1 m/s) driven by alive `enemyTravelSpeed` (wall/ceiling crawlers use |v|) through `smoothDisplaySpeed`; the alive `CRAWLER_STRIDE` gait was dropped. Stalker/Warden rig: combat spike filter (`stepGroundSpeed`), sprint stride cap, walk/run band, hip bob and faster sprint turn, with ux `latchHysteresis` and the single per-kind `runLean` (combat's duplicate lean removed). Sim (`world3d.ts`): `separateEnemies3D` slides at most 0.07 m/tick (35% of the overlap, capped so own speed plus slide stays under 0.19 m), knockback launch capped at 12 m/s, and a chaser waits behind a stalled foe instead of pushing into it. Display: `stepGlide` is now a decaying offset safety net; the old position low-pass lagged a running foe by up to 1.5 m and then surged 0.25 to 0.3 m per frame (measured live). Reel: lab cut scales the lab to 0.86 so the caption clears the match grid; combat Counter moved to frame 110. Bot Normal 5208 ticks HP 126 (min 93), Story 5599 HP 139, Hard 5094 HP 114 (min 100), 0 deaths. SHOWCASE_REEL last cut 5160. `make check` exit 0, 625/625. See [R13_ALIVE](R13_ALIVE.md), [R13_COMBAT](R13_COMBAT.md), [R13_UX](R13_UX.md), [R13_REEL](R13_REEL.md).
- **R13 enemy motion evidence** (bot run, floor crawlers and stalkers). Sim, Normal, all non-attack ticks (`node tools/game/enemyJitter.ts`): before max step 0.79 m, 45 steps over 0.2 m (25 over 0.5 m), 43 chase reversals; after max 0.18 m, 0 over 0.2 m, 2 reversals (Story and Hard also 0 pops). Live Chrome via Playwright MCP, ticks 1900..3600, displayed x vs sim x of chasing foes: before crawler max display step 0.305 m with 27 frames over 0.2 m, stalker 0.294 m with 9; after crawler 0.177 m and stalker 0.174 m with 0 frames over 0.2 m. `tools/smoke/enemy-live.ts` is the same sampler as a script (Chrome does not launch in the agent sandbox, so it was run through the MCP browser). Feel in human play: unverified.
- **R14 integration** (main, 3 merges: charlight, terrain, transit, HEAD `f740169`, no conflicts, no push). Answers three user notes. (1) Transit ([R14_TRANSIT](R14_TRANSIT.md)): rooms were crossed too fast. Side-door walk-through lasts 42 ticks with jump, dash and fire ignored; foes within 14 m get a 150-tick entry grace (released on a hit); 3 m doorway clearance; `FrameRectSmoother` edge-speed cap; shaft zoom easing; a sector title card on each room change; reduce-motion uses a cut. (2) Terrain ([R14_TERRAIN](R14_TERRAIN.md)): Meshy was unreachable from this environment (api.meshy.ai, no key), so terrain is procedural: `terrainMaps.ts` (512 px detail textures plus Sobel normal maps), `terrainDetail.ts` (merged relief meshes, about 9.8k triangles in 18 strips), `drawBudget` counts terrain strips. (3) Character light ([R14_CHARLIGHT](R14_CHARLIGHT.md)): `charLight3d.ts` per-kind key and fill light, crevice darkening and exposure, softer rim, GLSL injected in `applyEnemyRim3D` and `applyWardenLook3D`, so characters read as shapes and not only outlines. Terrain and charlight are render-only. Bot pins unchanged after merge: Normal 4978 ticks HP 126, Story 4880 HP 142, Hard 5319 HP 104 (min 100). SHOWCASE_REEL cuts 2150/4420/4920 unchanged. Constraints held: deterministic sim, no `Math.random`, no new PointLights, at most 300 draw calls. Enemy running was handled in R13 and not changed in R14.
- **R14 browser check** (orchestrator, Playwright against `http://localhost:5173`): 0 console errors or warnings and no page errors across showcase scenes bestiary (mines), biolabs, security, boss (core) and opening (airlock). 1280x800 screenshots in `docs/evidence/r14/` (`mines_bestiary.png`, `biolabs_biolabs.png`, `security_security.png`, `core_boss.png`, `airlock_opening.png`). Terrain and charlight are verified by tests, the no-error browser run and screenshots only. No human playtest happened (G5 still unperformed), so whether the transit pace, terrain quality and character readability feel right is unverified.

## R15 (Meshy 터레인)

- 생성 보류: `api.meshy.ai` DNS 해석 실패(HTTP 000). 터레인은 R14 절차 생성 유지. `.env`는 gitignore 처리. Kiro Meshy MCP는 샌드박스 EPERM으로 미추가. 상세 `docs/R15_MESHY_TERRAIN.md`.

## R15 터레인 킷 (Meshy 11종, 로컬 커밋)

- 11개 GLB 인제스트(`terrain/`), `terrainKit.ts` 인스턴싱과 6개 섹터 연결, 시각 전용. `make check` exit 0(654/654, dist-guard 24 files). 브라우저 6개 섹터 draw calls 148~299(<=300), 콘솔 오류 0, 스크린샷 `docs/evidence/r15_meshy_terrain/`. Bio-Labs 299로 여유 없음. 사람 플레이 unverified. 위 "R15 (Meshy 터레인)" 항목의 생성 보류 설명은 이전 시도 기록이다. 상세 `docs/R15_MESHY_TERRAIN.md`.

## 세션 마감 검증 (오케스트레이터 Playwright 관찰, 2026-11-15)

- **R9**: `__reanimatorUiAudit()` 12개 시나리오 ok, Z 스캔 윤곽 표시, 보안 데크 Vault Nook 시크릿 발견, `8376998` 이후 카메라가 Nook 안까지 따라감, 콘솔 경고 0.
- **R10/R11**: 오프닝 알람·기상 비트가 레터박스와 HUD 없이 렌더, 무릎 꿇은 operative, 푸터 1996, HUD 한 줄에 HUNTER pill, 헌터 외형 개선 확인. 최종 `3c8e7a0`의 외형은 오케스트레이터가 재확인하지 않았다(unverified).
- **회귀 의심 조사(재현 불가)**: `__reanimatorAdvance`(skipIntro) 후 1.5 s 뒤 타이틀+어트랙트가 다시 나온다는 보고를 실제 Chrome(Playwright)에서 현재 코드로 조사했다(`src/ui/main.ts`: `__reanimatorAdvance` ~L1576, `hideIntro` ~L471, `exitShowcase` ~L1118). 5 s 후 호출과 로드 직후 호출 모두 mode `playing` 유지, `#title` display none, `#hud` 표시, 내비게이션 없음, 4 s 안정. `show('title')` 호출처는 `exitShowcase`, 쇼케이스 `title` 장면, `uiAudit`, 시작 시뿐이며 Advance 뒤에는 발동하지 않는다. 유력한 원인은 오케스트레이터 세션 중 동시 파일 편집으로 인한 Vite 전체 리로드 또는 낡은 HMR 인스턴스(리로드되면 타이틀+Bio-Labs 어트랙트와 이전 HUD 상태가 나온다). 코드 변경 없음. dev 서버를 깨끗이 재시작해 재확인할 것.
- Abuse·Metroid 느낌 요청은 R4_METROID_GAPS, R5-Rig, R9 Vault Nook, Warden 카운터, Classic View로 이미 반영됐다. 원본 Abuse 데이터는 쓰지 않았다.

## 검증 기준선 (R14 integration, make check 649/649)

- `make check` exit 0: 테스트 649/649, reach3d 52 waypoints 3432 ticks, 봇 Normal 4978 ticks HP 126, Story 4880 HP 142, Hard 5319 HP 104(min 100), dist-guard PASS(13 files, 14,891,509 B). 봉인 파일 무변경.

## 검증 기준선 (R13 integration, make check 625/625)

- `make check` exit 0: 테스트 625/625, reach3d 52 waypoints 3432 ticks, 봇 Normal 5208 ticks HP 126, Story 5599 HP 139, Hard 5094 HP 114(min 100), dist-guard PASS(13 files). 봉인 파일 무변경.

## 검증 기준선 (R12 enemy locomotion, make check 544/544)

- `make check` exit 0: 테스트 544/544, reach3d 52 waypoints 3432 ticks, 봇 Normal 5522 ticks HP 95/160, dist-guard PASS. 봉인 파일 무변경.

## 검증 기준선 (R11 최종, make check 534/534)

- `make check` exit 0: 테스트 534/534, reach3d 52 waypoints 3432 ticks, 봇 Normal 5533 ticks HP 95/160 57 kills, dist-guard PASS. 봉인 파일 무변경.

## 검증 기준선 (R10 브랜치, 구현 에이전트 관찰)

- `make check` exit 0: tsc 통과, node 테스트 493/493, `reference-verify` 3/3 PASS, `reach` PASS, `reach3d` 52 waypoints 3432 ticks, vite build, dist-guard PASS(13 files, 14,804,985 B). 봇 won 5533 ticks, HP 95/160, 57 kills, 사망 0. 봉인 파일 무변경. 브라우저 확인은 Chrome 불가로 unverified.

## 검증 기준선 (R9 병합 후, 통합 에이전트 관찰)

- `make check` exit 0: tsc 통과, node 테스트 459/459, `reference-verify` 3/3 PASS, `reach` PASS, `reach3d` 52 waypoints 3432 ticks, vite build, dist-guard PASS(13 files, 14,790,497 B, 218 대조). 봇 완주 won 5362 ticks, HP 112/160, 56 kills(변동 없음). 봉인 파일 무변경.
- 병합 충돌은 `tests/game3d.test.ts` 1곳(양쪽 테스트 유지). 브라우저 확인(카운터·스캔·Vault Nook·소품)은 Chrome 불가로 unverified.

## 이전 기준선 (R8 병합 후, 통합 에이전트 관찰)

- `make check` exit 0: tsc 통과, node 테스트 427/427, `reference-verify` 3/3 PASS, `reach` PASS, `reach3d` 52 waypoints 3432 ticks, vite build, dist-guard PASS(13 files, 14,775,872 B, 218 대조). 봉인 파일 무변경, R3.3 테스트 통과.
- 브라우저 확인(Lab UI, 설정·난이도 패널, 로그 리더·엔딩, soak trace)은 unverified. `lab.png`는 재촬영 필요.

이전 기준선(R7 이하): [archive/STATUS_baselines_R4_R7.md](archive/STATUS_baselines_R4_R7.md)
## R10 Classic
- Classic audit, CRT collapse toggle (0.4 s, instant under reduce flashing), flat Classic FX/DOM pills, meltdown alarm reduce gate. See docs/R10_CLASSIC.md. Browser checks unverified.

- **R10** (`r10/*`): 오프닝 9.8 s 시네마틱([R10_OPENING](R10_OPENING.md)), Classic View 감사·CRT 전환([R10_CLASSIC](R10_CLASSIC.md)), Warden 카운터·셋피스([R10_BOSS](R10_BOSS.md)), Bio-Labs Hunter 구역([R10_HUNTER](R10_HUNTER.md)). 통합: 사운드 이벤트 59, 헌터 pill에 Classic 규칙 적용(보스 카운터 표시는 캔버스 FX라 CSS 대상 없음), Ctrl/Alt 살금걸음은 keydown에서 preventDefault 하지 않아 브라우저 단축키와 충돌 없음. 검증: `make check` exit 0, 테스트 519/519, 봇 Normal 5533 ticks HP 95/160 kills 57(Story·Hard 봇 승리는 테스트 통과), reach3d 52 waypoints 3432 ticks, dist-guard 13 files 14,819,279 B. 브라우저 확인 unverified.

## R10 fix pass
- Opening black frame (CSS lids not seeked in showcase), hunter steel material, compact hunter pill, 1996 year unified, UI audit ends the opening and reports a reason. `__reanimator().perf` was never empty (keys `drawCalls`, `byGroup`, ...; no `calls`): no regression. Details in R10_OPENING.md and R10_HUNTER.md.

## R11 polish
- Hunter armour plates on rig bones ([R10_HUNTER](R10_HUNTER.md)); opening HUD fade-in, letterbox, wake pose, title card ([R10_OPENING](R10_OPENING.md)). Browser visuals unverified.

## R11 final fix pass
- Hunter: steel on every material slot (maps dropped, linear-space flash tints cut), armour fitted to the measured torso in bone-local space ([R10_HUNTER](R10_HUNTER.md)). Debug hooks: `__reanimatorAdvance` exits a held showcase/opening (`skipIntro`, frozen or running), `__reanimatorShowcase` drops the loading screen at once. Pause: Escape/P resumes from the root menu, sub-panels step back first, handled before the opening skip. UI chrome is English in every language (`CHROME_LANG`, `chromeLabel()` in `lore.ts`); only story text is KO/EN. `make check` exit 0, 534/534. Browser-checked in Playwright (ko-KR): dark hunter, no floating plates, overlay cleared, Escape toggles, `Logs` label.

## R12 (English only, enemy locomotion)

- All game text is English: `lore.ts` KO tables, locale detection and the LOGS language toggle were removed (`pickLang` always returns `en`; `__reanimatorShowLog` unchanged). README Korean summary removed.
- Frozen enemies: crawlers, droppers, climbers and spitters are single-mesh GLBs without bones, and their procedural gait moved only 0.05 m / 0.05 rad, which read as a frozen pose. Stalker and warden rigs were already animating (telemetry showed walk/run/attack weights). `proceduralEnemyPose` now drives a stride-locked scuttle (bob, roll, yaw swing, stretch) scaled by ground speed, plus stronger idle motion. Display only. Test: `tests/enemy-locomotion.test.ts`. Visual check in Chrome was limited to telemetry plus one screenshot, no before/after frame comparison (partly unverified).

- R12 post-fix: airlock crate crawlers now drop down and engage an idle player; tutorial hold counts from e-airlock-1 wake-up. Bot Normal 5123 / HP 118. Browser check unverified.
- R14 C (r14-charlight): character key/fill/AO/exposure term in character shaders, rims 0.25-0.35; make check exit 0, browser captures unverified. See docs/R14_CHARLIGHT.md.

- R16 (FEAT-002): Metroid abilities Blast Core, Scan Lens, Thermal Plating with three sealed caches. `make check` exit 0, bot pins unchanged. See `docs/R16_METROID_ABILITIES.md`. Browser verification not run.
