# STATUS 이전 기록 (R8–R14 기준선, R10–R12 세부)

2026-11-16 R18 정리에서 STATUS.md에서 이동. 삭제 없음.

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
