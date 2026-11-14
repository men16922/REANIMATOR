# REANIMATOR 재개 안내

▶ NEXT SESSION: 사용자 확인 후 `git push origin main`(미푸시), 이어서 G5 사람 플레이(`npm run dev`) 관찰을 [EVALUATION.md](EVALUATION.md)에 기록. 새 기능은 `.kiro/specs/metroidvania-3d/`를 따른다.

2026-11-15 · Full 3D Side-View Metroidvania Wave 2–3 완료 (Kiro)

- 구현: 6섹터 맵, 잠금 문 6종(blue=Pulse, green=Scattergun, yellow=Grenade 폭발, red=Rail+콘솔, escape=Meltdown), Thruster Boots 2단 점프(Shaft·Bio-Labs→Security 4.4 m 게이트 2곳), Energy Tank ×2(+30 HP), Save 스테이션·체크포인트 복귀, 섹터 미니맵, 사이드뷰 z=0 렌더러(120 Hz 보간, 양손 IK·점프 스크럽·백페달 연결), 상태형 봇 완주.
- 검증(관찰): `make check` exit 0(44/44, `reach3d` 52 waypoints 3369 ticks + 부츠 게이트, dist-guard PASS), `make reference-holdout` 4/4, `make smoke-local` 29/29(`webgl-3d`, 60.5 fps), 쇼케이스 PNG 11장 육안 검수, 봇 완주 3377 ticks(56 s) won.
- 봉인 파일(수정 금지): `src/engine/{motion,collider}.ts`, `src/game/{light,map,world}.ts`, `tools/game/reach.ts`, `tests/{game,reference}.test.ts`, `reference/{fixtures,holdout}/**`. 이번 작업에서 무변경 확인.
- R3.3: 헤드램프 `w.light`는 HUD·렌더러 전용(`tests/game3d.test.ts`가 정적·동적으로 확인).

읽는 순서: [상태](STATUS.md) → [다음 작업](NEXT_PLAN.md) → [진행 기록](PROGRESS_LOG.md) → [Kiro 인계서](plans/KIRO_METROIDVANIA_HANDOFF.md)(이력).

기존 BLACKOUT/REA 트리와 전역 설정은 보존한다.
