# 현재 상태

최종 갱신: 2026-11-15 · R9 병합 완료(fix·world·abuse·parry, `--no-ff`). 이전 상세판: [archive/STATUS_through_R3.md](archive/STATUS_through_R3.md).

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

## 검증 기준선 (R9 병합 후, 통합 에이전트 관찰)

- `make check` exit 0: tsc 통과, node 테스트 459/459, `reference-verify` 3/3 PASS, `reach` PASS, `reach3d` 52 waypoints 3432 ticks, vite build, dist-guard PASS(13 files, 14,790,497 B, 218 대조). 봇 완주 won 5362 ticks, HP 112/160, 56 kills(변동 없음). 봉인 파일 무변경.
- 병합 충돌은 `tests/game3d.test.ts` 1곳(양쪽 테스트 유지). 브라우저 확인(카운터·스캔·Vault Nook·소품)은 Chrome 불가로 unverified.

## 이전 기준선 (R8 병합 후, 통합 에이전트 관찰)

- `make check` exit 0: tsc 통과, node 테스트 427/427, `reference-verify` 3/3 PASS, `reach` PASS, `reach3d` 52 waypoints 3432 ticks, vite build, dist-guard PASS(13 files, 14,775,872 B, 218 대조). 봉인 파일 무변경, R3.3 테스트 통과.
- 브라우저 확인(Lab UI, 설정·난이도 패널, 로그 리더·엔딩, soak trace)은 unverified. `lab.png`는 재촬영 필요.

이전 기준선(R7 이하): [archive/STATUS_baselines_R4_R7.md](archive/STATUS_baselines_R4_R7.md)
## R10 Classic
- Classic audit, CRT collapse toggle (0.4 s, instant under reduce flashing), flat Classic FX/DOM pills, meltdown alarm reduce gate. See docs/R10_CLASSIC.md. Browser checks unverified.
