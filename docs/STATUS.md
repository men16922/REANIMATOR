# 현재 상태

최종 갱신: 2026-11-21 Kiroween 2026 Devpost 제출 완료(`https://devpost.com/software/reanimator`) 및 `origin/main` push 완료 · 그 전 2026-11-21 R28+BGM/트레일러 재제작(DSP 로우패스·clang 완화·1080p 트레일러·CloudFront 재배포) · 그 전 2026-11-21 R28(데모 트레일러·레트로 BGM·재배포·push) · 그 전 2026-11-17 R27(AWS 배포·tidy·제출 준비) · 이전 R20~R25 상세는 [archive/STATUS_R15_R25.md](archive/STATUS_R15_R25.md) · 2026-11-16 · R15 터레인 킷, R16 릴리스 1.0.0, Abuse 관찰(HEAD `eef01b6`, 푸시 없음) · 그 전: 2026-11-15 R14 통합(main, charlight·terrain·transit 병합, HEAD `f740169`, 푸시 없음) · 그 전: Post-R13 수정(Judge Reel 랩 오버레이·시계, 적 달리기 표현) · 그 전: R13 통합(main, alive·combat·ux·reel 병합과 적 이동 시뮬 수정, 푸시 없음). 이전: R9–R11 세션 마감(HEAD `3c8e7a0`). R10 병합: classic·opening·boss·hunter. R9 병합: fix·world·abuse·parry. 이전 상세판: [archive/STATUS_through_R3.md](archive/STATUS_through_R3.md).

## R28 제출 상태 (2026-11-21)

- **Devpost 제출 완료**: `https://devpost.com/software/reanimator` (Kiroween 2026, 카테고리 **Resurrection**, 제출자 `@men16922` Paul Choi / Individual, 5/5 단계 및 규칙 동의 완료). **마감(`2026-12-04 14:00 PT`)까지 수정 가능하며, 마감 이후에는 수상자 발표 전까지 저장소·영상·배포 URL·연결 자료를 수정하지 말 것.**
- 배포: https://dlr55kf9v2hn7.cloudfront.net (S3 비공개 + CloudFront OAC, `us-west-2`, 스택 `reanimator-site`, [infra/README](../infra/README.md)). 개선 BGM 빌드로 재배포·무효화(`I6497S1WOJI312QSKUJ4FMU6XH`) 완료(라이브 `index.html` MD5 `619e6b33465b66db9c17fb204f7aab4a` = 로컬 `dist/`, 번들 `/assets/index-CsTU0H5t.js` HTTP/2 200). 예산 알림은 미설정.
- 저장소: https://github.com/men16922/REANIMATOR public(`private: false`, `license: MIT`, `default_branch: main`), `6c32030` push 완료(`NOTICE.md` 분리, `/.kiro` 추적).
- 영상: `https://youtu.be/TvyT1M4yLzY` (public, 채널 `Paulos` `@paulosdev-j2u`, `docs/evidence/demo/reanimator_trailer.mp4` 79 MB, 1920×1080 H.264 25 fps, 71.96 s, AAC stereo 48 kHz 198 kbps, `-15.2 LUFS` / True Peak `-1.0 dBFS`, gitignore). 도구 `tools/smoke/{record-demo,record-bed,trailer-cards,trailer}.ts`.
- 제출 문안·심사 자료: [DEVPOST.md](DEVPOST.md)(영문, Devpost 등록 완료), [KIRO_USAGE.md](KIRO_USAGE.md) 영문 요약, [PREEXISTING_WORK.md](PREEXISTING_WORK.md), [README.md](../README.md)·[JUDGES.md](JUDGES.md) 최신화 및 푸시 완료. Kiro 크레딧 신청 완료(2026-11-21 사용자 확인).
- 검증: `make check` exit 0(766/766, `reach3d` S1 52/S2 33/S3 32 waypoints, `dist-guard` 56 files 20,780,579 B), `make smoke-local` 30/30(60.5 fps, 봇 4978 ticks, 오류 0), Playwright Bio-Labs `222` draw calls(`<=300`)·`REANIMATED` 카드 0 errors, `boss`/`meltdown`/`victory`/`biolabs`·트레일러 직접 청취·프레임 검수, `make release`로 `release/reanimator-1.1.0-web.zip`(12,263,114 B) 갱신.
- 열린 위험: (1) 사람 플레이 G5 미실시(실게임 전 구간 밸런스·BGM 실플레이 확인). (2) AWS 예산 알림 미설정.

## R27 스모크 복구 (2026-11-17)

- `make smoke-local` 30/30 PASS(Chrome, `rendererMode webgl-3d`, 모델 10종·rigged 11, 60.5 fps, 페이지 오류 0). 앱 결함이 아니라 `tools/smoke/smoke.ts`가 현재 UI와 어긋나 있었다: 메뉴 버튼 3→4(Stages 추가), 버튼명 `About the game`·`Physics lab`, Space 점프 검사가 공중에서 눌려 실패(체공 약 1.0 s, 대기 700→1400 ms). 프로브로 W·Space 점프 궤적 동일 확인.
- 직접 캡처(`docs/evidence/r27_first90/`)로 발견·수정: macOS Chrome에서 `-webkit-font-smoothing: none`+`optimizeSpeed` 때문에 작은 글자 `m`이 네모로 뭉쳐 보였다(`confir■`, `■ouse`, `■etroidvania`). 실제 렌더 폰트는 Menlo Bold(Press Start 2P·Silkscreen은 `@font-face` 없음). 안티앨리어싱 복원 후 캡처로 정상 확인. 스모크 에임 검사는 대시 직후 카메라 지연 때문에 간헐 실패해 대기 1500 ms·커서 x=1180으로 조정(이후 10회 중 실패 1회, 수정 직후).
- `make check` exit 0. 여전히 unverified: 사람 플레이, `make release`+`vite preview`, 흑화면 확정 원인.

## R26 색 그레이딩·HUD 라벨 수정 (2026-11-17, 로컬 커밋 a77646c·072fd2e)

- 흑화면 Bio-Labs 재현 시도: 새 로드, `__reanimatorShowcase`, 스테이지 교체(1↔2↔3), production build(`vite build`+`http.server`) 모두에서 재현 실패(draw calls 97~287, 전부 정상 렌더). R25가 의심한 Vite HMR 아티팩트 가설과 일치하나 확정 불가(circumstantial만 확보).
- `vista3d.ts`에 공유 GLSL 컬러 램프(`STAGE_RAMP`/`GRADE_UNIFORMS`/`GRADE_APPLY`/`gradeUniforms()`) 추가, `ambient3d.ts`가 재사용. Stage 1 무그레이딩 유지, Stage 2 warm ember(0x0c0605→0x7a2a0c→0xffa24a), Stage 3 cold blue(0x040810→0x1c4f9a→0xb4e0ff). 유리 반사 틴트도 스테이지별(`uRefl`/`uGlassGrade`, S1 원본 유지, S2 orange 0xff9a52, S3 blue 0x6aa8ff)로 분리해 Stage 2/3에 남아 있던 teal 유리/광선 줄무늬 제거.
- `main.ts`: 스테이지가 있을 때 HUD 구역명이 `STAGE_TITLES[stage.id].name`(Foundry Line/Reactor Spire)을 쓰도록 수정 — 이전에는 Stage 1 섹터 id(MINES 등)가 그대로 노출됐다.
- 자가 발견 버그: GRADE_APPLY 로컬 변수명 `gl_`이 GLSL 예약어라 셰이더 컴파일 에러 6건 발생 → `gLum`/`gCol`로 리네임, 콘솔 에러 0 확인.
- `tests/vista.test.ts`에 회귀 테스트 추가(gl_ 접두 로컬 금지, 유니폼 존재, Stage 1 grade=0, Stage 2/3 grade>0.5, S2는 warm/S3는 cold 순서).
- `make check` exit 0(766/766), reference-verify 3/3 PASS, reach3d 52 waypoints(57.2 s) PASS, dist-guard PASS(56 files, 20,780,639 B). 봇 핀 불변: `assist.test.ts` Normal 4978/HP126·Story 4880/142·Hard 5319/104, `stage-bot.test.ts` Stage 3 Story 3228/Normal 3243/Hard 3320 모두 통과.
- 스크린샷 `docs/evidence/r26_fix/`(s1/swap/repro/prod/a·b·c-s2/c-s3, 총 50장 이상) 전부 육안 확인: 흑화면 없음, Stage2/3 그레이딩·HUD 라벨 정상.
- Unverified: 흑화면의 확정 근본원인(HMR 추정, 실측 안 됨), `make smoke-local`, G5 사람 플레이. R25 지형 지오메트리 폴리시(이전 플래너가 별도 위임한 chamfered batches·back-lane clutter) 재검증은 이번 라운드 범위 밖.

## Abuse 레벨 관찰 (2026-11-16)

- LEVEL00~04 정적 조사(`tools/reference/spe-survey.ts`)와 DOSBox 실행(`HARNESS.levels.LSP`, `scripts/observe_levels.sh`). 00→01→02→03→04 전환을 `level_name` 로그로 확인, 04 출구는 엔딩 진입 추정. 스크린샷·팔레트는 윈도 서버 없음으로 unverified. [ABUSE_LEVEL_OBSERVATION](reference/ABUSE_LEVEL_OBSERVATION.md)

## R16 (2026-11-16)

- 능력 3종, 튜토리얼 모드·최소 HUD, 일시 DATA LOG 토스트, 레트로 UI, 차분해진 인트로, 릴리스용 텍스트 정리. `make check` exit 0(672/672). 요약 [R16_RETRO_TUTORIAL_UI](archive/rounds/R16_RETRO_TUTORIAL_UI.md). 미검증: `make smoke-local`, G5 사람 플레이.

## 구현 상태

- **복원(G0–G2)**: `src/engine/motion.ts`(15 Hz 설계값)가 S1·S2·S3와 sealed holdout M05에서 11개 필드 exact 일치. 브라우저 `#lab`(Restoration Lab)이 원본 로그와 엔진 재생을 나란히 보여 준다. 복원 범위는 이동 물리뿐.
- **시뮬** `src/game3d/world3d.ts`: 60 Hz 결정적, XY 레인(z=0). 6섹터, 잠금 문 6종, Thruster Boots(공중 점프) 게이트 2곳, Energy Tank, Save 스테이션, 보스 Core Warden 3페이즈, Meltdown 탈출. 봇 `bot3d.ts`+`nav3d.ts`가 완주한다.
- **R1** 손맛(히트스톱, 트라우마 셰이크, 카메라 rig), 타이틀·어트랙트, 성능 배칭, 게임플레이 깊이(벽점프, 스톰프, 레일 차지, 콤보, 수집품, 시크릿). [R1_GAMEPLAY](archive/rounds/R1_GAMEPLAY.md)
- **R2** 버그 수정, SVG 브랜드 로고·플레이트 메뉴, 보스 시네마틱·텔레그래프·데미지 숫자, 절차 음악·리버브. [R2_BOSS](archive/rounds/R2_BOSS.md), [R2_AUDIO](archive/rounds/R2_AUDIO.md)
- **R3** 버그 수정, Classic View(`V`, 320x200 팔레트 디더·CRT·직교 카메라·픽셀 HUD), Abuse풍 조명·고어·연기, dropper/climber/hive/떼. [R3_CLASSIC](archive/rounds/R3_CLASSIC.md), [R3_FOES](archive/rounds/R3_FOES.md)
- **R4-A 시각 폴리시** (`r4/polish`): 픽셀 폰트 글리프·HUD 라벨 축약, Classic 램프 샤프트·글로우 축소, 노이즈 화구+충격파 폭발, 보스 슬램 파동·코어 보호막·로그 홀로그램 셰이더, 세이브 스테이션·업그레이드 모델. [R4_METROID_GAPS](plans/R4_METROID_GAPS.md)(Metroid 보강안, 구현은 문서만)
- **R4-B 환경 위험** (`r4/hazards`): 크러셔, 증기, 레이저, 코어 증기, 낙석, 배럴 체인, 화물 리프트+매복, 바이오 스위치·갠트리, 에어록 브리지 붕괴. 봇·내비·`reach3d` 위험 검사 포함. [R4_HAZARDS](archive/rounds/R4_HAZARDS.md)
- **R4-C 플레이어** (`r4/hero`): operative 다리 본·반동·무기 스왑·벽 손·착지 포즈, 무기 모델 4종, 헤드램프 렌즈, 백팩 HP 표시등, `__reanimator().player` 텔레메트리.
- **R4-D 제출 패키지**: README 개편, [JUDGES](JUDGES.md), KIRO_USAGE 갱신, Credits 패널(Extras), package.json 설명·키워드.

- **R5-Metroid** (`r5/metroid`): Crawl Slide(터널 2곳), 파괴 블록 3, 맵 단말 6(미니맵 `?` 마커, `M` 키), Energy Tank 3, Ammo Expansion 2, 탈출 해치(final-shutter) 비트. `reach3d`에 터널·파괴·100% 완주·탈출 공정성 검사. [R5_METROID](archive/rounds/R5_METROID.md)
- **R5-Render** (`r5/render`): 메시 병합(영웅 장비·hive·정적 위험물), 벽 재질 frontLift, 노이즈 증기 시트, 보스 카메라 블렌드, `perf.byGroup`·`bossFrame` 텔레메트리. [R5_RENDER](archive/rounds/R5_RENDER.md)
- **R5-Rig** (`r5/rig`): 적 리깅(보폭 고정 걸음, 포즈 채널, 보스 패턴, 보조 모션, LOD, trace 지표). [R5_RIG](archive/rounds/R5_RIG.md)
- **R5-VFX** (`r5/vfx`): 4틱 웜화이트 피격 플래시(상한 0.3), 투사체 글로우 파티클, 색수차 상한 0.42, 팝업 티어·스택, 사망 팝, 레일 준비 링·음, 스캐터 파동.

- **R6-Arms** (`r6/arms`): 무기 5 Flamer(원뿔·burn), 6 Rocket(가속·폭발·로켓 점프 제한), 페데스털 2곳, HUD 슬롯 6, 키 5·6. [R6_ARMS](archive/rounds/R6_ARMS.md)
- **R6-Fix** (`r6/fix`): 표시 시간 기준 플레이어 피격 플래시, 폭발 화구 림 마스크, 맵 단말 캔버스 텍스처, `flat-boxes` 진단.
- **R6-Sound** (`r6/sound`): R3~R5 이벤트 전용 레시피, 팡파르 5종, 근접 루프, 탈출 음악. 병합 시 arms 이벤트(flamer·rocket·burn·rocket_jump)와 로켓 폭발(`explosion` value 1)을 전용 레시피에 연결, `PENDING_EVENT_SOUND` 제거. [R6_SOUND](archive/rounds/R6_SOUND.md)
- **R6-Demo** (`r6/demo`): `src/ui/demo.ts` 데모 투어 11곳, 쇼케이스 릴, `__reanimatorShowcase`·`__reanimatorDemo`. 늦은 체크포인트(보안 데크 이후, 보스)는 무기 6종 지급. [JUDGES](JUDGES.md)

- **R7-UI** (`r7/ui`): z-index 토큰 스케일, `.menu-list` 애니메이션 제거(EXTRAS 목록이 보이지 않던 원인), `#lab`·`#revived` 불투명 배경, `src/ui/panels.ts`(topLayer, titleCovered), `window.__reanimatorUiAudit()`.
- **R7-Cam** (`r7/cam`): `src/render3d/cameraFrame.ts`(룸 클램프, 수직 구도 42%, FrameRectSmoother, 섹터 힌트, 동적 줌 0.92~1.28), 기본 거리 15.5 → 13.5, 보스 프레이밍 연동, 공중 데드존 1.7, `__reanimator().camera`.
- **R7-Soak** (`r7/soak`): `teardownLevel()`, frame try/catch 가드, webglcontextlost/restored, `window.__reanimatorSoak(n, {showcase})`, perf/fx 텔레메트리, audio `trackedVoices`. [R7_SOAK](plans/R7_SOAK.md)
- **R7-Vista** (`r7/vista`): 뒷벽 개구부와 섹터별 원경(`vistaGeo.ts`, `vistaScenes.ts`, `vista3d.ts`), 섹터당 draw call +4, `__reanimator().vista`.
- 병합 충돌 2곳: `main.ts`(soak·ui 선언과 훅 양쪽 유지), `scene3dFull.ts`(cam: soak의 `frameMs.fx` 계측과 cam의 구도 계산 양쪽 유지, 기존 하드코딩 앵커 제거). vista는 자동 병합. 통합 단계에서 `teardownLevel()`에 `vista.dispose()`와 `frameRect.reset()`을 추가했다(레벨 교체 시 원경 누수와 카메라 사각형 잔존 방지).

- **R8-Leak** (`r8/leak`): `src/render3d/disposeActor.ts`(Skeleton.boneTexture, 소유 지오메트리, 재질, mixer 해제), `disposeActor3D`, `__reanimatorSoak {trace:true}` 단계별 계측.
- **R8-Assist** (`r8/assist`): 난이도 Story/Normal/Hard(`newWorld3D({difficulty, assist})`, Normal은 항등), 조준 보조·자동 사격·0.8×·위험 경고, 사망 원인 15종과 `#result-cause`. [R8_ASSIST](archive/rounds/R8_ASSIST.md)
- **R8-Lore** (`r8/lore`): 데이터 로그 6편(영·한), 로그 리더·아카이브, 섹터 부제, 인트로, 엔딩 3단(ASH/EMBERS/TRUE ENDING), 크레딧 롤, `__reanimatorShowLog`.
- **R8-Lab** (`r8/lab`): Restoration Lab 재설계(`labModel.ts`, `labView.ts`): 시나리오 카드, 분할 캔버스, 오버레이, 전송 컨트롤, 11필드×틱 히트맵, 검증 설명. `#lab-scenario`는 숨김 상태로 카드가 구동.
- 병합 충돌: `index.html`(lore 패널과 lab 영역 모두 유지, result-cause와 ending 공존), `main.ts`(showEnding과 사망 원인 팁 둘 다 호출, labView import), `style.css`(assist·lore 규칙 모두 유지). lore가 `SECTOR_SUBTITLE` 사용을 제거했으므로 미사용 import를 삭제했다.
- M05 정책 점검: 원래 Lab(`c8cded1`)의 `lab.ts`가 이미 `reference/holdout/m05_v8.hlog.txt`와 `scenarios.json`으로 M05를 표시했다. R8 Lab과 `tests/lab.test.ts`는 같은 데이터를 같은 비교기로 재생하는 읽기 전용 표시이며 엔진 수정·튜닝에 쓰지 않는다. 새 holdout 접근 경로 없음, 봉인 파일 무변경.

- **R9-Fix** (`r9/fix`): UI 감사가 숨김·비활성 컨트롤을 건너뜀, 탈출 pill 승리 후 숨김, 샤프트 Cracked Wall 프롬프트. [R9_FIX](archive/rounds/R9_FIX.md)
- **R9-World** (`r9/world`): 섹터별 소품, 드로콜 예산(`drawBudget.ts`), 탈출 시 장식 틴트. [R9_WORLD](archive/rounds/R9_WORLD.md)
- **R9-Abuse** (`r9/abuse`): 보안 데크 Vault Nook(기댐 열림 가짜 벽, 시크릿 5, 완료율 총 23), 픽업 자석, 묵직한 픽업 음. [R9_ABUSE](archive/rounds/R9_ABUSE.md)
- **R9-Parry** (`r9/parry`): 근접 카운터(`X`/`C`), 스캔 펄스(`Z`). 키 배정 결정과 병합 보강(스캔이 기댐 벽을 시크릿으로 표시)은 [R9_PARRY](archive/rounds/R9_PARRY.md).

- **R10-Hunter** (`r10/hunter`): Bio-Labs 동쪽 구역의 E.M.M.I.풍 사냥꾼 Reclaimer(소음 감지, 카운터 QTE, 일반 사격 면역, Rail 오버차지·열린 바이저·키 아이템 소지 이탈로 영구 비활성). HUD `HUNTER ZONE`, 붉은 색조·스팅, Ctrl/Alt 살금걸음. 봇 Normal 5533 ticks HP 95/160 57 kills(이전 5362/112/56). [R10_HUNTER](archive/rounds/R10_HUNTER.md)

- **R11** (main 직접 커밋 `b94f861`, `0c77ca8`, `3c8e7a0`): 헌터 철제 갑옷을 리그 본에 장착(모든 재질 슬롯 steel, 몸통 실측 맞춤), 오프닝 HUD 페이드인·레터박스·기상 포즈·타이틀 카드, 쇼케이스 hold 종료, 일시정지 Escape 재개, UI 크롬 영어 고정(`CHROME_LANG`).

- **R12 Enemy locomotion** (main): root cause of "enemies do not move" was the sim, not the renderer. Airlock crawlers ran into `airlock-crate` (x 9..10.6, 1.4 m, above the 0.38 m step) and pressed against it at x 11.02 forever: `vx` stayed at -8.8 so the pose read `run`/`crawl`, `stuckTicks` drifted, and chase/recover cycled. Fix in `world3d.ts`: crate hop (0.4..1.5 m with headroom and a landing), give-up to `patrol` with a 150-tick re-aggro cooldown, sight check (walls/doors block, low cover does not), deterministic separation of stalled foes (gap 0.85 m), `vx` clamped to the real displacement and `speedNow` smoothed from it, walk/run hysteresis. Renderer: single-mesh foes use `speedNow` with a 0.6/0.25 m/s latch. Bot: keeps the dash for a Warden charge and dashes back through it when cornered. `__reanimatorAdvance` builds a fresh world by default; pass `{ continue: true }` (or use `__reanimatorStep`) to keep the current one. Bot Normal 5522 ticks HP 95/160 (was 5533/95), Story 5606 HP 146, Hard 5633 HP 48 min 48, 0 deaths. Tests `tests/enemy-ai.test.ts` (8). Playwright telemetry sampled in all six sectors.
- **R12 robust** (`r12/robust`, [R12_ROBUST](archive/rounds/R12_ROBUST.md)): bot `replan()` after any respawn (old bot failed 9 of 12 forced-defeat schedules, new passes all plus 93 double-kill schedules per difficulty), shot dash-dodge and counters. Bot Normal 5708 ticks HP 126 (was 5522/95), Story 5807 HP 160 (was 5606/146), Hard 5121 HP 133 min 100 (was 5633/48); 12-variant Hard stress grid 12/12 (was 5/12). Debug hooks: `debugEpoch` cancels stale Showcase/UiAudit, `enterManual` teardown always dismisses loading, Advance `{continue}`, `debug` result object and `layers`. Result copy in `src/ui/resultCopy.ts`. `make check` exit 0, 555/555. Browser unverified.

- **R12 integration** (main, 4 merges: look, motion, onboard, robust): onboard wins the no-save conflict (defeat always resumable, spawn restart keeps the run, `resultCheckpointLine` and `canResume` updated). `debug.stoppedOn` now reads `world.status`. Bot re-pinned after merge: Normal 5444 ticks HP 140 (min 93, lost 39), Story 5812 HP 143, Hard 5121 HP 133 (min 100, floor 80 holds); all win with 0 deaths. SHOWCASE_REEL cuts 4750 (biolabs, Meltdown) and 5400 (airlock) replace 5150/5650 (shaft, past the win). `make check` exit 0, 568/568, reach3d 52 waypoints 3432 ticks, dist-guard PASS. Unverified: browser look of hatch, reticle and bestiary pass, `make smoke-local`, G5 play.
- **R13 integration** (main, 4 merges: alive, combat, ux, reel, plus sim fixes): one enemy locomotion model. Crawler: ux `crawlerStride` + stride-locked `gaitStep` (3.4 Hz at 6.1 m/s) driven by alive `enemyTravelSpeed` (wall/ceiling crawlers use |v|) through `smoothDisplaySpeed`; the alive `CRAWLER_STRIDE` gait was dropped. Stalker/Warden rig: combat spike filter (`stepGroundSpeed`), sprint stride cap, walk/run band, hip bob and faster sprint turn, with ux `latchHysteresis` and the single per-kind `runLean` (combat's duplicate lean removed). Sim (`world3d.ts`): `separateEnemies3D` slides at most 0.07 m/tick (35% of the overlap, capped so own speed plus slide stays under 0.19 m), knockback launch capped at 12 m/s, and a chaser waits behind a stalled foe instead of pushing into it. Display: `stepGlide` is now a decaying offset safety net; the old position low-pass lagged a running foe by up to 1.5 m and then surged 0.25 to 0.3 m per frame (measured live). Reel: lab cut scales the lab to 0.86 so the caption clears the match grid; combat Counter moved to frame 110. Bot Normal 5208 ticks HP 126 (min 93), Story 5599 HP 139, Hard 5094 HP 114 (min 100), 0 deaths. SHOWCASE_REEL last cut 5160. `make check` exit 0, 625/625. See [R13_ALIVE](archive/rounds/R13_ALIVE.md), [R13_COMBAT](archive/rounds/R13_COMBAT.md), [R13_UX](archive/rounds/R13_UX.md), [R13_REEL](archive/rounds/R13_REEL.md).
- **R13 enemy motion evidence** (bot run, floor crawlers and stalkers). Sim, Normal, all non-attack ticks (`node tools/game/enemyJitter.ts`): before max step 0.79 m, 45 steps over 0.2 m (25 over 0.5 m), 43 chase reversals; after max 0.18 m, 0 over 0.2 m, 2 reversals (Story and Hard also 0 pops). Live Chrome via Playwright MCP, ticks 1900..3600, displayed x vs sim x of chasing foes: before crawler max display step 0.305 m with 27 frames over 0.2 m, stalker 0.294 m with 9; after crawler 0.177 m and stalker 0.174 m with 0 frames over 0.2 m. `tools/smoke/enemy-live.ts` is the same sampler as a script (Chrome does not launch in the agent sandbox, so it was run through the MCP browser). Feel in human play: unverified.
- **R14 integration** (main, 3 merges: charlight, terrain, transit, HEAD `f740169`, no conflicts, no push). Answers three user notes. (1) Transit ([R14_TRANSIT](archive/rounds/R14_TRANSIT.md)): rooms were crossed too fast. Side-door walk-through lasts 42 ticks with jump, dash and fire ignored; foes within 14 m get a 150-tick entry grace (released on a hit); 3 m doorway clearance; `FrameRectSmoother` edge-speed cap; shaft zoom easing; a sector title card on each room change; reduce-motion uses a cut. (2) Terrain ([R14_TERRAIN](archive/rounds/R14_TERRAIN.md)): Meshy was unreachable from this environment (api.meshy.ai, no key), so terrain is procedural: `terrainMaps.ts` (512 px detail textures plus Sobel normal maps), `terrainDetail.ts` (merged relief meshes, about 9.8k triangles in 18 strips), `drawBudget` counts terrain strips. (3) Character light ([R14_CHARLIGHT](archive/rounds/R14_CHARLIGHT.md)): `charLight3d.ts` per-kind key and fill light, crevice darkening and exposure, softer rim, GLSL injected in `applyEnemyRim3D` and `applyWardenLook3D`, so characters read as shapes and not only outlines. Terrain and charlight are render-only. Bot pins unchanged after merge: Normal 4978 ticks HP 126, Story 4880 HP 142, Hard 5319 HP 104 (min 100). SHOWCASE_REEL cuts 2150/4420/4920 unchanged. Constraints held: deterministic sim, no `Math.random`, no new PointLights, at most 300 draw calls. Enemy running was handled in R13 and not changed in R14.
- **R14 browser check** (orchestrator, Playwright against `http://localhost:5173`): 0 console errors or warnings and no page errors across showcase scenes bestiary (mines), biolabs, security, boss (core) and opening (airlock). 1280x800 screenshots in `docs/evidence/r14/` (`mines_bestiary.png`, `biolabs_biolabs.png`, `security_security.png`, `core_boss.png`, `airlock_opening.png`). Terrain and charlight are verified by tests, the no-error browser run and screenshots only. No human playtest happened (G5 still unperformed), so whether the transit pace, terrain quality and character readability feel right is unverified.
