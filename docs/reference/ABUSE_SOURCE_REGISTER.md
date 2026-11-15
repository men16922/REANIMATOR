# Abuse 원본·권리·분석 도구 등록부

2026-11-14 · 사전 조사. 게임 패키지 다운로드·실행·파일별 권리 확인은 아직 안 했다.

## 원본 후보와 근거

| 자료 | 확인한 내용 | 다음 행동 |
|---|---|---|
| [DOS 셰어웨어 배포](https://www.dosgamesarchive.com/download/abuse) | `abuse-box.zip`, DOSBox용 설치 패키지 항목 | 페이지에서 실제 다운로드 링크를 확인하고 package·EXE·data 해시 기록 |
| [원개발사 README 보존본](https://sources.debian.org/src/abuse/2.00-12/README) | 소스 공개, 셰어웨어 데이터 활용 범위, 상표·정식판 데이터·효과음 예외 | 선택 패키지 고지와 대조, 불일치 시 공개 후보에서 제외 |
| [현대 포트](https://github.com/Xenoveritas/abuse) | 별도 포트가 이미 존재, 소리/음악의 권리 불확실성 안내 | 보조 자료로만 사용. 원본 DOS 바이너리로 대체하지 않음 |
| [REA](https://github.com/morluto/rea) | 공식 배포 6.9.0 실행·MCP 사전 시험 성공 | Ghidra 및 대상 지원 검증 |

`abuse-box.zip`은 배포 페이지의 이름이다. 순정 역사 패키지인지 재포장인지 아직 판정하지 않았다. repack이면 그 사실과 포함 파일 provenance를 기록한다. 버전 번호를 2.00 등으로 미리 고정하지 않는다. 가능하면 다른 신뢰할 수 있는 배포 기록과 EXE 해시·버전 표기를 대조한다.

## 파일별 채택 원칙

분석 입력으로 확보하는 것과 공개물에 포함하는 것은 별도다. G0에서 `ASSET_REGISTER.md`를 만들고 파일·해시·원출처·고지·수정 범위·분석 전용/공개 후보/제외를 기록한다.

- 소스: 공개 고지 범위와 실제 파일 고지를 확인한다. 후대 포트 코드는 별도 라이선스일 수 있다.
- 셰어웨어 데이터: 공개 고지와 실제 패키지의 대응을 확인한 파일만 재사용 후보로 둔다.
- 효과음: 원개발사 고지의 예외가 있다. 원본 WAV를 신규 게임에 복사하지 않는다.
- 음악: 별도 권리 확인 전 제외한다. 직접 제작하거나 조건이 명확한 대체 소리를 사용한다.
- 정식판 전용 데이터: 셰어웨어 고지로 허용됐다고 판단하지 않는다.
- 이름/로고: 원작의 공식 후속작처럼 표시하지 않는다. 신규 제품명과 독자 시각 자산을 사용한다.
- 원본 캡처·분석 출력도 공개 전 검토한다. 원본 EXE 전체를 정적 웹 빌드에 포함하지 않는다.

공개 고지가 모든 국가·자산·상표 문제를 일괄 해결한다는 보장은 아니다. 이 등록부의 목적은 실제 사용할 파일의 근거와 남은 불확실성을 구체적으로 남기는 것이다.

## 원본 manifest 필드 — G0에서 생성

`reference/manifests/abuse-source.json`: sourcePage, resolvedDownloadUrl, retrievedAt, packageFilename, packageSha256, packageProvenance, claimedVersion, observedVersion, gameExecutablePath, executableSha256, executableFormat, dataFiles[{path,sha256}], notices[{path,sha256}], transformations, unresolved.

미확인 값은 null과 사유로 남긴다. 분석에 사용한 변환본은 별도 해시와 원본 매핑을 기록한다.

## 로컬 확인한 REA 경계

기존 소스 checkout: `/Users/men1692/Desktop/AI/rea`, revision `e8c838e8bd4fe46f06aaefea793fcc39b00b50de`.
이번 프로젝트의 실제 실행점은 `scripts/rea.sh`와 [도구 기록](../evidence/TOOLCHAIN.md)이다.

checkout의 `docs/providers/ghidra-dos.md`는 Ghidra 12.x(>=12.1)와 해당 릴리스가 요구하는 JDK, 16비트 DOS MZ/COM 경로를 기술한다. NE/LE/LX는 명시적으로 미지원이며 MZ real-mode 진입을 벗어나는 DOS extender도 경계 밖이다. 파일 끝 overlay는 해시에 포함돼도 초기 로드 코드 분석 범위에서 제외될 수 있다.

따라서 Abuse 파일을 받기 전에는 REA 지원을 확정하지 않는다. 원본 stub의 분석 성공과 게임 코드 복원 성공을 별도로 판정한다.

## 레벨 관찰 (2026-11-16)

- `LEVELS/LEVEL00~04.SPE`(+`.CPF`)를 읽기 전용으로 파싱(개수·크기·좌표만 기록)하고 작업 사본(`reference/work/levels_obs/`, gitignored)에서 DOSBox로 실행했다. 원본 바이트·화면은 저장소와 `dist/`에 없다. 방법별 결과: [ABUSE_LEVEL_OBSERVATION.md](ABUSE_LEVEL_OBSERVATION.md).
