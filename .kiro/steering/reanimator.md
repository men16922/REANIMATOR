---
inclusion: always
---

# REANIMATOR 현재 작업

시작 시 `docs/AGENT_BRIEF.md`(NEXT SESSION) → `docs/STATUS.md` → `docs/NEXT_PLAN.md` 순으로 읽는다.
이 파일은 Codex 인계 지침을 현재 상태에 맞게 갱신한 것이며 Kiro 실사용 증거가 아니다. Kiro가 실제 수행한 내용만 `docs/KIRO_USAGE.md`에 기록한다.

## 방향 전환: Full 3D Side-View Metroidvania (Metroid Dread × Abuse)

- 활성 spec: `.kiro/specs/metroidvania-3d/`(`requirements.md`, `design.md`, `tasks.md`). 전면 인계 가이드는 `docs/plans/KIRO_METROIDVANIA_HANDOFF.md`. 타입 계약은 `src/game3d/types3d.ts`(`SectorId3D` 6종, `DoorLockKind3D` 6종, `UpgradePickupKind3D`, `PlayerPoseState3D`).
- 6개 섹터(`map3d.ts` Wave 1 완료): Cryo Airlock, Central Transit Shaft, Sunken Mines, Bio-Labs, Upper Security Deck, Core Vault.
- 잠금 문: blue=Pulse, green=Scattergun, yellow=Grenade(Cracked Bio-Wall), red=Rail+Security Console, escape(Meltdown 후).
- 능력 게이트: `mines`의 Thruster Boots(공중 점프)가 Central Shaft 상부 4.4 m를 연다. Energy Tank(`mines`, `biolabs`)는 최대 HP +30. Save/Recharge 스테이션(`mines`, `security`).
- 렌더/HUD/시뮬: Wave 2 완료. `world3d.ts`(6잠금·업그레이드·세이브·`getPlayerPose3D`), `nav3d.ts`+`bot3d.ts`(상태형 봇 `createBot3D`), `scene3dFull.ts`(사이드뷰 카메라·z=0 레이캐스트·보간·pose 연결), `fallback2d.ts`, `main.ts`, `reach3d.ts`, `tests/game3d.test.ts`, `smoke.ts`, `capture-showcase.ts` 전환 완료.
- 아래 "Quarter-View" 설명과 `.kiro/specs/full-3d-quarter-view/`는 이전 설계(보존용)다. 신규 작업은 `metroidvania-3d` spec을 따른다.

## 현재 아키텍처 (G0–G4 복원 완료 + Full 3D Quarter-View)

- **Restoration (G0–G2)**: 대상은 Abuse DOS 셰어웨어 1.05. 이동 물리 복원 `src/engine/motion.ts`(15 Hz 설계값)가 S1·S2·S3 + sealed holdout M05에서 11개 필드 exact 일치. 브라우저 `#lab`(Restoration Lab)이 원본 로그와 엔진 재생을 나란히 보여 준다.
- **2D/2.5D 슬라이스 (G3–G4)**: `src/game/`, `src/render/`. 복원 테스트가 이 경로를 참조하므로 보존한다.
- **Full 3D Quarter-View 트윈스틱 슈터 (신규 설계)**: 60 Hz 시뮬레이션 `src/game3d/`(`world3d.ts`, `map3d.ts`, `bot3d.ts`), 이동 `src/engine/motion3d.ts`, WebGL2 Three.js 렌더러 `src/render3d/`(`scene3dFull.ts`, `riggedModels.ts`). 4구역, 무기 4종, 보스 Core Warden, Meltdown 탈출.
- **자산**: Meshy 7.1 9종, schema `reanimator-meshy-assets-v2`(`reference/manifests/meshy-assets.json`), `public/assets/models/*.glb`. 상세 `docs/reference/ASSET_REGISTER.md`.
- **spec**: `.kiro/specs/full-3d-quarter-view/`(`requirements.md`, `design.md`, `tasks.md`). 복원 spec은 `.kiro/specs/abuse-reference/`, `restored-motion/`, `reanimated-slice/`.
- **R3.3**: 헤드램프 `w.light`는 HUD·렌더러 전용이다. 이동·전투·픽업·문·저장·위험 지형·적 로직에서 읽지 않는다. `tests/game3d.test.ts`가 확인한다. 사이드뷰 전환 후에도 유지한다.

## 마지막 관찰된 검증

- `make check` exit 0: `tsc` 통과, `node --test tests/` 35/35(`game`, `game3d`, `reference`), `reference-verify` 3/3 PASS(S1·S2·S3), `reach` PASS, `reach3d` 10 waypoint 573 tick(9.6 s), `dist-guard` PASS(12 files, 14,304,572 B, 218 대조).
- `make reference-holdout`: 4/4 PASS(S1·S2·S3·M05).
- `make smoke-local`: 22/22 PASS, `rendererMode: "webgl-3d"`, `loadedModels: 9`, `failedModels: []`, `riggedCount: 8`, `fps: 60.5`, 페이지 오류 없음.
- `node tools/smoke/capture-showcase.ts`: `docs/evidence/g4_playable/` PNG 6장 생성·육안 검수.
- 미실시: G5 사람 플레이 관찰, Kiro 내 REA MCP 연결(`.kiro/settings/mcp.json` 쓰기 차단 잔여).

## 봉인 파일 (수정 금지)

- `src/engine/motion.ts`, `src/engine/collider.ts`, `src/game/{light,map,world}.ts`, `tools/game/reach.ts`, `tests/{game,reference}.test.ts`, `reference/{fixtures,holdout}/**`.
- 신규 3D 이동은 `src/engine/motion3d.ts`에만 둔다(new-design).
- expected를 새 엔진에서 만들지 않는다. 판정은 `docs/reference/VERIFICATION_CONTRACT.md`를 따른다.
- `make reference-holdout`은 엔진 리비전당 1회, 결과로 엔진을 튜닝하지 않는다.
- 15 Hz는 설계값이며 원본 틱은 미측정이다. 복원 범위는 이동 물리뿐이고 3D 슈터는 원본 복원이 아니다.
- 소스 포팅·현대 포트·stub 분석으로 원본 역공학을 대체하지 않는다. 바이너리 분석·Lisp/소스 대조·관찰·추론·신규 설계를 별도로 기록한다.

## 작업 규칙

- 변경 후 `make check`를 통과시킨다. 실행하지 않은 검증은 "unverified"로 적는다.
- `dist/`에 원본 EXE·데이터·캡처가 들어가면 안 된다(`tools/release/check-dist.ts`).
- REA 실행점은 `scripts/rea.sh`, 도구 상태는 `docs/evidence/TOOLCHAIN.md`.
- 기존 BLACKOUT/REA 작업 트리와 전역 설정을 보존한다. 푸시·배포·제출은 사용자 지시 범위에서만 수행한다.
- Wumpus 계획과 Carbon 리뷰는 과거 이력이다. 상세 계획 `docs/plans/REANIMATOR_PLAN.md`, 실행 순서 `REANIMATOR_KIRO_EXECUTION_SPEC.md`.
