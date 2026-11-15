# 진행 기록

## 2026-11-15 — 몬스터·지형 개선 2라운드: 활성화 범위·도약 쿨다운·시각 포화 (Kiro)
- 발견 1 수정(`world3d.ts`): 활성화에 근접 조건(수평 24 m, 수직 16 m) 추가, lostNow에 수직 24 m 조건 추가. 원인은 디버그 텔레포트 위치가 방 사각형 밖이라 `currentRoom`이 airlock으로 남은 것.
- 발견 2 수정: 크롤러·스토커 도약 종료(접촉·낙하 가드 포함) 시 `attackCooldown` 84/70틱 부여와 속도 0. 추격 중 쿨다운이면 2.2 m 안에서 0.55배속으로 물러난다. 기대 전이: windup 14 → attack ≤16 → recover 40 → chase(물러남) → 쿨다운 소진 후에만 windup (도약 간격 약 84틱 이상).
- 발견 3 수정(시각, unverified): Airlock 바닥 슬랩 색 0x1e252e→0x4a5866(전경 검은 박스 추정 원인), 업그레이드 케이지 opacity 0.28→0.12·코어 emissive 0.65→0.4, acid emissive 0.5→0.16·색 0x5f7a50·라이트 3→1.1, 콘솔 링 emissive 1.8→0.6·두께 0.05→0.035.
- 테스트 추가 2건: 다른 섹터 dormant 유지, 크롤러 재웅크림 간격 ≥60틱. 56/56.
- 검증: `make check` exit 0, reach3d 52 waypoints 3431 ticks, 봇 완주. 브라우저 확인은 unverified(오케스트레이터가 `ov_*` 캡처 재촬영).

## 2026-11-15 — 몬스터·지형 전면 개선 마무리: 조명 프리셋·블룸 완화·텔레메트리 (FEAT-005, Kiro)
- 커밋(`git log --oneline cb0d947..HEAD`): 8c9138c 계획 문서, 90a654c 몬스터 AI 상태, 4f879c6 몬스터 애니메이션 블렌딩, 506bd76 섹터 지형 세트 드레싱, 그리고 이번 `chore: lighting presets, bloom tamed pickups, telemetry, docs`.
- 변경(`scene3dFull.ts`): 업그레이드 젬을 유리형 외곽 케이지(opacity 0.28, 와이어)와 내부 코어(emissive 0.65)로 분리, 받침대 emissive 0.2와 어두운 링 추가. Save 패드 emissive 1.1→0.5, 펄스 0.45±0.15, 빔 opacity 0.1→0.07, 어두운 베이스 링 추가. 섹터별 조명 프리셋(`SECTOR_LIGHT`: 하늘색·태양색·강도·블룸 0.30–0.40)을 방 전환 시 보간. PointLight 추가 0개. `w.light`는 여전히 시각 전용.
- 텔레메트리: `getTelemetry()`에 `drawCalls`, `triangles` 추가(`renderer.info.autoReset=false`, 합성 직전 `info.reset()`이라 프레임 전체 합계). 값은 브라우저에서만 읽을 수 있어 아직 미측정(`window.__reanimator()`로 확인 필요).
- 검증: `make check` exit 0. `node --test tests/` 54/54, `reference-verify` 3/3, `reach3d` 52 waypoints 3431 ticks, dist-guard PASS(13 files 14,384,687 B / 218), 봇 완주 `won` 3674 ticks HP 160. 브라우저·smoke·시각 확인은 모두 unverified(Chrome 불가).

## 2026-11-15 — Acid 블룸·HUD 목표 줄 수정 (Kiro)
- 원인(추정): acid 재질 emissive 1.35 + 초록 PointLight 5 + bloom threshold 0.84가 겹쳐 acid 면이 포화. HUD는 OBJ 칩이 flex-wrap 폭에 따라 첫 줄로 올라감.
- 수정(수치): acid emissiveIntensity 1.35→0.5, acid 라이트 5/11→3/9, bloom strength 0.42→0.36·radius 0.32→0.3·threshold 0.84→0.9, 출구 링 1.9→1.3. `.hud-break`로 OBJ를 항상 둘째 줄에 고정.
- 검증: `make check` exit 0(reach3d 3431 ticks, dist-guard PASS 13 files). 시각 확인 unverified, 절차는 NEXT_PLAN 3차.

## 2026-11-15 — 샤프트 단색 면 수정·가독성 (Kiro)
- 원인(추정, 코드 분석): 샤프트 좌측 문 2개(blue y0–3.6, green y-11~-7.4, x≈24)의 측면이 원근으로 크게 보이고 균일 emissive 0.85에 블룸이 겹쳐 단색 사각형·삼각형이 됨. 수정: 문 `emissiveMap` 추가, 강도 0.6(펄스 0.5±0.15), HemisphereLight 1.35·지면색 0x242028.
- 검증: `make check` exit 0(reach3d 52 waypoints 3431 ticks, dist-guard PASS 13 files 14,330,345 B). 브라우저 시각 확인은 unverified(Chrome 불가). 재확인 절차는 NEXT_PLAN 참조.

## 2026-11-15 — 난이도 측정 도구 + 폴리시 (Kiro)
- 추가: `tools/game/difficulty.ts`(`make difficulty`). 무모한 입력(상시 동진·주기 점프·상시 사격·엄폐 없음)으로 3600 ticks 실행, 결과 `hpLost 248, deaths 2, kills 3, endX 41.18`(결정적, 2회 동일). 봉인 파일·`w.light` 무접촉. 테스트 1개 추가(45/45).
- 정리: `PCFSoftShadowMap`→`PCFShadowMap`(`scene3dFull.ts`), `vite.config.ts` 신설(`three` 수동 청크, 경고 한도 700 kB; three 661 kB·앱 128 kB), 아카이브 깨진 링크 3개 수정.
- riggedCount 7 vs 8: 버그 아님. `riggedCount = 1(operative) + stalker·warden 수`. 쿼터뷰 맵은 stalker 6+warden 1=8, 사이드뷰 맵은 stalker 5+warden 1=7. smoke는 `>= 1`만 요구.
- 검증: `make check` exit 0(45/45, dist-guard PASS 13 files 14,330,289 B). `make smoke-local` NOT RUN(Chrome abort), 그림자 모드 변경은 시각 unverified.

## 2026-11-15 — 제트 대시 부츠 게이트 우회 검사 (Kiro)
- 결과: 우회 없음. 대시는 상승 속도를 0.2배로 줄이고 중력을 끄므로 높이를 더하지 않는다. `reach3d`의 `dashReaches`가 navSteer 이동에 14개 첫 대시 틱 × 3개 반복 간격을 주입해 세 4.4 m 게이트(Shaft 38/4.4, Security 65/4.4, 55/4.5)를 검사: 부츠 없음 도달 불가, 부츠+대시 도달 가능(대조). 맵·`motion3d.ts` 무변경.
- 테스트: `tests/game3d.test.ts` reachability 테스트에 대시 게이트 단언 추가. `make check` exit 0.
- 한계: 탐색은 스크립트된 대시 스케줄이며 모든 사람 입력을 증명하지 않는다. 사람 확인은 G5.

## 2026-11-15 — Thruster Boots 필수화 (Kiro)
- `bio-grate-up` y 6.6→4.4, 봇·`reach3d` 웨이포인트 갱신, Security 두 번째 4.4 m 게이트 검사(`reach3d` runGate, 테스트). `make check` exit 0(`reach3d` 52 waypoints 3431 ticks).
- `docs/evidence/g3/*.png` 5장은 smoke 재생성분(바이너리만 변경)으로 별도 커밋.
- `make smoke-local`: Chrome 실행이 샌드박스에서 abort(134). 변경 후 smoke·showcase는 unverified.

## 2026-11-15 — 사망 화면 체크포인트 복귀 안내 보강 (Kiro)
- Status: 구현 완료, 로컬 커밋(푸시 보류).
- Changed: `index.html`(`#resume-save` 버튼), `src/ui/main.ts`(공용 `resumeAtSave()`, 버튼·`C` 키 공유, 저장 없으면 "Play again restarts" 안내), `src/ui/style.css`. 봉인 파일 무변경, `w.light` 미참조.
- Verified: `make check` exit 0(dist-guard PASS). `make smoke-local`은 Chrome 실행 불가(NOT RUN)로 unverified.
- Next: 사람 플레이(G5)에서 사망 화면 흐름 확인.

## 2026-11-15 — 렌더 자연스러움 보정: 턴·점프 포즈·머리 회전 (Kiro)
- Status: 후속 수정 커밋 `e15e9a0`, `d13ea1e`(로컬, 미푸시). 사람 눈 확인(G5)은 미실시.
- Changed: `src/render3d/scene3dFull.ts`(부드러운 방향 전환, 공중 0.1 s 디바운스 점프 포즈, 플레이어 보조 PointLight 1개), `src/render3d/riggedModels.ts`(척추·머리 가산 회전을 매 프레임 기본 자세에서 시작).
- Verified: `make check` 44/44, `make smoke-local` 29/29(60.5 fps), 쇼케이스 재생성. 머리 회전 수정은 600틱 후 캡처로 각도 정상 확인(단, 그 캡처는 사망 자세). 살아서 장시간 움직일 때는 unverified.
- Blockers: 푸시 승인 대기, 사람 플레이 필요. 로컬 dev 서버 `http://localhost:5173/` 기동 중.
- Next: 사람이 움직임(머리·턴·점프)을 보고 피드백 → 필요 시 추가 보정.

## 2026-11-15 — Side-View Metroidvania Wave 2–3 완료 (Kiro)
- Status: 전체 파이프라인 연결 완료, 게이트·스모크·쇼케이스 통과, 로컬 커밋(푸시 보류).
- Changed: `src/game3d/{world3d,bot3d,nav3d}.ts`, `src/render3d/{scene3dFull,fallback2d}.ts`, `src/ui/main.ts`, `tools/game/{reach3d,playthrough}.ts`, `tools/smoke/{smoke,capture-showcase}.ts`, `tests/game3d.test.ts`, spec tasks, steering, `docs/*`.
- Verified: `make check` exit 0(44/44, `reach3d` 3369 ticks + 부츠 게이트, dist-guard PASS), `make reference-holdout` 4/4, `make smoke-local` 29/29(60.5 fps), PNG 11장 육안 검수, 봇 56 s 완주, 봉인 파일 무변경.
- Fixed: 봇 `leap` 스텝이 도착 후에도 반복 점프하던 문제(tolX 확대 + 하강 목표 시 leap 해제); 신규 PointLight 5개 추가로 smoke fps 28 → 제거 후 60.5.
- Next: 푸시 승인, G5 사람 플레이.

## 2026-11-15 — Full 3D Side-View Metroidvania Wave 1 체크포인트 및 Kiro 전면 인계
- Status: Wave 0–1 작업물(물리·6섹터 맵·3D IK/점프·미니맵/HUD/오디오·spec) 워킹 트리에 작성 완료, Wave 2–3 Kiro 전면 인계. `make check`·`make smoke-local` **unverified**(중간 전환 상태, `git commit` 미수행).
- Changed: `src/game3d/{types3d,map3d}.ts`, `src/engine/motion3d.ts`, `src/render3d/riggedModels.ts`, `src/ui/{minimap,audio,style}.*`, `index.html`, `.kiro/specs/metroidvania-3d/*`, `.kiro/steering/reanimator.md`, `docs/plans/KIRO_METROIDVANIA_HANDOFF.md`, `docs/{AGENT_BRIEF,STATUS,NEXT_PLAN,PROGRESS_LOG,DECISIONS,LESSONS,KIRO_USAGE}.md`.
- Verified: `node tools/reference/verify.ts` 3/3 PASS(S1 100, S2 35, S3 59); `node --test tests/reference.test.ts tests/game.test.ts` 30/30 PASS; `tsc -p tsconfig.json 2>&1 | head -n 40`은 미전환 `src/game3d/world3d.ts` 오류 2건(`TS2322` line 219, `TS2367` line 237) 출력. 봉인 파일 무수정.
- Blockers: Wave 2(`world3d`, `bot3d`, `scene3dFull`, `fallback2d`, `main`, `smoke`, `capture-showcase`, `game3d.test`, `reach3d`) 미전환; `agy` 서브에이전트 `1ef925e0` 429 할당량 초과.
- Next: `docs/plans/KIRO_METROIDVANIA_HANDOFF.md` 절차대로 Kiro가 Wave 2 4-way 병렬 전환 및 Wave 3 게이트·시각 검수·커밋/푸시 수행.

## 2026-11-14 — Full 3D Quarter-View 문서 동기화 (kiro-cli Task C)

- Status: 문서를 G0–G4 복원 + Full 3D Quarter-View 기준으로 정렬. 코드·테스트·reference 무수정.
- Changed: `.kiro/steering/reanimator.md`, `docs/{AGENT_BRIEF,STATUS,NEXT_PLAN,EVALUATION,KIRO_USAGE,LESSONS}.md`, `docs/reference/ASSET_REGISTER.md`(v2 자산 9종·실제 바이트), `docs/plans/MESHY_PLAYABLE_UPGRADE_PLAN.md`, `docs/evidence/G4_REPORT.md`.
- Verified(관찰값 인용, 이 작업에서 재실행 안 함): `make check` exit 0(35/35, `reach3d` 573 ticks, `dist-guard` 12 files 14,304,572 B / 218), holdout 4/4, smoke 22/22(`60.5 fps`), 쇼케이스 PNG 6장. 파일 목록·바이트는 `ls -la`로 직접 확인.
- Next: 사용자 플레이(G5), G6 지시.

## 2026-11-14 — Meshy 7.1 + Three.js 2.5D Playable 고도화 완료 (Antigravity)

- Status: 2.5D Playable 업그레이드 완료 및 전 게이트·시각 검수 통과. 남은 작업은 사람 플레이(G5) 및 G6 제출 지시.
- Changed: Meshy 7.1 6개 `.glb` 생성·최적화(`public/assets/models/*.glb`, `reference/manifests/meshy-assets.json`, `tools/meshy/*`), 4섹터 맵(`src/game/map.ts`), 듀얼 화기·Spore-Sentinel·Core Warden·MedStation(`src/game/world.ts`), Three.js 2.5D 렌더러(`src/render/{scene3d,models}.ts`), HUD/오디오(`src/ui/{main,style.css,audio}.ts`, `index.html`), 봇·스모크·쇼케이스(`tools/game/playthrough.ts`, `tools/smoke/{smoke,capture-showcase}.ts`), 문서(`docs/{AGENT_BRIEF,STATUS,NEXT_PLAN,COMPLETED_SUMMARY,EVALUATION}.md`, `docs/plans/MESHY_PLAYABLE_UPGRADE_PLAN.md`, `docs/reference/ASSET_REGISTER.md`).
- Verified: `make check` exit `0`(테스트 `30/30`), `make reference-holdout` `4/4 PASS`, `bench.ts` `0.0187 ms/tick`, `playthrough.ts` 완주(`won`, `747` ticks, `hp: 100`, `12` kills), `make smoke-local` `19/19 PASS` (`60.5 fps`, `0` errors), `capture-showcase.ts` `OK` 및 `docs/evidence/g4_playable/*.png` 6종 `read_file` 검수.
- Fixed: Chrome 다중 다운로드 차단 → XHR `.glb` URL 가로채기 직접 스트리밍; Three.js 물리 candela 조도(`SpotLight` 1150, `PointLight` 340) 및 `tintMaterials` idle `amount=0` 보정으로 PBR 텍스처 복원; `#hud[hidden]` 표시 버그 수정; 15Hz 동기 rAF 쇼케이스 드라이버로 보스전+코어+오퍼레이터 동시 프레이밍 성공.
- Next: 사용자 `npm run dev` 직접 플레이 및 G5 3인 관찰.

## 2026-11-14 — 체크포인트: G0–G4 진입 문서 정리

- Status: G0–G3 PASS, G4 부분. 남은 일은 사람/사용자 작업(G5 관찰, MCP 등록, G6 지시).
- Changed: `docs/STATUS.md` 현재 기준으로 재작성(해결된 블로커 제거), `docs/NEXT_PLAN.md` 열린 작업만 유지, `docs/COMPLETED_SUMMARY.md`에 G0–G4 요약.
- Fixed: 계획에서 "Kiro workspace MCP 연결"을 완료로 잘못 표시했던 항목 → 미완(권한 차단)으로 정정.
- Verified: `make check` exit 0, `make smoke-local` 16/16 (이 체크포인트 직전 실행). Git 저장소 아님 → git status/diff/log 조회 불가.
- Blockers: `.kiro/settings/mcp.json` 쓰기 차단, 서버 실행 차단, 사람 플레이 없음.
- Fixed: hook이 "다음 세션부터 활성"이라던 기록 정정 — 이 세션에서 실제 4회 실행(`docs/evidence/g2/hook_runs.log`, exit 0).
- Next: 사용자 MCP 등록 확인 → 사용자 플레이·G5 관찰.

## 2026-11-14 — G4 부분 완료 (Kiro)

- Status: 기계 검사 가능한 안정화 완료. 사람 플레이·hook 실트리거 미완.
- Changed: 맵 3구간·탈출 웨이브, `src/ui/{audio,lab}.ts`, `tools/reference/scenario.ts`, `tools/game/bench.ts`, `tools/release/check-dist.ts`, `docs/EVALUATION.md`, 관찰 양식.
- Verified: `make check` exit 0, smoke 16/16, holdout 회귀 4/4, dist 63 kB 원본 미포함(심은 파일 탐지).
- Next: G5 사람 관찰(사용자 일정).

## 2026-11-14 — G3 PASS (Kiro, 기계 검사 범위)

- Status: 플레이 가능한 브라우저 게임 완성. 사람 플레이 미확인.
- Changed: `src/engine/collider.ts`, `src/game/*`, `src/render/canvas.ts`, `src/ui/*`, `index.html`, `tools/game/reach.ts`, `tools/smoke/smoke.ts`, `Makefile`, `package.json`, specs `reanimated-slice`.
- Verified: `make check` exit 0(테스트 25), `make smoke-local` 12/12, 도달성 BFS, holdout 회귀 4/4.
- Failures kept: C01 원본 사격 관찰 NOT RUN(로그 바이트 동일). Playwright headless shell rAF 0/s → Chrome 채널. 엔진 착지 정지 누락 버그 → 바이너리 근거로 수정.
- Next: G4 안정화.

## 2026-11-14 — G2 PASS (Kiro)

- Status: G2 통과(범위 한정). Canvas/게임 요소 미착수.
- Changed: `src/engine/motion.ts`, `tools/reference/*`, `tests/`, `Makefile`, `reference/fixtures|holdout`, 하네스 v8, G2_REPORT, BEHAVIOR_MAP M-GRAV-01.
- Verified: S1 100행·S2 35행·S3 59행 PASS, holdout M05 88행 PASS, 테스트 15, gate 변조 시 exit 2.
- Failure kept: 첫 holdout M04 FAIL(n59 xacel) → 바이너리 0x14760 근거로 수정 → M04 개발 이동 → M05 새 holdout.
- Next: G3 (C01/C02 관찰 가능성부터).

## 2026-11-14 — G1 PASS (Kiro, 옵션 A)

- Status: G1 통과. 게임 구현 미착수.
- Changed: Ghidra 12.2·JDK 25·arm64 decompiler(.tools), `scripts/{rea-env.sh,le2elf.py,observe.sh,analyze_hlog.py}`, 하네스 v7·holdout, BEHAVIOR_MAP, G1_REPORT.
- Verified: LE 변환 매핑(Watcom 진입 문자열), REA decompile-all 1,544, mover 경로 주소, replay 3회 sha256 동일 `e552a62a…`, 예측-관찰 일치.
- Blockers: `.kiro/settings/mcp.json` 쓰기 권한 차단. 점프 상승 감소 원인 미검증.
- Next: G2 restored-motion.

## 2026-11-14 — G0 착수 (Kiro)

- Status: 부분 완료. 원본 취득·실행 확인, 권리·형식 쟁점으로 G1 보류.
- Changed: spec abuse-reference, manifest, 자산 등록부, G0 보고서, KIRO_USAGE, DOSBox Staging 0.83.0(.tools).
- Verified: zip sha256, 목록 검사, `file`/`strings`로 DOS/4GW LE 확인, 원본 mode 13h 진입 로그+캡처.
- Blockers: LICENSE.TXT §1 역공학 금지, LE 형식의 REA 지원, 이동/점프 관찰 입력 방법.
- Next: 사용자 결정 A/B/C/D.

## 2026-11-14 — Abuse v3 계획과 REA 실행 환경 정비

- Status: 구체 계획·인계 문서 완료, 게임 다운로드/분석/구현 미착수.
- Changed: 사용자 선택 Abuse 반영. G0–G6, Kiro 복사 프롬프트, 원본/재해석 판정, 출처 등록부 작성. Wumpus v2.1 원문 보관.
- Changed: 공식 최신 REA 6.9.0과 Node 26.13.1을 프로젝트 `.tools`에 설치하고 `scripts/rea.sh` 제공. 전역 설정·기존 REA checkout 보존.
- Verified: npm 최신 버전, Node 공식 SHA-256, REA CLI 6.9.0, stdio MCP initialize/tools/list 255개. Kiro 연결 자체는 미실행.
- Verified: doctor Node/host 정상, 전체 환경은 Ghidra 미설정 등으로 exit 1. 상세 증거는 `docs/evidence/TOOLCHAIN.md`.
- Verified: 문서 15개·로컬 링크 31개·shell 예시 6개 문법·JSON·진입 문서 예산 검사 통과. `docs/evidence/plan-validation.json`. 앱 테스트는 미실행.
- Blockers: 실제 Abuse 포맷/게임 코드 로딩·원본 실행·JDK/Ghidra·에뮬레이터·권리 파일별 확인.
- Next: Kiro `abuse-reference` spec → G0 원본 배포본·권리·실행 확인. G1 게임 코드 1경로 통과 전 앱 구현 확대 금지.
- Review: 기존 Carbon 리뷰는 Wumpus 대상. Abuse v3 독립 리뷰 없음.
- Git: 체크포인트에서 `git status -sb`, `git diff --stat`, `git log --oneline -8`을 재확인. Git 저장소가 아니어서 조회 불가. 커밋·푸시 없음.
- Checkpoint: 기존 완료 기록을 보완하고 중복 increment는 만들지 않음. G0 재개 포인터와 진입 문서 예산 재검사. 새 게임 분석·구현·모델 호출 없음.

## 2026-11-14 — 재기획과 Carbon 독립 리뷰 반영

- 상태: 계획 완료. 구현·배포·제출은 미착수.
- 변경: 기존 명세를 v2.1로 개편, 제품 계획·검증 계약·공식 조건·출처 등록부 분리. v1 보존.
- 확인: 공식 규정·일정·상금·공지, BLACKOUT 현재 브랜치/HEAD, REA revision·라이선스.
- 리뷰: 공통 harness critic으로 Gemini 4 Carbon High 호출, SUCCESS/exit 0, 228.67초. 원문·raw·입력본 보존.
- 개선: 화살을 소모하는 조명, 변형 후 원본 trace 비교 중단, 플레이어 고객 통일, 시험 이후 외부 관찰, 핵심 변형을 유지하는 축소 순서.
- 검증: 문서 링크/코드펜스/공백 검사, shell 구문 검사. 앱 테스트는 실행하지 않음.
- 한계: 개선본 2차 Carbon 리뷰 미실행. 원본 실행·재미·REA/Kiro 실사용·출품 적격성 전체 미확인.
- 다음: 추천안 확인 후 Kiro P0 — 원본 배포본·라이선스·반복 실행.
- Git: 체크포인트에서 `git status -sb`, `git diff --stat`, `git log -3 --oneline`을 재확인했으나 Git 저장소가 아니어서 조회 불가. 커밋·푸시 없음.
- 체크포인트: 기존 완료 기록을 갱신하고 중복 항목은 추가하지 않음. 재개 위치는 `docs/plans/REANIMATOR_PLAN.md` P0의 원본 배포본·라이선스·반복 실행.
