# 다음 작업

이전 계획 전문: [archive/NEXT_PLAN_through_R3.md](archive/NEXT_PLAN_through_R3.md)(재귀 개선 1~3차, 몬스터·지형, R1~R3 후속 체크리스트 포함). 이월 상세: [archive/NEXT_PLAN_R4_R11.md](archive/NEXT_PLAN_R4_R11.md).

## 제출 준비 (마감 2026-12-04 14:00 PT)

- [x] 제출 전 문서·스크린샷 정비, BGM DSP·테마 개선(`src/ui/{audio,themes}.ts`), 1080p 트레일러(`reanimator_trailer.mp4`) 재제작·프레임/음향 직접 검수, CloudFront 재배포 및 `make smoke-local` 30/30·`make release` 검증.
- [x] `reanimator_trailer.mp4` YouTube public 업로드(`https://youtu.be/TvyT1M4yLzY`) 및 `docs/DEVPOST.md`·`README.md` 반영 완료(로컬 미커밋).
- [x] (사용자) Kiro 크레딧 신청 완료(2026-11-21 확인).
- [ ] 로컬 변경분(`src/ui/{audio,themes}.ts`, `tools/smoke/*`, `README.md`, `docs/*`) 커밋·`origin/main` push(사용자 지시 시).
- [ ] (사용자) 배포 URL(`https://dlr55kf9v2hn7.cloudfront.net`)에서 처음부터 끝까지 사람 플레이(G5), 막힌 곳 기록 및 실제 플레이 감각·BGM 확인.
- [ ] (사용자) Devpost 양식 최종 제출(`docs/DEVPOST.md`, 카테고리 Resurrection, 마감 `2026-12-04 14:00 PT`).
- [ ] 선택: AWS Budgets 월 $5 알림(이메일 필요), 모바일·타 브라우저 확인, `#KiroweenHackathon26` 게시.

## 잔여 기술·검증 항목 (Post-R28)

- [x] 흑화면 Bio-Labs 조사(재현 불가, HMR 의심만 확인), Stage 2/3 컬러 그레이딩·유리 반사 틴트, HUD 섹터명 누출 수정, `make check` 766/766 (R26).
- [x] `make smoke-local` 30/30 PASS (R27·R28 재확인), Bio-Labs draw calls `222 <= 300`, R23 `REANIMATED` 카드 브라우저 0 errors 확인.
- [ ] G5 사람 플레이: 전 스테이지(Stage 1 전환 속도·적 달리기·카운터, Stage 2 Foundry/Foreman, Stage 3 Cryo Bulwark 난이도) 체감 및 스테이지별 레트로 BGM 청취.
- [ ] 흑화면 근본원인 확정(HMR 가설 미검증).
- [ ] R25 후속(선택): 지형 지오메트리 폴리시(chamfered batches·back-lane clutter) 재검증, Meshy 추가 후보(바닥 균열·그을음 데칼, Stage 1 전용 벽면 변주, 노란 트림 변형, Bulwark 전용 방패/냉각 파이프).
- [ ] R19 후속(선택): 디버그 `Trailer reel`(`reelPlayer.ts`) 스크립트에 Stage 2·3 컷 추가.
- [ ] R13 미조사 잔여(선택): `__reanimatorRunBot(1900)` 1회와 `RunBot(1)` 1900회 간 디버그 경로 차이 원인, `replan()` 겹친 구역 모호성, 오래된 UiAudit continues no-op.
- [ ] Abuse 관찰 후속(선택): GUI 세션에서 `scripts/observe_levels.sh` 스크린샷·팔레트 관찰.
- [ ] 로컬 브랜치 정리(사용자 확인 후): `r1/*`~`r14/*`, `improve/*` 병합 완료 브랜치.
