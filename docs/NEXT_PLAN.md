# 다음 작업

이전 계획 전문: [archive/NEXT_PLAN_through_R3.md](archive/NEXT_PLAN_through_R3.md)(재귀 개선 1~3차, 몬스터·지형, R1~R3 후속 체크리스트 포함). 이월 상세: [archive/NEXT_PLAN_R4_R11.md](archive/NEXT_PLAN_R4_R11.md).

## 제출 준비 (마감 2026-12-04 14:00 PT)

- [x] 제출 전 문서·스크린샷 정비, BGM DSP·테마 개선(`src/ui/{audio,themes}.ts`), 1080p 트레일러(`reanimator_trailer.mp4`) 재제작·프레임/음향 직접 검수, CloudFront 재배포 및 `make smoke-local` 30/30·`make release` 검증.
- [x] `reanimator_trailer.mp4` YouTube public 업로드(`https://youtu.be/TvyT1M4yLzY`) 및 `docs/DEVPOST.md`·`README.md` 반영 완료.
- [x] (사용자) Kiro 크레딧 신청 완료(2026-11-21 확인).
- [x] R28 변경분(`src/ui/{audio,themes}.ts`, `tools/smoke/*`, `README.md`, `docs/*`) `6c32030` 커밋·`origin/main` push 완료.
- [x] Devpost 최종 제출 완료(`https://devpost.com/software/reanimator`, 카테고리 Resurrection, 수정 가능 기한 `2026-12-04 14:00 PT`; 마감 후 변경 금지).
- [x] R28 이후 잔여 기술/검증 완료: R19 릴 Stage 2·3 컷 확인(`reel.ts`), R13 `UiAudit.isStale` 수정 + `RunBot(1900)` vs `RunBot(1)`×1900 + `replan()` 겹친 구역/Stage 2·3 테스트, `__reanimatorSoak(3,{trace:true})` 0 leaks, 스테이지 12회 전환·`WEBGL_lose_context`·Vite dev HMR 비흑화면, R25 지형/접근성 스샷 육안 확인, `release` zip·`vite preview`·Chrome·Edge·모바일 라이브 검증, AWS Budgets `$10` 확인, 병합 브랜치 54개 삭제, CloudFront 재배포(`0201384cec3e462eed79d3dbc74f692a`).
- [ ] (사용자) 배포 URL(`https://dlr55kf9v2hn7.cloudfront.net`)에서 처음부터 끝까지 사람 플레이(G5), 막힌 곳·실제 조작/BGM 확인 및 Safari/Firefox 수동 확인(Playwright `webkit-2388` 미설치로 미검증).
- [x] Bonus Blog Prize 한영 아티클 발행(`men16922.github.io` `4c3002f`, `https://men16922.github.io/articles/reanimator`) 및 Devpost `Additional info` 등록·저장 확인(`SUBMITTED` 유지).
- [ ] 선택(사용자): Social Blitz Prize(`#KiroweenHackathon26`) 게시 후 Devpost 링크 추가(`bonus_prize_drafts.md` 초안 참고).

## 참고/선택 백로그 (필요 시 마감 이후 포크에서)

- [x] 흑화면 Bio-Labs 조사·Stage 2/3 컬러 그레이딩·유리 틴트·HUD 라벨(`make check` 768/768) + `make smoke-local` 30/30 + `release` zip·`vite preview`·Edge·Chrome·모바일 확인.
- [ ] G5 사람 플레이: 전 스테이지 체감 및 스테이지별 레트로 BGM 청취(사람 필요).
- [ ] `enemy-live.ts` crawler residual `5` displayPops(`1900..3200`) 원인 세부 정리 및 `chamfer`/`back-lane` 추가 Meshy 에셋(바닥 균열·Stage 1 벽 변주 등, 선택).
- [ ] Abuse GUI 세션 `scripts/observe_levels.sh` 스크린샷·팔레트 관찰(선택).
