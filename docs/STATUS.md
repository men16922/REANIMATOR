# 현재 상태

최종 갱신: 2026-11-15 · Wave 2–3 완료 + 렌더 보정(`e15e9a0`, `d13ea1e`), 로컬 커밋 3개 미푸시

## 구현 상태

- 시뮬레이션 `src/game3d/world3d.ts`: XY 레인(z=0) 60 Hz 결정적 시뮬. 잠금 6종 판정표 `DOOR_REQUIRED_WEAPON`, 불일치 시 상태 불변 + 힌트, Grenade 폭발로 yellow 개방, red는 콘솔 필요, escape는 Meltdown 후 개방. 업그레이드(`thruster_boots`, `energy_tank`: `maxHp = 100 + 30 * tanks`), Save 스테이션(`lastSaveId`, `respawnPlayer3D`), 섹터 추적(`currentRoom`, `visitedRooms`), `getPlayerPose3D`.
- 봇 `bot3d.ts`(`createBot3D`) + 조향 `nav3d.ts`: 6섹터 능력 게이트 순서로 완주(3377 ticks, HP 160).
- 렌더러 `scene3dFull.ts`: 사이드뷰 원근 카메라, z=0 평면 마우스 레이캐스트, 틱 보간, 색상 잠금 실드, Save/Upgrade 비주얼, 보스 충격파 양방향 파동. `fallback2d.ts`: XY 투영 폴백. `main.ts`: A/D, W/Space, S(dropDown), Tab 미니맵, 디버그 훅 `__reanimator{,Advance,Step,RunBot}`.
- 도달성 `tools/game/reach3d.ts`: 52 waypoint 3369 ticks, Shaft 4.4 m 게이트와 Bio-Labs→Security 4.4 m 게이트(부츠 없음=도달 불가, 있음=가능). 3431 ticks.

## 검증 기준선 (이번 세션 관찰)

- `make check` exit 0: `tsc`, `node --test tests/` 44/44(`game3d` 14), `reference-verify` 3/3, `reach`+`reach3d` PASS, build, dist-guard PASS(12 files 14,329,300 B / 218).
- `make reference-holdout` 4/4 PASS(이 엔진 리비전 1회, 봉인 엔진 무변경).
- `make smoke-local` 29/29 PASS(`webgl-3d`, `loadedModels: 9`, `fps: 60.5`, 페이지 오류 0).
- `capture-showcase.ts` PNG 11장(`docs/evidence/g4_playable/`) 육안 검수: 사이드뷰 카메라, 양손 IK 조준, 점프 상승/하강, 보스·미니맵 HUD 비겹침 확인.

## 진입점

- [진행 기록](PROGRESS_LOG.md) · [다음 작업](NEXT_PLAN.md) · [Kiro 활용](KIRO_USAGE.md) · [Kiro 인계서](plans/KIRO_METROIDVANIA_HANDOFF.md)
- spec: `.kiro/specs/metroidvania-3d/` · steering: `.kiro/steering/reanimator.md`
- [평가](EVALUATION.md) · [도구](evidence/TOOLCHAIN.md) · [판정 계약](reference/VERIFICATION_CONTRACT.md)

## 미확인·위험

- 사람 플레이(G5) 미실시. 봇은 HP를 거의 잃지 않아 난이도 판단 근거가 못 된다.
- 부츠 우회 제거: `bio-grate-up`을 y 4.4로 낮춰 Security 데크도 4.4 m 게이트(`reach3d`·테스트로 확인). 제트 대시 우회는 미검사.
- `make smoke-local`은 이 샌드박스에서 Chrome이 abort(exit 134, `--no-sandbox`도 동일)해 최신 맵 기준 unverified. 위 29/29는 맵 변경 전 값.
- 움직임 자연스러움(방향 전환·점프 포즈·머리 회전 수정)은 정지 캡처로만 확인, 사람 눈 확인 필요. 어두운 샤프트는 보조 조명으로 완화했으나 튜닝 여지 있음. 15 Hz는 설계값. `.kiro/settings/mcp.json` REA MCP 쓰기 차단 잔여.
