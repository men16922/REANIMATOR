# 진행 기록

R20~R15와 이전 항목은 [archive/progress-2026-11.md](archive/progress-2026-11.md), R3까지의 전체 기록(몬스터·지형, 보스, 오디오, 통합 병합 상세)은 [archive/PROGRESS_LOG_through_R3.md](archive/PROGRESS_LOG_through_R3.md).

## 2026-11-17 — R27 스모크 복구 (로컬 커밋, 푸시 없음)

- Changed: `tools/smoke/smoke.ts`(메뉴 4개, 버튼명, 점프·에임 대기), `style.css`(작은 글자 안티앨리어싱 복원), `.gitignore`(키가 든 `.mcp.json`·`.codex/` 등), `docs/JUDGES.md`, tidy-docs(라운드 문서 35개를 `docs/archive/rounds/`로 이동, STATUS/LOG 예산 맞춤, 링크 0 깨짐).
- Verified: `make smoke-local` 30/30, `make check` exit 0, 프로덕션 `dist/` Chrome 플레이(오류 0).

## 2026-11-17 — R23 FEAT-003 전체 런 엔딩 (로컬 커밋, 푸시 없음)

- Changed: `src/game3d/records.ts`(런 로그, 합계, 최고 런), `src/ui/main.ts`·`index.html`·`style.css`(REANIMATED 카드, `__reanimatorShowEnding`), `tests/fullrun.test.ts`.
- Verified: `make check` exit 0(759/759). 브라우저 unverified.

## 2026-11-17 — R23 FEAT-001 R22 갭 수정 (로컬 커밋, 푸시 없음)

- Changed: `tools/meshy/terrain-kit.ts` finalize가 manifest의 모든 `terrain/*`로 register 행을 만든다(`registerRowsFromManifest`). ASSET_REGISTER terrain 표를 3행에서 17행으로 복구. `tests/terrain-kit.test.ts`에 register 행 대조와 17개 GLB 법선 복구 테스트 추가.
- Verified: `make check` exit 0(746/746). 봇 핀 Normal 4978/126, Story 4880/142, Hard 5319/104 0 deaths(측정 재확인).

## 2026-11-17 — R22 Frost 에셋, 실행 기록 (로컬 커밋, 푸시 없음)

- Changed: 287d595(GLB 3종 ingest), 3409aef(Bulwark 방패 메시, Stage 3 props), c1a8681(파이프 벽 뒷 레인, 스크린샷 재촬영), 기록 커밋(`records.ts`, 클리어·선택 화면, `tests/records.test.ts`).
- Verified: `make check` exit 0(744/744), Playwright로 Stage 2 클리어 화면과 새로고침 후 Stage Select 기록 확인.
- Unverified: `make smoke-local`, 오디오 청감, Stage 2·3 사람 플레이, 릴리스 `vite preview`.

## 2026-11-17 — R21 렌더 버그 2건, Cryo Bulwark, 스테이지 사운드, README (로컬 커밋, 푸시 없음)

- Changed: 8c2699b(Foreman 패리 플래시 흰 실루엣), bcf4e06(인트로 레터박스 `.bar` 충돌), f1b4286(Cryo Bulwark, 스테이지별 음악·앰비언트·발소리·스팅어, `tests/stage3-bulwark.test.ts`, `tests/audio.test.ts` 이벤트 수 59→60), b9f9d1d(README, 메타, dist 금지어 가드, 픽스처 문구 제거 플러그인).
- Verified: `make check` exit 0(737/737), `make release` exit 0, Playwright로 Foreman 윈드업·타격, SPIRE WARDEN 카드, Cryo Stacks, Bulwark 방패, Lab PASS, Stage 3 오디오 테마 확인.
- Unverified: `make smoke-local`(Chrome 실행 불가), 사람 플레이.
