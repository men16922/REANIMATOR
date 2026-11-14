# 완료 요약

## 2026-11-14 — Meshy 7.1 + Three.js 2.5D Playable 고도화 (Antigravity)

- **Meshy 7.1 3D 자산 파이프라인** 6개 다크 바이오메카닉 `.glb`(`operative`, `warden`, `crawler`, `spitter`, `power-core`, `exit-gate`) 생성·다운로드·Meshopt/WebP(512px, `< 1.3 MB`) 최적화 및 4면 시각 검수 완료(`public/assets/models/*.glb`, `reference/manifests/meshy-assets.json`).
- **4섹터 액션 루프 & 듀얼 화기** `140×36` 타일 맵(`src/game/map.ts`), 주사격(Pulse) + 관통 과충전 레일슬러그(`altFire`, 경직 스태거), 적 3종(`Skitter-Husk`, `Spore-Sentinel`, 보스 `Core Warden`), `MedStation`, `H` 바이오슬러지, 코어 회수 후 `Lockdown` 탈출 웨이브 구현(`src/game/world.ts`). 원본 `src/engine/motion.ts`와 `R3.3` 조명 격리 불변식 보존.
- **2.5D WebGL2 & WebAudio** Three.js `0.187.0` 5-light 물리 조명(`SpotLight` 헤드램프, 볼류메트릭 콘, 360° 레이저 조준, 입자 버스트, 보스/섹터 HUD, Canvas2D 폴백) 및 절차 음향 확장(`src/render/{scene3d,models}.ts`, `src/ui/{main,audio}.ts`).
- **검증·시각 검수** `make check` exit `0`(테스트 `30/30`), `make reference-holdout` `4/4 PASS`, `playthrough.ts` 완주(`747` ticks, `hp: 100`), `make smoke-local` `19/19 PASS` (`60.5 fps`), `check-dist.ts` `9 files / 5,171,090 B`, `capture-showcase.ts` 보스전 포함 `docs/evidence/g4_playable/` 6종 캡처 검수 완료. → `docs/plans/MESHY_PLAYABLE_UPGRADE_PLAN.md`

## 2026-11-14 — G0–G4 (Kiro, 사용자 지시 옵션 A)

- **G0** 원본 `abuse-box.zip`(Shareware 1.05 표기, 재포장) 취득·해시·manifest·자산 등록부. DOSBox Staging 0.83.0으로 원본 실행. LICENSE.TXT 역공학 금지 조항 → 사용자 A 지시. → `docs/evidence/G0_REPORT.md`
- **G1** `ABUSE.EXE` = MZ stub + DOS/4GW + LE. LE→ELF 변환(`scripts/le2elf.py`) 후 REA+Ghidra 12.2로 1,544 함수. 이동 경로 0xc8ff4 → 0x14760 → 0x3a1d8 → 0x38704 → 0x37e82 → 0x558e5. Lisp 하네스로 결정적 replay(3회 바이트 동일). → `docs/evidence/G1_REPORT.md`, `docs/reconstruction/BEHAVIOR_MAP.md`
- **G2** 순수 TS 엔진(`src/engine/motion.ts`)·비교기·`make check`. 개발 시나리오 3개와 holdout M05가 11개 필드 정확 일치. 첫 holdout M04 FAIL 기록 보존. → `docs/evidence/G2_REPORT.md`
- **G3** 브라우저 게임(이동 복원, 나머지 new-design). 원본 사격 관찰 C01 NOT RUN. → `docs/evidence/G3_REPORT.md`
- **G4** 맵 3구간·탈출 웨이브, 합성 음향·음량, Restoration Lab, 성능, dist 원본 혼입 가드. `make check` exit 0, `make smoke-local` 16/16. → `docs/evidence/G4_REPORT.md`, `docs/EVALUATION.md`

사람 플레이 관찰·재미·실제 플레이 시간·Kiro 내 MCP 연결·hook 실트리거·공개·제출은 완료 항목이 아니다.

## 2026-11-14 — Abuse 계획 v3와 도구 준비 (Codex)

- 단계·수용 조건·Kiro 실행 프롬프트·검증 계약 작성. REA 6.9.0 + Node 26.13.1 프로젝트 설치.

## 이전 계획 이력

- Wumpus v2.1 기획과 Gemini 4 Carbon 독립 리뷰 1회. Abuse v3를 검토한 결과가 아니다.
