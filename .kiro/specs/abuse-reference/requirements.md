# abuse-reference — Requirements (G0/G1)

작성: 2026-11-14 · Kiro 세션. G0/G1만 구체화. G2 이후(`restored-motion` 등)는 의존 단계.

## 목표

실제 배포된 Abuse DOS 셰어웨어 실행 파일에서 게임 코드 경로 1개(이동 입력→위치 갱신→벽 충돌)를
주소·명령·실행 관찰로 연결할 수 있는지 판정한다. 게임 구현은 하지 않는다.

## 범위 밖

- 게임/UI 구현 (G1 통과 전 금지)
- 공개 소스 재빌드, 현대 SDL 포트 분석으로 원본 바이너리 분석을 대체하는 것
- 커밋·푸시·공개·유료 API
- 기존 BLACKOUT/REA 작업 트리와 전역 설정 변경

## Requirements (EARS)

### G0 — 원본·권리·실행

- R0.1 WHEN 원본 패키지를 받으면, THE system SHALL 출처 URL·취득시각·SHA-256을 `reference/manifests/abuse-source.json`에 기록한다. 미확인 값은 null + 사유.
- R0.2 THE system SHALL 압축 해제 전 목록을 검사하고, installer/wrapper와 실제 게임 EXE·데이터·고지 파일을 구분한다.
- R0.3 THE system SHALL `docs/reference/ASSET_REGISTER.md`에 파일별 분석 전용/공개 후보/제외를 기록한다. 효과음·음악은 기본 제외.
- R0.4 THE system SHALL 원본 파일을 `reference/private/`에 읽기 전용으로 보존하고, 작업 사본과 해시로 매핑한다.
- R0.5 IF 에뮬레이터가 없으면, THEN 프로젝트 범위(`.tools/`)에 설치를 시도하고, 불가 시 필요한 도구·이유를 기록한다. 원본 실행 없이 성공 처리하지 않는다.
- R0.6 THE system SHALL 시작→이동→점프→종료를 관찰하고 동일 시작 조건을 3회 확인한다. 수동 관찰과 결정적 replay를 구분한다.
- R0.7 THE system SHALL `docs/evidence/G0_REPORT.md`와 `docs/KIRO_USAGE.md`를 실제 수행분만으로 작성한다.

### G1 — 분석 가능성

- R1.1 THE system SHALL EXE의 MZ stub/extender/실제 코드 영역을 구분하고, REA provider가 로딩한 범위를 기록한다.
- R1.2 IF 포맷이 REA 지원 밖(NE/LE/LX, extender 이후)이면, THEN 억지로 16비트로 해석하지 않고 미지원으로 보고한다.
- R1.3 THE system SHALL 이동 입력→위치→벽 충돌 경로 1개를 실제 발견한 주소/함수로 연결하고 실행 관찰과 교차 검증한다.
- R1.4 THE system SHALL 입력 replay·초기 상태·측정 오차 계약을 `docs/reference/VERIFICATION_CONTRACT.md` 형식에 맞춰 정한다.
- R1.5 THE system SHALL 바이너리 분석 / Lisp·소스 열람 / 실행 관찰 / 추론 / 신규 설계를 별도 열로 기록한다.
- R1.6 THE system SHALL 환경 정리 1h + 분석·실행 3h 상한 안에 통과/실패/미확인을 판정한다.
- R1.7 THE system SHALL `docs/reconstruction/BEHAVIOR_MAP.md`, `docs/evidence/G1_REPORT.md`를 작성한다.

## 통과 조건

- G0: 원본 플레이 캡처, 실제 파일 해시, 권리 예외, 다음 분석 대상 4가지가 모두 있다.
- G1: 실제 게임 경로 1개 + 실행 연결 + 측정 가능한 입출력 계약. stub만 분석됐거나 재현 불안정이면 실패/미확인.
