# 진행 기록

R3까지의 전체 기록(몬스터·지형, 보스, 오디오, 통합 병합 상세)은 [archive/PROGRESS_LOG_through_R3.md](archive/PROGRESS_LOG_through_R3.md).

## 요약 타임라인 (2026-11-14 ~ 11-15)

- 11-14 G0–G4: 원본 취득·실행 관찰, Ghidra/REA 분석, 이동 물리 TS 엔진 `motion.ts`, 로그 비교기, holdout M05, 2.5D 슬라이스, Restoration Lab, dist-guard. 상세 [G0](evidence/G0_REPORT.md) [G1](evidence/G1_REPORT.md) [G2](evidence/G2_REPORT.md) [G3](evidence/G3_REPORT.md) [G4](evidence/G4_REPORT.md).
- 11-14 Full 3D 쿼터뷰 + OSS 릴리스, 11-15 Metroidvania 3D(6섹터, 사이드뷰) Wave 1–3.
- 11-15 몬스터·지형 개선(적 AI·모션, 섹터 드레싱, 조명 프리셋), 병렬 3트랙(monsters/terrain/audio) 통합, 문 램프 instance 버퍼 7 vs 8 수정(`27af96f`).
- 11-15 R1 통합: gameplay/perf/juice/title(`c8beede`..`da59783`).
- 11-15 R2 통합: fix/boss/audio/brand. `main.ts` 충돌 2곳 수동 해결.
- 11-15 R3 통합: foes/fix/mood/classic. 충돌 2곳(`main.ts` import, `index.html`+Classic 블록) 수동 해결. `make check` exit 0(211/211, reach3d 52 waypoints, dist-guard 13 files).

## 2026-11-15 — R6 통합 (r6/arms, fix, sound, demo)

- Status: main에 `--no-ff` 4회 병합(arms → fix → sound → demo), 푸시 없음, worktree 보존.
- 충돌: sound 병합 시 `audioLogic.ts`(EVENT_SOUND 두 블록, `seal_close` 피치)와 `main.ts`(무기 배너 루프). 전용 레시피를 택하고 arms 이벤트 4개를 `weapon.flamer_loop`·`weapon.rocket`·`enemy.burn`·`player.rocket_jump`로 매핑, 배너 루프는 슬롯 2~6에 팡파르 호출. demo 병합 시 `main.ts`는 `applyDebugSetup` 이동 충돌만이었고 `demo.ts`에 6무기 ammo 타입을 반영.
- 추가: `triggerExplosion3D`가 로켓(byWeapon 6) 폭발에 `explosion` value 1을 싣고 `cueForEvent`가 `weapon.rocket_explode`로 연결. `PENDING_EVENT_SOUND` 제거, `tests/audio.test.ts`·`tests/arms.test.ts`를 전용 레시피 기준으로 갱신. demo의 `KIT_LATE`(무기 6종)를 보안 데크 이후·보스 체크포인트에 사용.
- 봉인 파일 무변경. `make check` exit 0(테스트 344/344, reach3d 52 waypoints 3432 ticks, dist-guard 13 files 14,684,946 B). 브라우저 검증은 unverified.

## 2026-11-15 — R5 통합 (r5/metroid, render, rig, vfx)

- Status: main에 `--no-ff` 4회 병합(순서 metroid → render → rig → vfx), 푸시 없음.
- 충돌: `scene3dFull.ts` 1곳(render 병합 시). `metroid3d` 빌드와 `hazards3d.setClassic` 호출을 둘 다 유지. rig·vfx 병합은 자동. `stepRiggedEnemyAnimation3D` 잔여 참조 0, vfx의 `flashMaterials3D` cap 경로는 `scene3dFull.ts`에서 정상 호출. frontLift는 벽·램프 재질에만 적용.
- 봉인 파일 무변경. `make check` exit 0(테스트 291/291, reach3d 52 waypoints, dist-guard 13 files 14,652,123 B). 브라우저 검증은 오케스트레이터 진행 중.

## 2026-11-15 — R4-D 제출 패키지 (r4/docs)

- Status: 로컬 브랜치 `r4/docs`, 푸시 없음.
- Changed: `README.md` 전면 개편(영문, 한국어 요약), `docs/JUDGES.md` 신설, `docs/KIRO_USAGE.md`에 R1~R4 병렬 라운드 추가, `index.html`·`src/ui/{main,menu,style}.ts|css` Credits 패널(Extras), `package.json` description·keywords·license, 하네스 문서 정리(PROGRESS_LOG, NEXT_PLAN 전문은 `docs/archive/`로 이동, STATUS 이전판 복사).
- 봉인 파일 무변경. `make check` exit 0(r4/docs worktree 관찰, dist-guard PASS 13 files 14,577,537 B). 문서 링크 검사: showcase PNG 7장을 제외하고 깨진 링크 0.

## 2026-11-15 — R7 통합 (r7/soak, ui, cam, vista)

- Status: main에 `--no-ff` 4회 병합(순서 soak → ui → cam → vista), 푸시 없음. 브랜치 커밋 soak `489064a`, ui `6f55435`, cam `a1995f7`, vista `1446079`.
- 충돌: `main.ts`(ui 병합, 선언부와 훅부에서 soak와 ui 양쪽 유지), `scene3dFull.ts`(cam 병합, 카메라 블록에서 `frameMs.fx` 계측과 cam의 구도 계산 유지). vista는 자동 병합.
- 통합 보강 `f146b2d`: `teardownLevel()`에 `vista.dispose()`와 `frameRect.reset()` 추가. vista는 `ensureWorldBuilt`에서 재빌드 전 해제하고 있었으나 teardown 경로에는 없었다.
- 봉인 파일 무변경. `make check` exit 0(테스트 380/380, reach3d 52 waypoints, dist-guard 13 files 14,721,553 B). 브라우저 검증은 하지 않았다(unverified).

## 2026-11-15 — R8 통합 (r8/leak, assist, lore, lab)

- Status: main에 `--no-ff` 4회 병합(leak → assist → lore → lab), 푸시 없음. 브랜치 커밋 leak `4da9b61`, assist `06163b2`, lore `c1ab067`, lab `697c3ea`.
- 충돌: lore와 lab 병합 시 `index.html`, `main.ts`, (lore) `style.css`. 양쪽 유지로 해결. `SECTOR_SUBTITLE` 미사용 import 제거.
- M05: 원래 Lab이 이미 holdout 로그를 표시했고 R8도 동일한 읽기 전용 경로라 정책 충돌 없음.
- 봉인 파일 무변경. `make check` exit 0(테스트 427/427, reach3d 52 waypoints, dist-guard 13 files 14,775,872 B). 브라우저 검증은 하지 않았다(unverified).

## 2026-11-15 — R9 통합 (r9/fix, world, abuse, parry)

- Status: main에 `--no-ff` 4회 병합(fix, world, abuse, parry; abuse와 parry 병합 순서는 실행 중 뒤바뀜, 결과 동일), 푸시 없음.
- 충돌: `tests/game3d.test.ts` 1곳, 양쪽 테스트 유지.
- 통합 보강: `scanTargets3D`가 기댐 가짜 벽(`break_lean_security`)을 시크릿으로 분류(+테스트). 키 X/C/Z는 컨텍스트별 한 의미(사망 화면 C는 Resume, 플레이 중 C는 카운터 보조). [R9_PARRY](R9_PARRY.md).
- 봉인 파일 무변경. `make check` exit 0(테스트 459/459, reach3d 52 waypoints 3432 ticks, 봇 5362 ticks HP 112/160 56 kills, dist-guard 13 files 14,790,497 B). 브라우저 검증은 하지 않았다(unverified).
- R10 Classic: audit, CRT toggle transition, reduce-flash sweep (docs/R10_CLASSIC.md). make check 465/465.
