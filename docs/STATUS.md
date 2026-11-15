# 현재 상태

최종 갱신: 2026-11-15 · R5 병합 완료(metroid·render·rig·vfx, `--no-ff`). 이전 상세판: [archive/STATUS_through_R3.md](archive/STATUS_through_R3.md).

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

## 검증 기준선 (R5 병합 후, 통합 에이전트 관찰)

- `make check` exit 0: tsc 통과, node 테스트 291/291, `reference-verify` 3/3 PASS, `reach` PASS, `reach3d` 52 waypoints 3432 ticks(57.2 s), vite build, dist-guard PASS(13 files, 14,652,123 B, 218 대조). 병합 충돌은 `scene3dFull.ts` 1곳(metroid3d 빌드와 hazards `setClassic`, 양쪽 유지). rig·vfx는 자동 병합. frontLift는 벽·램프 재질 전용이라 적 림 셰이더와 겹치지 않음(코드 확인).
- 브라우저 검증(콘솔, drawCalls, 쇼케이스 재촬영)은 오케스트레이터가 진행 중이며 이 문서 작성 시점에는 unverified. 봇 완주 수치는 metroid 브랜치 측정 won 5362 ticks, HP 112이며 병합 후 재측정은 unverified.

## 이전 기준선 (R4 병합 후)

- `make check` exit 0: tsc 통과, node 테스트 244/244, `reference-verify` 3/3 PASS, `reach` PASS, `reach3d` 52 waypoints 3432 ticks, vite build, dist-guard PASS(13 files, 14,619,332 B, 218 대조).
- 봇(hazards 브랜치 측정): won 5362 ticks, HP 112. 병합 후 봇·브라우저 수치(drawCalls, 콘솔)는 unverified.

## 진입점

- [KIRO_USAGE](KIRO_USAGE.md) · [JUDGES](JUDGES.md) · [평가](EVALUATION.md) · [도구](evidence/TOOLCHAIN.md) · [판정 계약](reference/VERIFICATION_CONTRACT.md) · [자산 등록부](reference/ASSET_REGISTER.md)
- spec: `.kiro/specs/{abuse-reference,restored-motion,reanimated-slice,full-3d-quarter-view,metroidvania-3d}/`, steering `.kiro/steering/`, hook `.kiro/hooks/engine-gate-on-save.json`

## 미확인·위험

- 사람 플레이(G5) 미실시. 봇은 HP를 거의 잃지 않아 난이도 근거가 못 된다(무모한 입력 `make difficulty`는 정체).
- `make smoke-local`은 이전 샌드박스에서 Chrome abort(134). 최신 기준 smoke는 unverified. 브라우저 확인은 오케스트레이터의 Playwright 관찰에 의존.
- 15 Hz는 설계값이며 원본 틱은 미측정. `.kiro/settings/mcp.json` REA MCP 쓰기 차단 잔여.
- 쇼케이스 PNG 5장(title, classic, mines, biolabs, boss)은 저장됨. biolabs·boss는 재촬영 예정. combat·lab은 미저장.
