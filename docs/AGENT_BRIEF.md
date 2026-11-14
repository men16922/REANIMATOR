# REANIMATOR 재개 안내

▶ NEXT SESSION: `docs/NEXT_PLAN.md`의 사람 플레이 관찰(G5)·`npm run dev` 직접 플레이 및 G6 제출 지시를 확인한다. 기계 게이트(`make check`·`make reference-holdout`·`make smoke-local`·`capture-showcase.ts`)는 통과 완료.

2026-11-14 · G0–G4 복원 완료 + Full 3D Quarter-View 트윈스틱 슈터 체크포인트

- 대상: Abuse DOS Shareware 1.05(`ABUSE.EXE` sha256 `8ba92587…1074f`) 이동 물리 복원 + 신규 3D 슈터.
- 복원: `src/engine/motion.ts`(15 Hz 설계값)가 S1·S2·S3 + sealed holdout M05에서 11필드 exact 일치. 브라우저 `#lab`에서 로그와 재생 비교.
- 제품: 60 Hz `src/game3d/`, WebGL2 Three.js `src/render3d/`, 4구역·무기 4종·보스 Core Warden·Meltdown 탈출. Meshy 7.1 9종(schema `reanimator-meshy-assets-v2`, `public/assets/models/*.glb`), Meshy 크레딧 718 남음.
- 관찰: `make check` exit 0(35/35, `reach3d` 10 waypoint 573 ticks, `dist-guard` 12 files 14,304,572 B / 218), holdout 4/4, smoke 22/22(`webgl-3d`, `loadedModels: 9`, `60.5 fps`). 사람 플레이(G5) 미실시.
- 봉인(수정 금지): `src/engine/motion.ts`, `src/engine/collider.ts`, `src/game/{light,map,world}.ts`, `tools/game/reach.ts`, `tests/{game,reference}.test.ts`, `reference/{fixtures,holdout}/**`. 상세 `.kiro/steering/reanimator.md`.
- spec: `.kiro/specs/full-3d-quarter-view/`. 제약: Kiro 내 REA MCP `.kiro/settings/mcp.json` 쓰기 차단 잔여.

읽는 순서: [상태](STATUS.md) → [다음 작업](NEXT_PLAN.md) → [평가](EVALUATION.md) → [Meshy 계획](plans/MESHY_PLAYABLE_UPGRADE_PLAN.md).

기존 BLACKOUT/REA 트리와 전역 설정은 보존한다. Wumpus 계획·Carbon 리뷰는 과거 이력이다.
