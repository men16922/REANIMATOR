# 다음 작업

이전 계획 전문: [archive/NEXT_PLAN_through_R3.md](archive/NEXT_PLAN_through_R3.md)(재귀 개선 1~3차, 몬스터·지형, R1~R3 후속 체크리스트 포함).

## 사용자 결정 대기: 다단계 스테이지 확장

- [ ] 안 선택. A: 현 맵을 Stage 0 허브/튜토리얼(Airlock), Stage 1(Shaft+Mines), Stage 2(Bio-Labs+Security), Stage 3(Core 보스+Meltdown)로 분할. B: 현 맵을 Stage 1로 두고 신규 2개 추가. 근거 [ABUSE_LEVEL_OBSERVATION](reference/ABUSE_LEVEL_OBSERVATION.md) §7(허브+선형 레벨).
- [ ] 공통 요구: 스테이지 클리어 화면, 스테이지 선택, 스테이지별 출구 텔레포터(상호작용 키), 타이틀 카드, 스테이지별 스위치·문 퍼즐, 길이에 비례한 세이브 포인트. 결정 후 spec `metroidvania-3d`를 갱신하고 봇·`reach3d`·세이브 호환(구 세이브 능력 플래그 기본값)을 함께 다룬다.
- [ ] 릴리스 정리: `?debug=1` 디버그 훅 배포 노출 여부 결정, 전투 쇼케이스 305 calls를 300 이하로, Meshy API 키 교체, `make release` zip의 `vite preview` 확인.

## 사용자 신규 요청 (다음 작업)

- [x] **Metroid-style special abilities**: add more ability gates beyond Thruster Boots (e.g. Morph-ball-like slide pass, Speed-boost-like dash run, Missile-style locks), with pickups and gated routes in `map3d.ts` and tests. Needs a design pass first.
- [x] **Tutorial mode**: stop showing every skill and control on screen. Teach moves one at a time in an optional tutorial mode and keep the HUD minimal.
- [x] **Transient DATA LOG text**: log and hint text should appear briefly when something is selected or picked up, then fade, and must not block gameplay (no modal, no input capture).
- [x] **Retro UI**: restyle the HUD in a more retro look (pixel font, CRT-style frames).
- [x] **Intro review**: the user found the intro busy. The opening is an intentional alarm set piece (red vent burst, caption lines) but it has not been judged against the "too hectic" note. Reduce overlapping effects and re-check.
- [ ] Bio-Labs draws 299 calls on fresh load (limit 300): trim kit instances or merge before adding more pieces.

## Abuse 레벨 관찰 후

- [ ] GUI 세션에서 `scripts/observe_levels.sh`(dummy 제거)로 레벨별 스크린샷·팔레트 관찰, 레벨 04 엔딩 화면 확인.
- [ ] [ABUSE_LEVEL_OBSERVATION](reference/ABUSE_LEVEL_OBSERVATION.md) 7절 다단계 설계안을 spec(`metroidvania-3d`)에 반영할지 결정.

## R14 병합 후

- [x] charlight, terrain, transit 병합(충돌 없음), `make check` 통과(649/649). 봇 Normal 4978/HP 126, Story 4880/142, Hard 5319/104(min 100). Playwright로 5개 쇼케이스 장면 콘솔 오류 0, 스크린샷 `docs/evidence/r14/`.
- [ ] G5 human playtest (unperformed). Judge three user notes by hand: room transition pace (42-tick walk-through, 150-tick entry grace, title card), terrain quality, and whether characters read as shapes and not only outlines.
- [ ] Enemy running feel in human play is still unverified (handled in R13, untouched in R14).
- [ ] (R16: smoke.ts updated, still not run) `make smoke-local` on real Chrome (agent sandbox cannot launch Chrome), including showcase recapture.
- [ ] `r14/*` branches and their worktrees are for the user to clean up.
- [ ] 푸시 대기: 사용자가 직접 실행.

## R13 병합 후

- [x] alive, combat, ux, reel 병합, 이동 모델 하나로 통합, 시뮬 문 앞 순간이동 수정, `make check` 통과(625/625). 봇 Normal 5208/HP 126, Story 5599/139, Hard 5094/114(min 100).
- [x] 라이브 샘플(Playwright MCP): 추격 크롤러·스토커의 프레임당 표시 이동 0.2 m 초과 0회(이전 27회·9회).
- [ ] 사람 플레이로 적 달리기 체감 확인(unverified). 남은 후보: 크롤러 리스폰 시 시체 위치에서 새 위치로 글라이드(최대 1.4 m)가 보이는지, 스토커 착지 직후 보폭.
- [ ] `tools/smoke/enemy-live.ts`와 `make smoke-local`을 실제 Chrome에서 실행(에이전트 샌드박스는 Chrome 실행 불가).
- [ ] 브라우저 디버그 경로 비결정성: `__reanimatorRunBot(1900)` 한 번과 `RunBot(1)` 1900번이 다른 월드를 만든다(프레임 루프의 HUD·관찰 경로가 상태를 건드리는 것으로 추정). 원인 미조사.
- [ ] `/private/tmp/r13-*` worktree와 `r13/*` 브랜치는 사용자가 정리.

## R12 병합 후

- [x] look, motion, onboard, robust 병합, `make check` 통과(568/568). 봇 Normal 5444/HP 140.
- [ ] 브라우저 확인(unverified): 추출 해치·픽업·레티클·섹터 그레이딩, 베스티어리 포즈(`__reanimatorShowcase('bestiary')`), 에어록 튜토리얼 조우 체감, 세이브 없는 패배 후 Resume, `make smoke-local`, 쇼케이스 재촬영.
- [ ] 리뷰 잔여: replan 레인 모호성(겹친 구역), 오래된 UiAudit continues no-op.
- [ ] `/private/tmp/r12-*` worktree와 `r12/*` 브랜치는 사용자가 정리.

## R9–R11 세션 마감 후 (남은 항목)

- [ ] **푸시 대기**: github.com DNS 실패로 `git push origin main`을 못 했다. 사용자가 직접 실행.
- [ ] G5 사람 플레이(감각, 난이도, 탐험 흐름)를 [EVALUATION.md](EVALUATION.md)에 기록.
- [ ] `make smoke-local`은 실제 Chrome에서 실행해야 한다(에이전트 샌드박스는 브라우저 실행 불가). 쇼케이스 재촬영 포함.
- [ ] 패리/Warden 카운터 창(8틱)의 체감은 플레이 검증 전(unverified).
- [ ] `3c8e7a0`의 헌터 외형 재확인, `__reanimatorAdvance` 재현 불가 건은 dev 서버 재시작 후 재확인.
- [ ] `/private/tmp`의 worktree·브랜치(`r8-*`, `r9/*`, `r10/*` 등)는 사용자가 정리(`git worktree list`, `git worktree remove`).
- [x] Abuse·Metroid 보강 방안은 R4_METROID_GAPS 이후 R9 Vault Nook, R10 Warden 카운터·스캔·Classic View로 구현. 남은 Metroid 후속은 R4_METROID_GAPS 참조.

## R10 병합 후

- [x] classic → opening → boss → hunter 병합, `make check` 통과(519/519). 충돌: `tests/audio.test.ts`(사운드 59), `scene3dFull.ts`(vignette와 hunter-alarm 둘 다 유지).
- [ ] 브라우저 확인(unverified): 오프닝 스킵·재진입, Classic 토글 전환, Warden 카운터 창과 hatch 슬로모, 헌터 pill의 Classic 모습, 쇼케이스 재촬영, `make smoke-local`.

## R10 Hunter 후

- [x] Reclaimer 구역, 봇 카운터·구역 이탈 경로, 테스트 33개, `make check` 통과(493/493). 상세와 unverified 목록은 [R10_HUNTER](R10_HUNTER.md).
- [ ] 브라우저 확인(unverified): 리그 틴트·바이저 막대·게이트 막대 모양, HUNTER ZONE pill과 소음 막대, 스팅·포효 음, Ctrl/Alt 살금걸음(OS 단축키 충돌 여부), 카운터 8틱 창의 체감, 160 HP에서 구역 공정성.
- [ ] 게임패드 아날로그 살금걸음 연결. Hard 봇이 Warden 구간 타이밍에 민감함(R8과 같은 성질)이므로 봇 경로를 바꿀 때 세 난이도를 함께 재측정(`node tools/game/hunter.ts`).

## R9 병합 후

- [x] fix → world → abuse → parry 병합, `make check` 통과(459/459).
- [ ] 브라우저 확인(unverified): X/C 카운터 타이밍과 흰 점멸, Z 스캔 윤곽(기댐 벽 amber), 보안 데크 Vault Nook 기댐 열림, 픽업 자석, 섹터 소품, 사망 화면 `C` Resume, `__reanimatorUiAudit()`, 콘솔 오류 0.
- [ ] 쇼케이스 재촬영과 `make smoke-local`. 카운터 입력 배정(X/C)에 대한 G5 관찰.

## R8 병합 후

- [x] leak → assist → lore → lab 병합, `make check` 통과(427/427).
- [ ] 브라우저 확인: 새 Lab(카드, 재생, 첫 불일치, 히트맵, Demo mutation), 설정 난이도·보조 패널과 일시정지 패널, 사망 원인 표시, 로그 리더·아카이브, 엔딩 3단과 크레딧 롤, `await __reanimatorSoak(3, {trace:true})`, `__reanimatorUiAudit()`, 콘솔 오류 0.
- [ ] `lab.png` 재촬영(새 Lab UI)과 `make smoke-local`. 봇 완주 재측정.
- [ ] 난이도 Story가 처음 플레이하는 심사위원에게 맞는지 G5 관찰.

## R7 병합 후

- [x] soak → ui → cam → vista 병합, `make check` 통과(STATUS 기준선).
- [ ] 브라우저 확인: `await __reanimatorUiAudit()` ok, `await __reanimatorSoak(3, {showcase:false})` leaks 빈 배열, 6섹터 원경 육안, 카메라 구도(룸 경계, 보스 프레이밍), 콘솔 오류 0(unverified).
- [ ] `lab.png` 재촬영(R7-UI 수정 후)과 `make smoke-local`.
- [ ] 봇 완주 재측정(원경·카메라 변경 후).

## R6 병합 후

- [x] arms → fix → sound → demo 병합, `make check` 통과(STATUS 기준선).
- [ ] 브라우저 확인: 키 5·6과 wpn-5/6 칩, 화염·로켓 렌더, 로켓 점프, 데모 투어 11곳과 쇼케이스 재생, 팡파르·근접 루프 청취(unverified, 귀로 확인 필요), 콘솔 오류 0.
- [ ] 쇼케이스 PNG 재촬영(`tools/smoke/capture-showcase.ts`)과 `make smoke-local`.
- [ ] 병합 후 봇 완주 재측정.

## R5 병합 후 (오케스트레이터)

- [x] metroid → render → rig → vfx 병합, `make check` 통과(STATUS 기준선).
- [ ] 브라우저 확인(진행 중): 적 리깅·LOD, Crawl Slide·파괴 블록·맵 단말·탈출 해치, 메시 병합 후 drawCalls, 증기 시트, 보스 카메라, 피격 플래시·투사체 글로우·색수차, 콘솔 오류 0.
- [ ] `biolabs.png`, `boss.png` 재촬영 후 커밋. `combat.png`, `lab.png` 추가.
- [ ] 병합 후 봇 완주(`__reanimatorRunBot`) 재측정.
- [ ] Metroid 후속(벽 점프 보강, 패리, 스캔)은 [R4_METROID_GAPS](plans/R4_METROID_GAPS.md) 참조.

## R4 병합 후 (오케스트레이터)

- [x] 트랙 A·B·C·D 병합, `make check` 통과(STATUS 기준선).
- [ ] 브라우저 확인: hazards3d(크러셔 등 MeshStandardMaterial)가 Classic View(`V`)에서 팔레트·디더와 어울리는지, 영웅 포즈·무기 모델, 폭발·보스 셰이더, 콘솔 오류 0.
- [x] 적 애니메이션 리깅(R5-Rig), Metroid 보강 일부(R5-Metroid). Abuse 느낌 강화 후속은 남음.
- [ ] 쇼케이스 PNG 중 `combat.png`, `lab.png` 미저장(README 갤러리가 참조).
- [ ] Credits 패널 브라우저 확인: Title > Extras > Credits, `Esc`와 Back이 Extras로 돌아오는지, 키보드 포커스.

## 브라우저 확인 (R3까지 누적, unverified 항목)

- [ ] Classic View(`V`)에서 mood 조명·고어·hive·dropper 렌더, 설정 패널(View/CRT/Gore/Reduce flashing/볼륨).
- [ ] 타이틀 메뉴(Play/Continue/Settings/Extras), 어트랙트 6컷, 보스 인트로·텔레그래프.
- [ ] 절차: `__reanimatorAdvance([], {x,y,boots:true,openDoors:[...]})`, `__reanimatorRunBot(maxTicks)`, `__reanimator()`의 `drawCalls`·`triangles`·`enemyRender`, 콘솔 오류 0.

## 사용자 확인 필요

- `git push origin main` 승인(로컬 커밋만 존재).
- G5: `npm run dev`로 직접 플레이해 감각·난이도·탐험 흐름을 [EVALUATION.md](EVALUATION.md)에 기록. 관찰 후보: 부츠 필수 구간 체감, 보스 3페이즈 난이도, Classic View 가독성.
- 원본 Abuse 느낌 강화 요청(2026-11-15 사용자 메시지): R3 Classic View·조명·고어가 첫 대응이며 추가 라운드에서 앰버 팔레트·메뉴·사운드 톤을 더 맞출지 결정 필요.

## 이월

- Chrome 가능한 환경에서 `make smoke-local`, `node tools/smoke/capture-showcase.ts` 재실행.
- Kiro 내 REA MCP 연결(`.kiro/settings/mcp.json` 쓰기 차단).
