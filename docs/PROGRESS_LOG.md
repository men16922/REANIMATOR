# 진행 기록

R20~R15와 이전 항목은 [archive/progress-2026-11.md](archive/progress-2026-11.md), R3까지의 전체 기록(몬스터·지형, 보스, 오디오, 통합 병합 상세)은 [archive/PROGRESS_LOG_through_R3.md](archive/PROGRESS_LOG_through_R3.md).

## 2026-11-21 — 데모 영상·트레일러, 레트로 BGM, 제출 문서 (로컬 커밋, 푸시·재배포 없음)

- Changed: `src/ui/themes.ts`(10개 테마 레트로 아케이드풍 재작성), `tests/audio.test.ts`, 녹화·트레일러 도구 `tools/smoke/{record-demo,record-bed,trailer-cards,trailer}.ts`, `docs/KIRO_USAGE.md` 영문 심사 요약, `docs/DEVPOST.md` 제출 문안 초안, `.gitignore`(`docs/evidence/demo/`), stale worktree 메타데이터 prune.
- Verified: `make check` exit 0, `make smoke-local` 30/30(60.5 fps). 트레일러 `docs/evidence/demo/reanimator_trailer.mp4`(69.9 s, 봇 플레이 장면, 하드컷) 1초 간격 프레임 검수.
- Unverified: BGM·트레일러 청취, CloudFront는 예전 BGM(재배포 필요).
- Next: 재배포 → push → YouTube 업로드 후 `docs/DEVPOST.md`의 `<VIDEO_URL>`·README 링크 채우기 → Devpost 제출.

## 2026-11-17 — 해커톤(Kiroween 2026) 자격·규정 조사, 제출 준비 체크포인트

- Status: 제출 전 상태. 로컬 `main`이 origin보다 238커밋 앞섬, 푸시 없음.
- Changed: 코드 변경 없음(조사·정리). 위 R27 두 항목이 이번 세션의 변경 전부(HEAD `7066e12`).
- Verified: 첫 커밋 2026-11-14(제출 기간 10-30~12-04 이후 시작 → 자격 충족으로 보임), `LICENSE` MIT, `.kiro/` 25개 파일 추적·미무시, 추적 파일·git 이력에 `msy_`/`sk-`/`AKIA` 키 없음. 공식 Devpost 규정은 403으로 읽지 못함(검색 결과·2025 규정 기준, AWS 배포 필수 근거 없음). unverified: 2026 필수 제출물 원문, 저장소 공개 여부, 데모 영상 존재.
- Blockers: Meshy API 키가 `.mcp.json`·`.codex/config.toml`(gitignore 처리됨)에 평문으로 있고 이 세션 로그에 노출됐을 수 있음 → 재발급 필요. 마감 2026-12-04 14:00 PT.
- Next: Rules 탭 확인 → 키 재발급 → 푸시(사용자 지시) → 데모 영상 → 사람 플레이 → `KIRO_USAGE.md`에서 Kiro 실사용만 남기기 → README 첫 화면 정리.

## 2026-11-17 — R27 스모크 복구 (로컬 커밋, 푸시 없음)

- Changed: `tools/smoke/smoke.ts`(메뉴 4개, 버튼명, 점프·에임 대기), `style.css`(작은 글자 안티앨리어싱 복원), `.gitignore`(키가 든 `.mcp.json`·`.codex/` 등), `docs/JUDGES.md`, tidy-docs(라운드 문서 35개를 `docs/archive/rounds/`로 이동, STATUS/LOG 예산 맞춤, 링크 0 깨짐).
- Verified: `make smoke-local` 30/30, `make check` exit 0, 프로덕션 `dist/` Chrome 플레이(오류 0).

## 2026-11-17 — R27 AWS 배포 (로컬 커밋, 푸시 없음)

- Changed: `infra/site.yaml`(S3 비공개 + CloudFront OAC, HTTPS, 보안 헤더), `infra/deploy.sh`, `infra/README.md`. 스택 `reanimator-site`(us-west-2), URL https://dlr55kf9v2hn7.cloudfront.net.
- Verified: 56/56 파일 업로드, 콘텐츠 타입·캐시·HSTS 헤더 확인, HTTP→HTTPS 301, S3 직접 접근 403, 실제 URL에서 Chrome 플레이(오류 0, HTTP 4xx 0, glb 16개 로드, 스크린샷 `r27_first90/6-aws-cloudfront-play.png`).
- `infra/deploy.sh` 전체 재실행 확인(변경 없음, 업로드·무효화 성공). Unverified: 모바일·타 브라우저.

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
