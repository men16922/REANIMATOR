# 다음 작업

이전 계획 전문: [archive/NEXT_PLAN_through_R3.md](archive/NEXT_PLAN_through_R3.md)(재귀 개선 1~3차, 몬스터·지형, R1~R3 후속 체크리스트 포함).

## 제출 준비 (마감 2026-12-04 14:00 PT)

- [ ] (사용자) Devpost Rules 탭에서 필수 제출물·카테고리(Resurrection 후보)·영상 제한 확인.
- [ ] (사용자) Meshy API 키 재발급·기존 키 폐기, 그다음 푸시와 저장소 공개 여부 확인.
- [ ] (사용자) 데모 영상 녹화(트레일러 릴 `?debug=1` 활용), Devpost 양식 작성.
- [ ] (사용자) 배포 URL에서 처음부터 끝까지 사람 플레이, 막힌 곳 기록.
- [ ] `docs/KIRO_USAGE.md`를 Kiro 실사용만 남기도록 점검, README 첫 화면에 라이브 URL·영상 링크 정리, 영상 대본.
- [ ] 선택: AWS Budgets 월 $5 알림(이메일 필요), 모바일·타 브라우저 확인.

## R26 이후

- [x] 흑화면 Bio-Labs 조사(재현 불가, HMR 의심만 확인), Stage 2/3 컬러 그레이딩·유리 반사 틴트, HUD 섹터명 누출 수정, `make check` 766/766.
- [x] `make smoke-local` 30/30 PASS(R27: 낡은 스모크 스크립트 3곳 수정).
- [ ] 흑화면 근본원인 확정(HMR 가설 미검증), G5 사람 플레이.
- [ ] R25에서 별도 위임된 지형 지오메트리 폴리시(chamfered batches·back-lane clutter) 재검증 — 이번 라운드는 색/HUD만 다룸.

## R25 이후

- [x] Stage 2/3 전용 위/옆 텍스처, 하자드 트림, 그레이팅(R25).
- [ ] Meshy 추가 후보: 바닥 균열·그을음 데칼, Stage 1 전용 벽면 변주, 트림용 노란색 약한 변형.

## R24 이후

- [x] 지형 텍스처 적용·배경 진정(R24).
- [ ] Meshy 추가 후보: 플랫폼 가장자리 트림 스트립, Stage 2/3 전용 벽 텍스처(현재 한 장을 위·옆 면에 공유), 타일링 그레이팅, 바닥 균열 데칼.
- [ ] Unverified: `make smoke-local`, 사람 플레이, Reduce motion 육안.

## R22 이후

- [x] Frost 에셋 3종과 실행 기록(R22 완료).
- [ ] Unverified: `make smoke-local`, 오디오 청감, Stage 2·3 사람 플레이, 릴리스 zip `vite preview`.

## R21 이후

- [ ] `make smoke-local`을 Chrome이 뜨는 환경에서 실행(샌드박스 NOT RUN).
- [ ] 사람 플레이: Stage 3 Cryo Bulwark 난이도(봇은 방패를 2회만 맞힘), 스테이지별 음악 청감.
- [ ] Meshy 신규 자산 후보(프롬프트는 R21 보고 참조): Bulwark 전용 방패 메시, Stage 3 냉각 파이프 킷.
- [ ] Meshy API 키 교체, 푸시(사용자 지시 대기).

## R20 Foreman 메시·릴·폴리시 (완료)

- [x] Foreman Meshy 메시, 릴 Stage 2/3 컷, combat 컷 287 calls(≤300), 보스 이름 카드, Foreman 음성·피격 fx, 증기 분출 흔들림. 봇 핀 불변.
- [x] Stage 2 Furnace Gate 코치 문구 스테이지별(R21).
- [x] Foreman 흰 실루엣(R21: 패리 플래시 원인, 수정).
- [ ] Unverified: `make smoke-local`, `make release` + `vite preview`, 시네마틱 SPIRE WARDEN 카드 육안, Stage 2·3 사람 플레이, Meshy 키 교체, 푸시.

## R19 트레일러 릴 (완료)

- [x] 쇼케이스 릴 8컷(60 s) → 12컷(90 s). `ShowCut.stage`로 월드 교체형 컷(Stage 2 Foundry Line·Slag Foreman, Stage 3 Reactor Spire·Spire Warden). 사용자 노출 문구에서 Judge 제거("Trailer Reel"). Foreman maxHp 정확 테스트, 이름 상수 `FOREMAN_NAME` 통일, castShadow 히스테리시스(1.5 m). Stage 1 봇 핀 불변.
- [ ] Unverified: `make smoke-local`, Stage 2·3 사람 플레이, 디버그 Trailer reel(`reelPlayer.ts`) 컷에는 Stage 2·3 없음(Stage 1 스크립트).

## R18 (완료 항목과 남은 것)

- [x] Stage 2·3 브라우저 검증, draw calls < 300, Foreman 미니보스, 봇 테스트, README 스크린샷, 문서 정리.
- [ ] Unverified: Stage 2·3 사람 플레이 밸런스, `make smoke-local`, `make release` + `vite preview`, 릴 컷에 Stage 2·3 장면 추가(월드 교체형 컷 필요), Meshy API 키 교체, 푸시(사용자 지시 대기).

## R17 다단계 스테이지 (안 B 채택, 로컬 커밋 aa8d19a·4a6e74a)

- [x] Stage 2 Foundry Line, Stage 3 Reactor Spire, 스테이지 선택·클리어 화면·진행 저장·디버그 훅 빌드 플래그. `make check` exit 0(695/695). 봇 핀 Stage 1 불변. Playwright: 타이틀 STAGES 패널 확인, 콘솔 오류 0.
- [ ] 미검증: Stage 2·3 렌더/전투 밸런스(봇 완주 없음, reach만), 클리어 화면 육안, 전투 쇼케이스 305 calls, `make release`.

## (이전) 사용자 결정 대기: 다단계 스테이지 확장

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

R4–R11 병합 후 항목, 브라우저 확인 누적, 사용자 확인, 이월: [archive/NEXT_PLAN_R4_R11.md](archive/NEXT_PLAN_R4_R11.md).

## R21 (partial)
- Done: Stage 2/3 coach chip fix (src/ui/flow.ts), Foreman heat tone-down (scene3dFull.ts), test in tests/r20-polish.test.ts. make check exit 0, 726/726.
- Unverified: Foreman strike visual, Spire Warden card visual, r19 black squares, smoke-local, release.
- R23 FEAT-003: 브라우저에서 `__reanimatorShowEnding()`으로 REANIMATED 카드 확인(unverified).
