# REANIMATOR 재개 안내

▶ NEXT SESSION: **Kiroween 2026 Devpost 제출 완료**(`https://devpost.com/software/reanimator`, 카테고리 `Resurrection`, 수정 기한 `2026-12-04 14:00 PT`). 기술/배포 잔여 작업 완료: `UiAudit` 조기 중단 보강·`replan` 다구간 회귀 테스트 추가(`make check` 768/768, `reference-holdout` 4/4, `smoke-local` 30/30, `release` zip·`vite preview`·Edge·Chrome·모바일 라이브 검증, soak 0 leaks, 병합 브랜치 54개 정리, CloudFront 최신 재배포 MD5 `0201384cec3e462eed79d3dbc74f692a`). 남은 **사용자 직접 수행/선택 항목**: (1) 라이브 URL(`https://dlr55kf9v2hn7.cloudfront.net`) 사람 플레이(G5) 및 Safari/Firefox 수동 확인(Playwright `webkit-2388` 부재), (2) 선택 보너스(블로그/`#KiroweenHackathon26` 소셜 — 초안 아티팩트 `bonus_prize_drafts.md`). 마감 이후(`2026-12-04 14:00 PT` 이후) 변경 금지. 계획 [NEXT_PLAN](NEXT_PLAN.md).

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
