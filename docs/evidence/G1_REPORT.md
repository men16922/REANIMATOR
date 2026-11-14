# G1 보고서 — 원본 게임 코드 분석 가능성

2026-11-14 · Kiro 세션 · 사용자 지시: 옵션 A(권리 위험 인지 후 바이너리 분석). 판정: **PASS (M01·M03 범위)**.
소요: 환경 15:00–15:05(Ghidra/JDK/decompiler), 분석·실행 15:05–15:44. 4시간 상한 이내.

## 완료 기준 대비

| 기준 | 결과 | 근거 |
|---|---|---|
| stub/extender/본체 구분 | 완료 | MZ stub 0x0, DOS/4GW, 내부 MZ 0x26654, LE 0x290a4. REA 직접 inspect는 stub만 16비트로 열었음(`g1/rea_inspect_abuse.json`) → 게임 분석으로 미사용 |
| REA provider 로딩 범위 | 완료 | 변환본 ELF를 REA+Ghidra 12.2로 열어 segment 2개, procedure 1,544, string 2,061 (`g1/rea_inspect_le_elf.json`). `decompile-all` 1,544/1,544 written |
| 게임 경로 1개 주소 연결 | 완료 | 입력 훅 0xc8ff4 → cop_mover 0x14760 → mover 0x3a1d8 → 0x38704 → try_move 0x37e82 → 타일 0x558e5 ([BEHAVIOR_MAP](../reconstruction/BEHAVIOR_MAP.md)) |
| 실행 연결 | 완료 | 원본 기계어 실행 중 상태 기록. 정적 예측 6항목 일치(점프 상승 감소는 중력으로 해소) |
| 입력 replay·초기 상태·오차 | 완료 | 아래 계약. 3회 바이트 동일 |

## 도구 (모두 프로젝트 범위)

- Ghidra 12.2 (`.tools/ghidra_12.2_PUBLIC`, zip sha256 `2c2cd776…a628a7be67`). macOS arm64 native decompiler가 배포본에 없어 동봉 C++ 소스를 `make ghidra_opt sleigh_opt ARCH_TYPE="-arch arm64"`로 빌드 → `Ghidra/Features/Decompiler/os/mac_arm_64/{decompile,sleigh}` (sha256 `8f793c1f…`, `c876531e…`). Makefile 미수정.
- Temurin JDK 25.0.5+8 (`.tools/jdk-25.0.5+8`, Adoptium checksum 일치). REA가 JDK 25+를 요구, 기존 JDK 21 거부.
- `scripts/rea-env.sh`: GHIDRA_INSTALL_DIR·JAVA_HOME을 자식 프로세스에만 설정.
- `scripts/le2elf.py`: LE→ELF32 변환(분석용 변환본, 매핑 JSON 동반).
- DOSBox Staging 0.83.0 + `scripts/observe.sh`(fresh 작업 사본, 고정 conf, autotype, 창 캡처).

## 관찰 계측 (runtime-observed, 계측 있음)

- 원본 EXE·데이터는 그대로. 작업 사본에 `HARNESS.LSP`를 추가하고 `ABUSE.EXE -lsf harness.lsp`로 시작.
- 하네스는 엔진의 `get_local_input` 훅만 재정의(고정 입력 스크립트)하고 매 호출 상태를 `HLOG.TXT`에 append. `mover`/`cop_mover`/`try_move`는 원본 기계어.
- 계측 영향: 입력 출처 변경 + Lisp 파일 I/O. tick 단위 시뮬레이션 값만 비교하므로 실시간 타이밍 영향은 비교 대상 밖. 비계측 실행과 생성 위치 화면 비교 일치(`g1/runs/noharness/t027.png` vs `probe5/t027.png`).
- 하네스 개발 중 실패와 원인(바이너리 근거로 해소):
  1. "is not a number": tmp 공간 숫자가 tick 리셋 후 무효 → 전역 값은 perm-space에서 생성.
  2. "cannot malloc 8 bytes in space #2": 사용자 함수 본체는 LCACHE에서 정확한 크기의 user 공간(2)으로 페이징(0x3027d→0x3359c→0x3025f, 할당 0x25be7은 공간 0/1만 GC). 함수 안 문자열 리터럴이 공간을 초과 → 문자열을 perm 전역으로 이동.
  3. perm 리스트 누적은 perm 고갈 → 매 tick 파일 append로 변경.

## 재현 계약 (scenario G1-M01M03)

| 항목 | 값 |
|---|---|
| 원본 | package `5ef911f8…d4026`, EXE `8ba92587…1074f` |
| 에뮬레이터 | DOSBox Staging 0.83.0, conf `g1/runs/g1_r1/dosbox.conf` (cycles fixed 20000, nosound) |
| 시작 | autotype `-w 8 -p 3 esc esc enter enter` → level00 (`levels/level00.spe`) |
| 하네스 | `reference/harness/HARNESS.v7.LSP` sha256 `a2e02ae4eb593f380ac149374206a56a77835bdf47543248fab56dcea48b41d9` |
| 초기 상태 | n=2 첫 기록 (58,61), 낙하 후 n≥9 y=91, state 2 |
| 입력 | n<30:0, 30–59:-1, 60–89:0, 90–109:+1, 110–139:0, 140–149:-1, 170–171:yv -1, end 230 |
| tick 매핑 | n = 포커스 객체 존재 시 `get_local_input` 호출 수, game_tick 73278부터 1씩 |
| 결과 | `g1/runs/g1_r{1,2,3}/hlog.txt` sha256 모두 `e552a62a0a3410e06e0afd59f53d0e84e225f1b5418f5052f1b48858e1f96b76` |
| 허용 오차 | 상태 비교 `reference-state`: x, y, xvel, yvel, dir, state **정확 일치(오차 0)** |
| holdout M04 | `HARNESS.holdout_M04.LSP` sha256 `ed638598639e53f318baf1c43380bfce37fa0bacae45e7c98c98f1055dd9a43b`, 3회 `b3f846472608a5df1913bdc4de34fc61b7e2ea9dffcf5a6b0fa88bdbb92ef278`. 구현·분석에 사용하지 않음 |

## 발견

- 원본 좌우 비대칭: 정지 상태에서 오른쪽은 첫 tick +9, 왼쪽은 -8 후 -9 (0x3a265 vs 0x3a27e). 복원 대상 특징으로 기록.
- level00 x≈346–364, y=181 구간 진입 시 약 100 tick 입력 무시(튜토리얼 메시지, `freeze_player` 추정). G1 시나리오는 이 구역을 피함.

## 미확인·한계

- 점프 상승 감소는 중력 적분으로 확인(BEHAVIOR_MAP M-GRAV-01, 8비트 고정소수 규칙). walk_top_speed 경로·객체 충돌·사다리 미관찰. RNG 경로 NOT RUN.
- 필드 의미(+0x3e=x 등)는 정적 사용과 Lisp builtin 관찰의 일치에서 나온 추론.
- 공개 소스와의 대조(source-crosscheck)는 하지 않았다. 공개 소스는 이번 분석에 사용하지 않음.
- 권리: LICENSE.TXT §1 역공학 금지 조항. 사용자가 인지하고 지시. 분석 산출물(변환본·디컴파일·명령 덤프·원본 캡처)은 공개 제외(.gitignore).
- Kiro IDE MCP 연결은 미검증(아래 KIRO_USAGE 참조).

## 다음

G2 `restored-motion`: M01(이동·해제)·M03(벽)·M02(점프 시작값)을 독립 expected(g1 hlog)로 고정한 비교기와 엔진. holdout M04는 구현 후 1회 판정.

## v8 보강 (2026-11-14)

- 하네스 v8은 xacel/yacel/fx/fy/fxvel/fyvel/fxacel/fyacel/gravity를 추가 기록. v7과 겹치는 필드(n,tick,xv,yv,x,y,xvel,yvel,dir,state)는 231행 전부 동일.
- `docs/evidence/g2/runs/v8_r1..3/hlog.txt` sha256 `c8517f4bdcb44f1cc6ff145d98d94049355634ff0f127eb2012a432707af66df` 3회 동일. v8 holdout `m04v8_r1..3` sha256 `7675fe4a0a4d589218434a9ed73e4e2fd80b6bd3c202bc9b90cb11373f214937` 3회 동일. G2 expected는 v8를 사용한다.
