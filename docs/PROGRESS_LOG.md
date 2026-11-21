# 진행 기록

R20~R15와 이전 항목은 [archive/progress-2026-11.md](archive/progress-2026-11.md), R3까지의 전체 기록(몬스터·지형, 보스, 오디오, 통합 병합 상세)은 [archive/PROGRESS_LOG_through_R3.md](archive/PROGRESS_LOG_through_R3.md).

## 2026-11-21 — GitHub push 및 Kiroween 2026 Devpost 최종 제출 완료

- Status: 해커톤 제출 완료(`https://devpost.com/software/reanimator`, 수정 가능 기한 `2026-12-04 14:00 PT`; 마감 이후 저장소·영상·배포 변경 금지).
- Changed: `docs/JUDGES.md` 바이트 수치 정합화 후 R28 변경 14파일 커밋·`origin/main` push(`6c32030`). Devpost 제출서(`1273977-reanimator`) 4단계 전체 입력(제목·피치·썸네일 `og-image.png`·스토리·태그 13종·링크 2건·갤러리 8컷·YouTube `https://youtu.be/TvyT1M4yLzY`·카테고리 Resurrection·Kiro/사전작업/테스트 안내·약관 동의) 및 최종 제출 완료.
- Verified: GitHub API `private: false`, `license: MIT`, `default_branch: main`; Devpost `"Project submitted!"` 배너 및 공개 페이지 `https://devpost.com/software/reanimator` 확인.
- Unverified: 사람 전 구간 플레이(G5).
- Next: 필요 시 `2026-12-04 14:00 PT` 전까지 사람 플레이(G5) 결과 또는 보너스(블로그/소셜) 추가, 마감 이후 동결 유지.

## 2026-11-21 — YouTube 트레일러 공개 업로드·문서 링크 반영·Kiro 크레딧 신청 완료 반영

- Status: 제출 필수 자산(코드·CloudFront 라이브·YouTube 공개 영상·Kiro 크레딧 신청·문서) 준비 완료, 로컬 변경분 커밋·push 및 Devpost 최종 등록 대기.
- Changed: YouTube Studio(`Paulos` `@paulosdev-j2u`)에 `reanimator_trailer.mp4` public 게시(`https://youtu.be/TvyT1M4yLzY`), [DEVPOST.md](DEVPOST.md) `<VIDEO_URL>` 치환, [README.md](../README.md) `Trailer` 링크 추가, `docs/{AGENT_BRIEF,STATUS,NEXT_PLAN}.md`에 영상 URL 및 Kiro 크레딧 신청 완료 반영.
- Verified: YouTube Studio `"게시된 동영상"` 모달 확인(`https://youtu.be/TvyT1M4yLzY`, 공개 설정, 저작권 문제 0건, 1:12).
- Unverified: 사람 전 구간 플레이(G5).
- Next: 사용자 지시 시 로컬 변경분 커밋·`origin/main` push → 사람 플레이(G5) → Devpost 최종 제출(마감 12-04 14:00 PT).

## 2026-11-21 — BGM DSP·테마 개선, 1080p 트레일러 재제작, CloudFront 재배포 (로컬 미커밋)

- Status: 구 720p 트레일러·BGM 직접 청취/시청 결함 수정 완료, 개선 빌드로 CloudFront 라이브 재배포 완료(소스·문서는 로컬 미커밋).
- Changed: `src/ui/audio.ts`(`BGM_TRIM` `1.4→1.08`, `tone()` 레이어별 LPF `1700/3200/3800 Hz`, `clangHit` triangle·4.8 kHz 제한·게인 `0.04→0.022`), `src/ui/themes.ts`(`biolabs`/`boss`/`meltdown` 리드 1옥타브 하향, `meltdown` triangle 패드, `victory` 104 BPM 차분한 Sci-Fi 해결), `tools/smoke/{record-demo,record-bed,trailer-cards,trailer}.ts`(자막 제거 1080p 캡처, 3막 E minor→D minor→E minor 베드 + 실제 게임 SFX 24큐 믹스, 48 kHz·리미터 마스터링).
- Verified: `make check` exit 0(`766/766`, `dist-guard` 56 files `20,780,579 B`), `make smoke-local` 30/30(`60.5 fps`, `4978 ticks`), `make release`(`12,263,114 B`), `infra/deploy.sh` + 무효화 `I6497S1WOJI312QSKUJ4FMU6XH`(라이브 `index.html` MD5 `619e6b33465b66db9c17fb204f7aab4a` = 로컬 `dist/`, `/assets/index-CsTU0H5t.js` HTTP/2 200), 트레일러(`1920×1080 25 fps`, `71.96 s`, `79 MB`, `48 kHz`, `-15.2 LUFS`, True Peak `-1.0 dBFS`, 0 dB 샘플 0) 1초 프레임·오디오·개선 BGM 직접 검수.
- Unverified: 사람 전 구간 플레이(G5).
- Next: 사용자 트레일러 확인·YouTube 업로드 → `<VIDEO_URL>` 반영 및 이번 변경분 전체 커밋·push → 사람 플레이 → Kiro 크레딧·Devpost 제출.

## 2026-11-21 — 제출물 검수·문서/스크린샷 정비·잔여 브라우저 검증 (로컬 미커밋)

- Status: 제출 직전 검수 및 로컬 문서·릴리스 정비 완료(커밋·push 없음, 라이브 `index.html` = 로컬 `dist/` 확인).
- Changed: `docs/PREEXISTING_WORK.md`(구버전 한국어 메모·`/Users/` 로컬 경로 제거, 영문 공개 고지로 개편), `README.md`(라이브 CloudFront/가이드 링크, R26/R27/showcase 최신 스크린샷 교체, 게임패드·`766` 테스트·`dist-debug` `?debug=1` 설명 보정), `docs/JUDGES.md`(라이브 URL, `Trailer Reel` 명칭, R16–R28 요약, R28 검증 수치 갱신), `docs/DEVPOST.md`(도구·테스트 수 766 정합성 보정), `docs/{AGENT_BRIEF,STATUS,NEXT_PLAN}.md` 동기화.
- Verified: `make check` exit 0(`766/766`, `reach3d` S1 52/S2 33/S3 32 waypoints, `dist-guard` 56 files 20,780,377 B), `make smoke-local` 30/30(60.5 fps, 봇 4978 ticks, 오류 0), Playwright `dist-debug/?debug=1` Bio-Labs `222` draw calls 및 `__reanimatorShowEnding()` `REANIMATED` 카드 0 errors, `make release`(`release/reanimator-1.1.0-web.zip` 12,263,092 B), 트레일러 `ffprobe`/`ebur128`/`silencedetect`(`69.87 s`, `-14.7 LUFS`, `+0.2 dBFS` peak, 무음 0).
- Unverified: 트레일러·레트로 BGM 사람 청취, 라이브 URL 사람 플레이(G5).
- Next: 사용자 트레일러 시청 후 YouTube 업로드 → `<VIDEO_URL>`·README 반영 및 이번 수정분 커밋·push → 사람 플레이 → Kiro 크레딧(12-01 12:00 PT)·Devpost 제출(12-04 14:00 PT).

## 2026-11-21 — 재배포·GitHub push·LICENSE 인식 수정 (사용자 지시)

- Status: 제출물 중 코드·라이브 데모 공개 완료. 남은 것은 영상 업로드와 Devpost 양식(사용자).
- Changed: `infra/deploy.sh`로 CloudFront 재배포(새 BGM), `origin/main` push 240커밋(`a9cabde..d232e4e`). GitHub가 `LICENSE`를 `NOASSERTION`으로 판정 → 범위 안내문을 `NOTICE.md`로 분리, README 링크, `6f1b6d6` push.
- Verified: 라이브 `index.html` MD5 = 로컬 `dist/`, 새 번들 `assets/index-a1YQEcg-.js` 200. GitHub API `private: false`, `spdx_id: MIT`. `make check` exit 0(LICENSE 분리 후).
- Blockers: 없음(영상 링크 대기).
- Next: YouTube 링크 → `docs/DEVPOST.md`·README 반영·push → Devpost 제출, Kiro 크레딧 신청(12-01 12:00 PT).

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
