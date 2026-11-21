# 완료 요약

## 2026-11-22 — Kiroween 2026 제출·잔여 검증·Bonus Blog Prize 완료

- **코드·검증·배포(`cb6ceb4`):** `make check` 768/768 (`dist-guard` 56 files, `20,780,733 B`), `make reference-holdout` 4/4, `make smoke-local` 30/30 (`60.5 fps`), `make release` (`12,263,180 B`), CloudFront 라이브(`https://dlr55kf9v2hn7.cloudfront.net`, MD5 `0201384cec3e462eed79d3dbc74f692a`), Chrome/Edge/모바일 `390×844` 오류 0, YouTube 1080p 트레일러(`https://youtu.be/TvyT1M4yLzY`), 병합 브랜치 54개 정리.
- **Devpost & Bonus Blog Prize:** `https://devpost.com/software/reanimator` (`Resurrection`, `SUBMITTED`) 제출 후 포트폴리오 한영 아티클 발행(`men16922.github.io` `4c3002f`, EN `https://men16922.github.io/articles/reanimator`, KO `https://men16922.github.io/kr/articles/reanimator`) 및 Devpost `Additional info` Bonus Blog Prize(`108257` / `Blog Prize`) 등록·영속성 확인 완료.

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

## 2026-11-16 — R15 Meshy 터레인, R16 릴리스 1.0.0, Abuse 레벨 관찰

- **R15** Meshy MCP로 터레인 킷 11종(t2.5 smart-topology, 4k tris, PBR, 165 credits) 생성·인제스트·등록, `terrainKit.ts` 인스턴싱과 절차 폴백. 6섹터 draw calls 148-299. → `docs/archive/rounds/R15_MESHY_TERRAIN.md`, `docs/evidence/r15_meshy_terrain/`
- **R16** DATA LOG 토스트, 레트로 UI, 차분한 인트로, Meshy 노멀 수정, 능력 3종(Blast Core, Scan Lens, Thermal Plating)과 캐시, 튜토리얼 모드, 릴리스 1.0.0 패키징. `make check` exit 0(672/672, dist-guard 30 files). → `docs/archive/rounds/R16_RETRO_TUTORIAL_UI.md`, `docs/archive/rounds/R16_METROID_ABILITIES.md`
- **Abuse 관찰** LEVEL00-04 정적 파싱+DOSBox headless 전환 확인(적 6/58/78/83/103, 00은 허브). → `docs/reference/ABUSE_LEVEL_OBSERVATION.md`
- 미검증: `make smoke-local`, 릴리스 zip preview, 새 능력 브라우저 동작, Abuse 스크린샷, G5.
