# STATUS 발췌 R18-R19 (STATUS.md에서 이동)

## R19 트레일러 릴 (2026-11-16)

- 쇼케이스 릴 12컷·90 s로 3개 스테이지 포함(월드 교체형 컷). `tests/demo.test.ts`는 컷 수·길이(8→12, 60→90 s)와 틱 단조 증가 범위(스테이지별)가 설계상 바뀌어 의도적으로 수정. `make check` exit 0(718/718). Playwright: Stage 2·3 컷 캡션·렌더 확인, 오류 0([docs/evidence/r19_reel/](evidence/r19_reel/)). 헤드리스 타이머 스로틀로 컷별 캡처는 일부만.

## R18 스테이지 검증 (2026-11-16, 로컬 커밋 d7e91ab·4778f0c·이번 docs)

- Stage 2·3 브라우저 검증, HUD 목표 줄 수정, 모든 섹터 draw calls 300 이하(최대 전투 쇼케이스 294), Stage 2 Slag Foreman 미니보스(돌진+충격파, 출구 잠금), 스테이지별 컬러 그레이드, Stage 2·3 봇 완주 테스트. Foreman 이후 재측정: Stage 2 방별 최대 134-153, Foreman 전투 135. 상세 [MEASURED](evidence/r18_stages/MEASURED.md), 스크린샷 `foreman_lunge.png`.
- README에 3개 스테이지 스크린샷 추가, 쇼케이스 릴 마지막 컷에 "Three stages" 문구. 릴 컷은 Stage 1 봇 재생이라 Stage 2·3 장면 컷은 없음.
- Unverified: Stage 2·3 사람 플레이, `make smoke-local`, `make release`/`vite preview`(아래 PROGRESS_LOG 참조), G5.

