# 현재 상태

최종 갱신: 2026-11-16 · R15 터레인 킷, R16 릴리스 1.0.0, Abuse 관찰(HEAD `eef01b6`, 푸시 없음) · 그 전: 2026-11-15 R14 통합(main, charlight·terrain·transit 병합, HEAD `f740169`, 푸시 없음) · 그 전: Post-R13 수정(Judge Reel 랩 오버레이·시계, 적 달리기 표현) · 그 전: R13 통합(main, alive·combat·ux·reel 병합과 적 이동 시뮬 수정, 푸시 없음). 이전: R9–R11 세션 마감(HEAD `3c8e7a0`). R10 병합: classic·opening·boss·hunter. R9 병합: fix·world·abuse·parry. 이전 상세판: [archive/STATUS_through_R3.md](archive/STATUS_through_R3.md).

## R23 FEAT-003 전체 런 엔딩 (2026-11-17, 로컬 커밋)

- `records.ts`에 런 로그(`addToRun`: Stage 1 클리어가 새 런 시작, `summarizeRun`: 3스테이지 합계)와 최고 전체 런 기록(별도 키 `reanimator.fullrun.v1`, v1 스테이지 기록 키는 불변이라 마이그레이션 불필요). Stage 3 클리어 화면에 "REANIMATED" 카드(총 시간·죽음·킬, 스테이지별 줄, 최고 기록). 디버그 훅 `__reanimatorShowEnding()`(dev/debug 빌드만, 저장소 복원). `tests/fullrun.test.ts`.
- `make check` exit 0(759/759). Unverified: 브라우저 표시(오케스트레이터 검증).

## R23 FEAT-002 게임패드·접근성 (2026-11-17, 로컬 커밋)

- `src/game3d/gamepad.ts`(순수 매핑·데드존, 표준 매핑: 스틱/D-pad 이동, 우스틱 조준, A 점프, B 대시, X/RT 발사, Y 상호작용, LT 카운터, LB/RB 무기, Start 일시정지)와 `settings.ts`(키 `reanimator.settings.v1`: reduceFx, largeHud). `src/ui/main.ts` 입력 계층에서만 패드를 읽고 시뮬은 불변. 설정에 "Reduce motion and flashing"(기존 흔들림·플래시 감쇠에 연결)과 "Larger HUD text", 컨트롤 안내에 게임패드 추가. `tests/gamepad.test.ts`.
- `make check` exit 0(753/753). 봇 핀 불변. Unverified: 실제 패드 하드웨어, 브라우저 UI(오케스트레이터 검증).

## R23 FEAT-001 R22 갭 수정 (2026-11-17, 로컬 커밋)

- ASSET_REGISTER terrain 표 17행 복구, finalize는 manifest 기준으로 재생성. GLB 17종 법선 복구 테스트 추가. `make check` exit 0(746/746). 봇 핀 Normal 4978/126, Story 4880/142, Hard 5319/104 확인.

## R22 Frost 에셋·실행 기록 (2026-11-17, 로컬 커밋 287d595·3409aef·c1a8681 + 기록 커밋)

- Meshy GLB 3종 ingest(WebP 512): frost-shield 226,352 B / 3000 tris(Bulwark 방패, 내려가면 숨김), coolant-pipe-wall 241,004 B / 3907(Stage 3 뒷 레인), cryo-rack 162,872 B / 2448. Stage 3 draw calls 95-138([DRAWCALLS](evidence/r22_assets/DRAWCALLS.md)).
- 실행 기록: `src/game3d/records.ts`(키 `reanimator.records.v1`, 스테이지별 최단 시간·최소 사망·최다 처치, 안전 파싱, `tests/records.test.ts`). 클리어 화면에 NEW BEST와 기록 줄, Stage Select에 BEST 시간·사망. 새로고침 후 유지 확인 [r22_records](evidence/r22_records/).
- `make check` exit 0(744/744, dist-guard PASS). 봇 핀 불변.
- Unverified: `make smoke-local`, 오디오 청감, Stage 2·3 사람 플레이, 릴리스 zip `vite preview`.

## R21 렌더 버그·Stage 3 신규 적·스테이지 사운드·README (2026-11-17, 로컬 커밋 8c2699b·bcf4e06·f1b4286·b9f9d1d)

- Foreman 흰 실루엣 원인: 윈드업 중 패리 창(`parryOpen`)의 흰색 0.6 emissive 플래시가 텍스처 없는 emissive로 거의 검은 알베도를 덮음(런타임 emissive `cbcbcb`). 수정: Foreman 재질 `emissiveMap = map`, 패리 펄스는 주황(`PARRY_FLASH_DARK_HEX`). 전후 [r21_foreman](evidence/r21_foreman/). Furnace Gate 126 draw calls.
- r19 검은 사각형 원인: 보스 인트로 레터박스 `.bar`가 HUD 전역 `.bar`(5.5em, `body:not(.classic) .bar{position:relative}`)에 덮여 좌상단 사각형 2개가 됨. 클래스 `lb-bar`로 분리. SPIRE WARDEN 카드 육안 확인 [r21_stage3](evidence/r21_stage3/).
- Stage 3 Cryo Bulwark(`stage3.ts`, 변형 `bulwark`): 정면 서리 방패가 Pulse·Scattergun을 30%로 감쇠, 윈드업·공격·회복·경직 중엔 내려감, Rail·Grenade·Flamer·Rocket·밟기·카운터는 관통. 이벤트 `shield_block`. 스토커 3개 슬롯에 적용(id·수 불변). Cryo Stacks 133 draw calls(방패 1개당 +1).
- 스테이지 사운드: `themeForStage`(Stage 2 −2반음·0.92배·모루 클랭, Stage 3 +3반음·1.06배·사인 아르페지오·틱 햇), `STAGE_AMBIENT`, `stageSurfaceFor`, 도착 스팅어 `stinger.stage2/3`. 브라우저에서 Stage 3 테마·스팅어 재생 확인.
- README 재작성(피치, 기능, 복원 범위, 스크린샷), `index.html` 메타. dist 가드에 `kiro`/`judg` 금지어 추가, 빌드에서 봉인 픽스처의 `knownLimits` 문구를 제거하는 Vite 플러그인(소스 불변, Lab PASS 확인).
- `make check` exit 0(737/737). 봇 핀 불변: Stage 1 Normal 4978/126, Story 4880/142, Hard 5319/104. Stage 2/3 핀도 불변. `make release` exit 0(`release/reanimator-1.1.0-web.zip`).
- Unverified: `make smoke-local`(샌드박스 Chrome 실행 실패, NOT RUN), 사람 플레이, 오디오 청감.

## R20 Foreman 메시·릴 Stage 2/3 컷·폴리시 (2026-11-16, 로컬 커밋 de8a151·c3e21e8·fd78fd5)

- Slag Foreman 전용 Meshy 메시(절차 포즈), 트레일러 릴 10컷에 Stage 2 Foreman·Stage 3 Spire 컷 추가.
- 폴리시: Foreman 미니보스 이름 카드(섹터 카드 형식), Warden 인트로 카드 스테이지별(Stage 3 = SPIRE WARDEN), Stage 3 보스 바·목표·텔레포터 힌트 이름 통일, Foreman 전용 음성 5종, Foreman 피격 스파크·사망 버스트, 가까운 증기 분출 시 카메라 흔들림. 스크린샷 [r20_polish](evidence/r20_polish/).
- draw calls: Stage 1 combat 릴 컷 306 → 287(그림자 패스 캐스터 제한 등, [DRAWCALLS](evidence/r20_reel/DRAWCALLS.md)). 전 컷 300 이하.
- `make check` exit 0(725/725, reach3d 52 waypoints 3432 ticks, dist-guard PASS 34 files). 봇 핀 불변: Normal 4978/HP126, Story 4880/142, Hard 5319/104(min 100).
- 인트로 재발동 조사: Warden 인트로는 `world3d.ts`에서 플레이어가 `core` 방에 있고 `bossIntroDone`이 false이고 Warden이 살아 있을 때만 시작한다. Cryo Stacks 오버레이는 디버그 텔레포트에서 온 것으로 추정(unverified).
- Unverified: `make smoke-local`, `make release`/`vite preview`, Stage 2·3 사람 플레이, 시네마틱 인트로 오버레이의 SPIRE WARDEN 육안(DOM 텍스트만 확인).

## Abuse 레벨 관찰 (2026-11-16)

- LEVEL00~04 정적 조사(`tools/reference/spe-survey.ts`)와 DOSBox 실행(`HARNESS.levels.LSP`, `scripts/observe_levels.sh`). 00→01→02→03→04 전환을 `level_name` 로그로 확인, 04 출구는 엔딩 진입 추정. 스크린샷·팔레트는 윈도 서버 없음으로 unverified. [ABUSE_LEVEL_OBSERVATION](reference/ABUSE_LEVEL_OBSERVATION.md)

## 열린 위험 (2026-11-16)

- R17: 스테이지 선택·클리어 화면·진행 저장(`stageFlow.ts`, default-merge) 추가, 디버그 훅은 `VITE_DEBUG_HOOKS=1` 빌드(`make smoke-build` → `dist-debug/`)에서만 `?debug=1`로 켜짐. 전투 쇼케이스 draw calls는 R18에서 294로 해결, 스테이지 UI는 R18에서 브라우저 확인. Meshy API 키 채팅 노출(교체 필요). 푸시 대기. R16 릴리스 1.0.0(`make release` zip)의 `vite preview`와 새 능력 브라우저 동작은 unverified.
- 다음 방향: 다단계 스테이지 확장(안 A/B)을 사용자가 선택. [NEXT_PLAN](NEXT_PLAN.md).

## R16 (2026-11-16)

- 능력 3종, 튜토리얼 모드·최소 HUD, 일시 DATA LOG 토스트, 레트로 UI, 차분해진 인트로, 릴리스용 텍스트 정리. `make check` exit 0(672/672). 요약 [R16_RETRO_TUTORIAL_UI](R16_RETRO_TUTORIAL_UI.md). 미검증: `make smoke-local`, G5 사람 플레이.

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

## R15 터레인 킷 (Meshy 11종, 로컬 커밋)

- 11개 GLB 인제스트(`terrain/`), `terrainKit.ts` 인스턴싱과 6개 섹터 연결, 시각 전용. `make check` exit 0(654/654, dist-guard 24 files). 브라우저 6개 섹터 draw calls 148~299(<=300), 콘솔 오류 0, 스크린샷 `docs/evidence/r15_meshy_terrain/`. Bio-Labs 299로 여유 없음. 사람 플레이 unverified. Meshy t2.5 smart-topology 4k tris PBR, 165 credits 사용(잔액 608). 상세 `docs/R15_MESHY_TERRAIN.md`.

## 세션 마감 검증 (오케스트레이터 Playwright 관찰, 2026-11-15)

- **R9**: `__reanimatorUiAudit()` 12개 시나리오 ok, Z 스캔 윤곽 표시, 보안 데크 Vault Nook 시크릿 발견, `8376998` 이후 카메라가 Nook 안까지 따라감, 콘솔 경고 0.
- **R10/R11**: 오프닝 알람·기상 비트가 레터박스와 HUD 없이 렌더, 무릎 꿇은 operative, 푸터 1996, HUD 한 줄에 HUNTER pill, 헌터 외형 개선 확인. 최종 `3c8e7a0`의 외형은 오케스트레이터가 재확인하지 않았다(unverified).
- **회귀 의심 조사(재현 불가)**: `__reanimatorAdvance`(skipIntro) 후 1.5 s 뒤 타이틀+어트랙트가 다시 나온다는 보고를 실제 Chrome(Playwright)에서 현재 코드로 조사했다(`src/ui/main.ts`: `__reanimatorAdvance` ~L1576, `hideIntro` ~L471, `exitShowcase` ~L1118). 5 s 후 호출과 로드 직후 호출 모두 mode `playing` 유지, `#title` display none, `#hud` 표시, 내비게이션 없음, 4 s 안정. `show('title')` 호출처는 `exitShowcase`, 쇼케이스 `title` 장면, `uiAudit`, 시작 시뿐이며 Advance 뒤에는 발동하지 않는다. 유력한 원인은 오케스트레이터 세션 중 동시 파일 편집으로 인한 Vite 전체 리로드 또는 낡은 HMR 인스턴스(리로드되면 타이틀+Bio-Labs 어트랙트와 이전 HUD 상태가 나온다). 코드 변경 없음. dev 서버를 깨끗이 재시작해 재확인할 것.
- Abuse·Metroid 느낌 요청은 R4_METROID_GAPS, R5-Rig, R9 Vault Nook, Warden 카운터, Classic View로 이미 반영됐다. 원본 Abuse 데이터는 쓰지 않았다.

이전 기준선(R8–R14)과 R10–R12 세부: [archive/STATUS_R8_R14.md](archive/STATUS_R8_R14.md).
