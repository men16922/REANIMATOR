# 진행 기록

R3까지의 전체 기록(몬스터·지형, 보스, 오디오, 통합 병합 상세)은 [archive/PROGRESS_LOG_through_R3.md](archive/PROGRESS_LOG_through_R3.md).

## 요약 타임라인 (2026-11-14 ~ 11-15)

- 11-14 G0–G4: 원본 취득·실행 관찰, Ghidra/REA 분석, 이동 물리 TS 엔진 `motion.ts`, 로그 비교기, holdout M05, 2.5D 슬라이스, Restoration Lab, dist-guard. 상세 [G0](evidence/G0_REPORT.md) [G1](evidence/G1_REPORT.md) [G2](evidence/G2_REPORT.md) [G3](evidence/G3_REPORT.md) [G4](evidence/G4_REPORT.md).
- 11-14 Full 3D 쿼터뷰 + OSS 릴리스, 11-15 Metroidvania 3D(6섹터, 사이드뷰) Wave 1–3.
- 11-15 몬스터·지형 개선(적 AI·모션, 섹터 드레싱, 조명 프리셋), 병렬 3트랙(monsters/terrain/audio) 통합, 문 램프 instance 버퍼 7 vs 8 수정(`27af96f`).
- 11-15 R1 통합: gameplay/perf/juice/title(`c8beede`..`da59783`).
- 11-15 R2 통합: fix/boss/audio/brand. `main.ts` 충돌 2곳 수동 해결.
- 11-15 R3 통합: foes/fix/mood/classic. 충돌 2곳(`main.ts` import, `index.html`+Classic 블록) 수동 해결. `make check` exit 0(211/211, reach3d 52 waypoints, dist-guard 13 files).

## 2026-11-15 — R4-D 제출 패키지 (r4/docs)

- Status: 로컬 브랜치 `r4/docs`, 푸시 없음.
- Changed: `README.md` 전면 개편(영문, 한국어 요약), `docs/JUDGES.md` 신설, `docs/KIRO_USAGE.md`에 R1~R4 병렬 라운드 추가, `index.html`·`src/ui/{main,menu,style}.ts|css` Credits 패널(Extras), `package.json` description·keywords·license, 하네스 문서 정리(PROGRESS_LOG, NEXT_PLAN 전문은 `docs/archive/`로 이동, STATUS 이전판 복사).
- 봉인 파일 무변경. `make check` exit 0(r4/docs worktree 관찰, dist-guard PASS 13 files 14,577,537 B). 문서 링크 검사: showcase PNG 7장을 제외하고 깨진 링크 0.
