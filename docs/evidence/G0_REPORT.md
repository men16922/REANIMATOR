# G0 보고서

2026-11-14 · Kiro 세션. 판정: **부분 완료 · G1 보류(권리·형식 쟁점)**.

## 항목별 결과

| 항목 | 상태 | 근거 |
|---|---|---|
| spec 작성 | 완료 | `.kiro/specs/abuse-reference/{requirements,design,tasks}.md` |
| 원본 취득·해시 | 완료 | `reference/private/abuse-box.zip` sha256 `5ef911f88284b8deab6fcb0a3ea5779eab54bf781f764c47f7b7b369097d4026`, HTTP 헤더 보존, `unzip -l` 먼저 검사, 해제본 읽기 전용 |
| manifest | 완료 | `reference/manifests/abuse-source.json` (218 파일 해시). `observedVersion`은 null(게임에서 직접 읽지 못함) |
| 버전 | 주장만 | 재포장 info card·BAT가 "Shareware 1.05", zip 내 EXE 일자 1995-09-20. 원본 abuse105.zip 해시는 미확보 |
| 실행 파일 형식 | 관찰 | `file`: LE for MS-DOS, DOS4GW 내장. `strings`: DOS/4GW Professional, WATCOM. 32비트 보호 모드 |
| 자산·권리 | 완료(보수적) | `docs/reference/ASSET_REGISTER.md` |
| 에뮬레이터 | 완료 | DOSBox Staging 0.83.0, `.tools/DOSBox Staging.app` (dmg sha256 `d8a771ad…8bdae8167`). 전역 설치 없음 |
| 원본 실행 | 1회 관찰 | 로그: 텍스트 모드 → `VGA 320x200 256-colour graphics mode 13h`. 캡처 `docs/evidence/g0/run1_t0.png`(인트로 서사 화면). 설정 `reference/work/dosbox-g0.conf`, 로그 `reference/work/dosbox-run1.log` |
| 이동·점프·종료 관찰 | **미수행** | 자동 키 입력은 접근성 권한과 포커스 오입력 위험이 있어 수행하지 않음. 사용자 수동 플레이 또는 승인된 입력 주입 필요 |
| 동일 시작 조건 3회 | **미수행** | 1회만 실행 |
| REA/Ghidra | 미설정 | doctor: Ghidra·Hopper·IDA·JADX·Kuna 모두 미설정. JDK 21(Homebrew) 존재 |

## 핵심 발견 (G1 영향)

1. **형식**: ABUSE.EXE는 MZ stub + DOS/4GW + LE. REA의 DOS provider 문서 경계(16비트 MZ real-mode)를 벗어난다. Ghidra 자체에는 LE 로더가 있으나 REA 경유 지원은 미검증. 억지로 16비트로 해석하지 않는다.
2. **권리**: LICENSE.TXT §1이 역공학을 금지한다. 프로젝트 핵심 전제와 충돌한다.
3. **참고**: 동봉 `LISP/*.LSP`는 평문이며 이동·무기 로직 일부가 스크립트다. Lisp 열람은 소스 열람 열로만 기록한다.

## 사용자 결정 필요

- A. 권리 위험을 수용하고 G1 바이너리 분석 진행(Ghidra 12.x 설치, LE 지원 확인부터).
- B. 공개 Public Domain 소스(`abuse_pd.zip`)와 실행 관찰을 근거로 전환. 계획 문서가 금지한 "소스 포팅으로 원본 역공학 대체"에 해당하므로 계획 변경으로 기록해야 한다.
- C. 실행 관찰·Lisp 스크립트 분석만으로 동작을 계약화(바이너리 디스어셈블 없음).
- D. 대상 게임 변경.

## 다음 행동

- 사용자 결정 후 G1. 결정 전에는 디스어셈블하지 않는다.
- 이동·점프·종료·3회 재현은 사용자가 수동으로 플레이하거나 입력 주입을 허락해야 완료된다.
