# Abuse 자산 등록부 (G0)

2026-11-14 · 패키지 `abuse-box.zip` sha256 `5ef911f8…d4026`, 파일 218개. 전체 해시는 `reference/manifests/abuse-source.json`.
권리 판단은 보수적이다. 확인되지 않은 파일은 제외다.

| 범위 | 파일 | 분류 | 근거/사유 |
|---|---|---|---|
| `ABUSE/ABUSE.EXE` (sha256 `8ba92587…1074f`) | 게임 본체 | 분석 전용 · 공개 제외 | LICENSE.TXT §1이 역공학·파생물 금지. 아래 권리 쟁점 참조 |
| `ABUSE/SETUP.EXE`, `HMI*.386` | 설정·사운드 드라이버 | 제외 | 제3자(HMI) 구성요소 가능, 권리 미확인 |
| `ABUSE/SFX/*.WAV` | 효과음 | 제외 | 원개발사 고지의 효과음 예외. 복사 금지 |
| `ABUSE/TEST.RAW`, 음악 관련 | 음악/사운드 | 제외 | 별도 권리 확인 전 제외 |
| `ABUSE/ART/**`, `LEVELS/**`, `*.SPE`, `*.CPF` | 그래픽·레벨 | 분석 전용 | 셰어웨어 데이터. 재사용 허용 근거 미확정 |
| `ABUSE/LISP/*.LSP`, `ABUSE.LSP` 등 | 게임 로직 스크립트 | 분석 전용(소스 열) | 평문 Lisp. "Lisp/소스 열람" 열로만 기록 |
| `ABUSE/ADDON/**` | 예제 add-on | 분석 전용 | 권리 미확인 |
| `ABUSE/*.DOC`, `GAMEDEV.TXT`, `DOS_NOTE.TXT`, `LICENSE.TXT` | 문서 | 참조 | 공개물에 재배포하지 않음 |
| `ABSWEB.BAT`, `ABUSE.BAT`, `ABUSE-Info-Card.txt`, `END.MEM`, `GAMMA.LSP`, `SNDCARD.CFG` | DOS Games Archive 재포장 추가분 | 참조 | 2024-10-24 추가. 원본 아님 |

## 권리 쟁점 (사용자 결정 필요)

- `ABUSE/LICENSE.TXT` §1: 소프트웨어를 modify, translate, **disassemble, decompile, reverse engineer**, derivative works 작성 금지. 위반 시 라이선스 자동 종료(§6).
- Info card의 License/Permissions는 "Not specified". 배포 페이지는 "Free and Open Source Software (formerly Shareware)"로 표기하고 `abuse_pd.zip`(Public Domain 소스)을 별도로 제공한다. 이 후대 공개가 1995 바이너리의 EULA를 대체하는지는 이번 세션에서 확인하지 못했다.
- 따라서 이 바이너리의 디스어셈블/Ghidra 분석(G1)은 사용자 판단 전까지 시작하지 않는다. 실행 관찰(use)은 §1이 허용하는 범위로 본다. 법률 자문이 아니다.

## G1 파생물 (2026-11-14)

| 경로 | 분류 | 비고 |
|---|---|---|
| `reference/derived/ABUSE.le.elf`, `.json`, `decomp/` | 분석 전용 · 공개 제외 | 원본 코드 변환본·디컴파일. `.gitignore` |
| `reference/work/*` | 분석 전용 · 공개 제외 | 원본 작업 사본 |
| `docs/evidence/g1/insn_*`, `rea_inspect_*.json` | 분석 전용 · 공개 제외 | 원본 명령 덤프 (`.txt`도 공개 전 검토) |
| `docs/evidence/g0/*.png`, `docs/evidence/g1/runs/*/t*.png` | 분석 전용 · 공개 전 검토 | 원본 화면 캡처 |
| `docs/evidence/g1/runs/*/hlog.*`, `holdout/*` | 공개 후보(검토 필요) | 수치 상태 trace. 원본 자산 미포함 |
| `reference/harness/*.LSP`, `scripts/*` | 공개 후보 | 신규 작성 |

## G3 앱 자산 (2026-11-14)

| 경로 | 분류 | 비고 |
|---|---|---|
| `src/**`, `index.html`, `tools/**`, `tests/**` | 공개 후보 | 신규 작성 코드. 원본 코드·데이터 미포함 |
| `reference/fixtures/expected/*.hlog.txt`, `reference/holdout/*` | 공개 후보(검토 필요) | 원본 실행의 수치 로그. 원본 자산 미포함 |

## Meshy 3D & WebAudio 자산 — `reanimator-meshy-assets-v2` (2026-11-14)

모든 3D 모델은 원본 Abuse 데이터와 무관한 신규 생성(`new-design`)이다. 메타데이터·SHA-256은 `reference/manifests/meshy-assets.json`(schema `reanimator-meshy-assets-v2`)에 있다. 크기는 `public/assets/models/`의 실제 파일 바이트다. 라이선스 필드는 모두 `Private`.

| 자산 ID | 경로 | 크기 / 삼각형 | 생성기 | 비고 |
|---|---|---|---|---|
| `operative` | `public/assets/models/operative.glb` | 2,131,000 B / 10,344 | Meshy 7.1 SmartRig, 66 joints | 플레이어. 클립 idle·walk·run·jump·attack·death (`sha256: 9b33c8de…`) |
| `warden` | `public/assets/models/warden.glb` | 4,186,512 B / 31,061 | Meshy 7.1 SmartRig, 66 joints | Core Warden 보스. idle·walk·run·attack·death (`108070a5…`) |
| `bio-stalker` | `public/assets/models/bio-stalker.glb` | 3,093,224 B / 30,974 | Meshy 7.1 SmartRig, 66 joints | 추격형 적. idle·walk·run·attack·death (`4ef9d9af…`) |
| `pulse-rifle` | `public/assets/models/pulse-rifle.glb` | 562,032 B / 8,332 | Meshy 7.1 Flagship, WebP 512 + Meshopt | 무기 소품 (`9bc5da56…`) |
| `bio-barrel` | `public/assets/models/bio-barrel.glb` | 474,200 B / 7,500 | Meshy 7.1 Flagship, WebP 512 + Meshopt | 폭발 배럴 (`46633ce7…`) |
| `crawler` | `public/assets/models/crawler.glb` | 596,704 B / 11,992 | Meshy 7.1 Flagship | Skitter-Husk (`25e2d729…`) |
| `spitter` | `public/assets/models/spitter.glb` | 608,696 B / 12,000 | Meshy 7.1 Flagship | Spore-Sentinel (`99569ce9…`) |
| `power-core` | `public/assets/models/power-core.glb` | 600,268 B / 10,000 | Meshy 7.1 Flagship | 원자로 코어 (`3c555e1b…`) |
| `exit-gate` | `public/assets/models/exit-gate.glb` | 1,275,864 B / 21,774 | Meshy 7.1 Flagship | 탈출 에어록 (`7db59a68…`) |

| 항목 | 경로 | 분류 | 비고 |
|---|---|---|---|
| 3D 렌더러 | `src/render3d/{scene3dFull,riggedModels}.ts` | 신규 코드 | Three.js WebGL2. 원본 스프라이트·타일 미사용 |
| 2.5D 렌더러(과거 G4) | `src/render/{scene3d,models}.ts` | 신규 코드 | Canvas2D 폴백 포함 |
| 음향 | `src/ui/audio.ts` | 신규 코드 (파일 0개) | WebAudio 절차 합성 |
| 원본/컨셉 작업본 | `assets/meshy-raw/**` | 공개 제외 (`.gitignore`) | Meshy 원본 GLB. `tools/meshy/optimize-{rigged,glb}.ts` 입력 전용, `dist/` 미포함 |
| `dist/` | 빌드 산출물 (`.gitignore`) | 12 files, 14,304,572 B | `tools/release/check-dist.ts` PASS. 원본 Abuse 218개 해시·이름·MZ·extender 서명 0건 (`checkedAgainst: 218`) |

이력: G4 2.5D 단계의 6종 모델(operative·warden은 과거 14,000/15,996 tris 정적 버전)과 `dist/` 9 files 5,171,090 B는 이전 스키마 기준이며 현재 값으로 대체되었다.

<!-- terrain-kit:begin -->

### Terrain kit (R15, tools/meshy/terrain-kit.ts)

| id | 경로 | 크기 / tris | 생성 | prompt |
|---|---|---|---|---|
| `terrain/wall-panel` | `public/assets/models/terrain/wall-panel.glb` | 172,540 B / 3,591 | Meshy text-to-3D (refine `01a1df77…`) | Modular sci-fi wall panel with recessed seams, bolts and a small vent, flat thin rectangular slab with shallow depth, dark industrial sci-fi, worn gunmetal steel, grime and rust streaks, subtle teal and amber accent details, hard-surface, game-ready low poly modular kit piece, single object, no ground, no background |
| `terrain/floor-grate` | `public/assets/models/terrain/floor-grate.glb` | 235,768 B / 3,999 | Meshy text-to-3D (refine `01a1df77…`) | Flat thin square metal floor grate tile with shallow depth, diamond-pattern openings and a thick frame, dark industrial sci-fi, worn gunmetal steel, grime and rust streaks, subtle teal and amber accent details, hard-surface, game-ready low poly modular kit piece, single object, no ground, no background |
| `terrain/support-pillar` | `public/assets/models/terrain/support-pillar.glb` | 171,940 B / 3,549 | Meshy text-to-3D (refine `01a1df77…`) | Tall slender industrial support pillar with a base plate, rib collars and a capital bracket, dark industrial sci-fi, worn gunmetal steel, grime and rust streaks, subtle teal and amber accent details, hard-surface, game-ready low poly modular kit piece, single object, no ground, no background |
| `terrain/pipe-cluster` | `public/assets/models/terrain/pipe-cluster.glb` | 201,664 B / 3,999 | Meshy text-to-3D (refine `01a1df77…`) | Long horizontal cluster of three thick industrial pipes with flanges, valves and clamps, dark industrial sci-fi, worn gunmetal steel, grime and rust streaks, subtle teal and amber accent details, hard-surface, game-ready low poly modular kit piece, single object, no ground, no background |
| `terrain/steel-girder` | `public/assets/models/terrain/steel-girder.glb` | 211,156 B / 3,825 | Meshy text-to-3D (refine `01a1df77…`) | Long horizontal steel I-beam girder with rivets and cross bracing, dark industrial sci-fi, worn gunmetal steel, grime and rust streaks, subtle teal and amber accent details, hard-surface, game-ready low poly modular kit piece, single object, no ground, no background |
| `terrain/platform-edge-trim` | `public/assets/models/terrain/platform-edge-trim.glb` | 157,496 B / 3,288 | Meshy text-to-3D (refine `01a1df77…`) | Flat thin long platform edge trim strip with shallow depth, with hazard chevron plating and a raised lip, dark industrial sci-fi, worn gunmetal steel, grime and rust streaks, subtle teal and amber accent details, hard-surface, game-ready low poly modular kit piece, single object, no ground, no background |
| `terrain/mines-rock-chunk` | `public/assets/models/terrain/mines-rock-chunk.glb` | 164,420 B / 4,000 | Meshy text-to-3D (refine `01a1df78…`) | Jagged dark cave rock chunk with ore veins and faceted edges, subterranean mine, matte stone, low poly, single object, no ground, no background |
| `terrain/timber-brace` | `public/assets/models/terrain/timber-brace.glb` | 199,072 B / 4,000 | Meshy text-to-3D (refine `01a1df78…`) | Flat thin old mine timber support brace with shallow depth, two posts and a crossbeam with iron brackets, weathered dark wood, low poly, single object, no ground, no background |
| `terrain/specimen-tank` | `public/assets/models/terrain/specimen-tank.glb` | 181,132 B / 3,999 | Meshy text-to-3D (refine `01a1df78…`) | Bio-lab specimen tank, cylindrical glass cylinder with steel base and cap, murky green fluid, pipes on top, dark industrial sci-fi, worn gunmetal steel, grime and rust streaks, subtle teal and amber accent details, hard-surface, game-ready low poly modular kit piece, single object, no ground, no background |
| `terrain/security-bulkhead-frame` | `public/assets/models/terrain/security-bulkhead-frame.glb` | 195,512 B / 3,398 | Meshy text-to-3D (refine `01a1df78…`) | Flat thin heavy security bulkhead door frame with shallow depth with thick armoured jambs, hazard stripes and a lock housing, open doorway, dark industrial sci-fi, worn gunmetal steel, grime and rust streaks, subtle teal and amber accent details, hard-surface, game-ready low poly modular kit piece, single object, no ground, no background |
| `terrain/reactor-conduit` | `public/assets/models/terrain/reactor-conduit.glb` | 206,920 B / 3,816 | Meshy text-to-3D (refine `01a1df78…`) | Long horizontal core reactor energy conduit, thick armoured cable trunk with glowing amber coupling rings and insulators, dark industrial sci-fi, worn gunmetal steel, grime and rust streaks, subtle teal and amber accent details, hard-surface, game-ready low poly modular kit piece, single object, no ground, no background |

<!-- terrain-kit:end -->

## Abuse 레벨 관찰 증거 (분석용, 배포 제외)

- `docs/evidence/abuse_levels/{survey.json,SURVEY.md,run/}`: 수치·로그만 포함(원본 바이트·스크린샷 없음). `dist/`에 넣지 않는다.
