# 기존 작업과 신규 기여

2026-11-14 · Abuse v3 계획과 도구 준비 등록부. 게임 코드·자산은 아직 가져오지 않았다.

| 출처 | 확인한 revision / 위치 | 이번에 실제 사용한 것 | 향후 사용 조건 |
|---|---|---|---|
| MYTHOS: BLACKOUT | `/Users/men1692/Desktop/Game/Diablo Reverse`, `slice/power-grid`, `6854243` | 기획·상태·설계 교훈을 읽어 계획에 참고 | 코드/자산을 가져오면 파일·라이선스·변경 범위 별도 기록 |
| REA | `/Users/men1692/Desktop/AI/rea`, 6.9.0, `e8c838e8bd4fe46f06aaefea793fcc39b00b50de` | README·CLI 안내·MIT 라이선스 확인 | 분석 실행 전 버전 고정, 실제 입력/출력·provider 기록 |
| Wumpus | ESR 1.12 공개 프로젝트 페이지 | 이전 계획의 후보 | v3에서 대체. 보관 문서만 유지 |
| Abuse | DOS 셰어웨어 배포 페이지·원개발사 README | 대상 선정과 계획 근거 | 패키지·EXE·파일별 고지 확인 전 |
| REA 공식 배포본 | npm 6.9.0 | 프로젝트 CLI/MCP 사전 시험 | 게임 분석 미실행, toolchain manifest 참조 |
| Node 공식 배포본 | 26.13.1 darwin-arm64 | REA 실행 환경 | 프로젝트 `.tools` 전용, 공개 앱과 별개 |
| 실행 명세 v1 | `docs/archive/REANIMATOR_KIRO_EXECUTION_SPEC_v1.md` | 기존 검증 계약을 분리 보존 | 현재 실행 진입점은 v3 |
| overnight-harness | 설치 캐시 1.9.0, engine adapter 헤더 2.0.0 | 공통 `agy_invoke critic`을 호출한 계획 리뷰 | runner 코드를 이 저장소에 복사하지 않음 |

BLACKOUT의 기록된 dev-385 게임·성능·테스트 성과는 이번 세션에서 재실행하지 않았다. REA의 기존 untracked `scripts/fixtures/dotnet-bundle/obj/`, `tests/fixtures/nativeaot/obj/`는 건드리지 않았다.

## 신규 작업

현재 신규 산출물은 Abuse v3 계획·Kiro 인계·검증 계약·출처 등록부 및 프로젝트 도구 실행 환경이다. 기존 Carbon 리뷰와 반영은 Wumpus 계획에 대한 이력이다. 브라우저 엔진·조명·UI·실제 바이너리 분석은 앞으로 할 작업이다.

## 공개 전 갱신

로컬 절대 경로는 공개 독자에게 필요한 출처 URL과 revision으로 바꾼다. 개별 자산의 재배포 조건을 확인하고, 실제 포함 파일을 등록한다. 공개 여부가 정해지기 전 이 문서를 제출 완료 증거로 사용하지 않는다.
