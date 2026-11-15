# REANIMATOR 재개 안내

▶ NEXT SESSION: R3까지 main(`c84649e`)에 통합되어 있고 R4(A 시각, B 환경 위험, C 플레이어 캐릭터, D 문서·제출)가 병렬 worktree에서 진행 중이다. 이 브랜치(`r4/docs`)는 README·JUDGES·KIRO_USAGE·크레딧 패널이다. 다음 할 일: R4 트랙 병합 후 `make check`, 오케스트레이터가 Playwright로 찍은 쇼케이스 PNG를 `docs/evidence/showcase/`에 저장(README가 이 경로를 참조), 그다음 푸시 승인과 G5 사람 플레이. 푸시는 사용자 지시 전까지 하지 않는다.

## 한 줄 요약

1996년 DOS *Abuse* 셰어웨어 1.05의 이동 물리를 원본 로그와 11개 필드 exact 일치로 복원(S1·S2·S3 + sealed holdout M05, 15 Hz는 설계값)했고, 그 위에 Full 3D 사이드뷰 메트로배니아를 신규 설계했다. 복원 범위는 이동 물리뿐이다.

## 읽는 순서

[상태](STATUS.md) → [다음 작업](NEXT_PLAN.md) → [진행 기록](PROGRESS_LOG.md) → [Kiro 활용](KIRO_USAGE.md) → [심사 가이드](JUDGES.md). 이력은 [archive/](archive/)(예: `PROGRESS_LOG_through_R3.md`).

## 규칙

- 봉인 파일 수정 금지: `src/engine/{motion,collider}.ts`, `src/game/{light,map,world}.ts`, `tools/game/reach.ts`, `tests/{game,reference}.test.ts`, `reference/{fixtures,holdout}/**`. 판정은 [VERIFICATION_CONTRACT](reference/VERIFICATION_CONTRACT.md).
- 헤드램프 `w.light`는 HUD·렌더러 전용(R3.3, `tests/game3d.test.ts`가 확인).
- 변경 후 `make check`. 실행하지 않은 검증은 "unverified"로 적는다.
- `dist/`에 원본 Abuse 파일이 들어가면 안 된다(`tools/release/check-dist.ts`).
- spec: `.kiro/specs/metroidvania-3d/`(현재), steering `.kiro/steering/reanimator.md`.
- 기존 BLACKOUT/REA 트리와 전역 설정은 보존한다. 푸시·배포·제출은 사용자 지시 범위에서만.
