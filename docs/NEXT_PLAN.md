# 다음 작업

2026-11-14 · 열린 작업만 둔다. 완료 내역은 [완료 요약](COMPLETED_SUMMARY.md) 및 [Meshy 계획](plans/MESHY_PLAYABLE_UPGRADE_PLAN.md).

## 사용자 작업 (직접 실행/확인)

- [ ] `npm run dev` 실행 후 Full 3D 빌드 직접 1회 플레이(`WASD`, 마우스 조준, 좌클릭 발사, `Space` 점프, `Shift` Jet-Dash, `F` 상호작용, `E` 헤드램프, `1`–`4` 무기).
- [ ] `.kiro/settings/mcp.json`에 REA 등록(권한 규칙으로 에이전트 쓰기 차단). 스니펫은 `docs/evidence/TOOLCHAIN.md`.

## G5 — 사람 플레이 관찰 (사용자 일정 필요)

- [ ] 3인 관찰(`docs/evaluation/PLAYTEST_FORM.md`), 실제 사람 플레이 시간·난이도·조명 선택의 재미 측정, 주요 문제 수정 및 동일 조건 재확인.

## G6 — 제출 후보 (사용자 지시 필요)

- [ ] 최신 공식 규정 재확인, 영문 설명, 2분40초 영상(`docs/evidence/g4_playable/` 갤러리 활용), 공개 저장소·배포·제출은 사용자 지시 범위에서만 수행.

## 기록·보강 선택 사항

- [ ] Kiro hook 로그(`docs/evidence/g2/hook_runs.log`)에 유발 파일명을 남기도록 hook 명령 개선.
- [ ] 원본 사격 관찰(C01) 재시도는 선택 사항(`src/engine/motion.ts`와 신규 설계 경계는 분리됨).
