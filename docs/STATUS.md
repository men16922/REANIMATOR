# 현재 상태

최종 갱신: 2026-11-14 · G0–G4 복원 완료 + Full 3D Quarter-View 체크포인트

## 기준선 (관찰된 실행 결과)

- 대상: Abuse DOS Shareware 1.05(`ABUSE.EXE` sha256 `8ba92587…1074f`). 사용자 옵션 A(역공학 금지 인지) 유지.
- 복원 엔진: `src/engine/motion.ts`(15 Hz 설계값) 무수정. S1·S2·S3 + sealed holdout M05 11개 필드 exact 일치(`4/4 PASS`). `#lab`(Restoration Lab)이 비교를 보여 준다.
- 3D 게임(신규 설계): 60 Hz `src/game3d/`(`world3d.ts`, `map3d.ts`, `bot3d.ts`), `src/engine/motion3d.ts`, WebGL2 Three.js `src/render3d/`(`scene3dFull.ts`, `riggedModels.ts`). 4구역, 무기 4종, 보스 Core Warden, Meltdown 탈출. 2D/2.5D 경로 `src/game/`, `src/render/`는 복원 테스트용으로 보존.
- 자산: Meshy 7.1 9종, schema `reanimator-meshy-assets-v2`(`reference/manifests/meshy-assets.json`), `public/assets/models/*.glb`. 리깅 3종(operative·warden·bio-stalker, 66 joints)과 정적 6종. Meshy 크레딧 718.
- 검증:
  - `make check` exit 0: `tsc` ok, `node --test tests/` 35/35(`game`, `game3d`, `reference`), `reference-verify` 3/3, `reach` PASS, `reach3d` 10 waypoint 573 ticks / 9.6 s, `dist-guard` `{"status":"PASS","files":12,"bytes":14304572,"checkedAgainst":218,"problems":[]}`
  - `make reference-holdout` 4/4 PASS(S1·S2·S3·M05)
  - `make smoke-local` exit 0, 22/22 PASS(`webgl-3d`, `loadedModels: 9`, `failedModels: []`, `riggedCount: 8`, `fps: 60.5`, 페이지 오류 없음)
  - `node tools/smoke/capture-showcase.ts`: `docs/evidence/g4_playable/` PNG 6장(`01_title_3d.png`…`06_restoration_lab.png`), 육안 검수

## 진입점

- [평가 기록](EVALUATION.md) · [Meshy 계획](plans/MESHY_PLAYABLE_UPGRADE_PLAN.md) · [동작 지도](reconstruction/BEHAVIOR_MAP.md) · [완료 요약](COMPLETED_SUMMARY.md)
- [G1](evidence/G1_REPORT.md) · [G2](evidence/G2_REPORT.md) · [G3](evidence/G3_REPORT.md) · [G4](evidence/G4_REPORT.md) · [도구](evidence/TOOLCHAIN.md) · [자산·권리](reference/ASSET_REGISTER.md) · [판정 계약](reference/VERIFICATION_CONTRACT.md)
- spec: `.kiro/specs/full-3d-quarter-view/`

## 미확인·위험

- 사람 플레이 없음: 난이도·재미·사람 플레이 시간은 G5 관찰 필요. 봇 완주는 결정적 입력 기준.
- 복원 범위는 `src/engine/motion.ts` 이동 물리뿐(평지·좌벽·천장·중력·점프·착지). 원본 사격 관찰 C01 NOT RUN. 3D 슈터·무기·적·맵·음향은 `new-design`.
- 15 Hz는 설계값(원본 tick 미측정). 스모크·쇼케이스는 headless Chrome + request routing 기반.
- `.kiro/settings/mcp.json` REA MCP 쓰기 권한 차단 잔여.
