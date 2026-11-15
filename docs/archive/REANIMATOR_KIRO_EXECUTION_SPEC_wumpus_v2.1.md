# REANIMATOR — Kiro 실행 명세 v2.1

2026-11-14 · 재기획 적용 · **현재 단계: 계획, 구현 미착수**

> 제품 방향은 [재기획](../plans/REANIMATOR_PLAN.md)이 정한다.
> 이 파일은 작업 순서, 완료 조건, 실행 기록의 기준이다.

## 1. 제품 계약

**고전 Wumpus를 브라우저에서 복원하고, 정보와 화살을 맞바꾸는 Blackout 변형을 만든다.**

- Classic: ESR Wumpus 1.12의 확인된 규칙을 재구현한다.
- Blackout: Classic 위에 하나의 독창적 규칙을 추가한다.
- Evidence: 보존한 규칙, 의도적으로 변경한 규칙, 미검증 범위를 설명한다.
- 개발 도구: Kiro를 실제 개발에 사용한다. REA는 제한된 분석 조사에 사용한다.
- 웹 사용자는 로그인·LLM·개발 도구 없이 플레이한다.

과거 v1의 범위·일정·실행 지시는 대체됐다. [v1 보관본](REANIMATOR_KIRO_EXECUTION_SPEC_v1.md)은 이력이며 실행 진입점이 아니다. 검증 계약은 별도 문서로 보존했다.

## 2. 시작 전에 확인할 것

1. `docs/AGENT_BRIEF.md` → `docs/STATUS.md` → `docs/NEXT_PLAN.md`를 읽는다.
2. 실제 파일과 Git 상태를 확인한다. 현재 폴더는 조사 시 Git 저장소가 아니었으며 harness 문서·설정만 있었다.
3. 기존 BLACKOUT·REA 저장소를 수정하거나 자산을 일괄 복사하지 않는다.
4. P0에서 원본 배포본, 라이선스, 빌드, 입력, 난수, 종료 동작을 확인한다.
5. Kiro 실제 실행 기록이 없으면 `Kiro usage: NOT VERIFIED`로 유지한다.

이 명세가 존재한다는 사실은 구현 시작·외부 게시 허가가 아니다. 사용자가 요청한 현재 범위는 계획과 Carbon 리뷰다.

## 3. 작업 분담

| 역할 | 책임 | 기록 |
|---|---|---|
| Kiro | 요구사항·설계·구현·hook 기반 검증·실제 실패 수정 | `.kiro/`와 `docs/KIRO_USAGE.md` |
| REA | 허가된 원본 바이너리의 함수·난수 관련 근거 조사 | revision·실제 도구·입력 해시·출력·한계 |
| Codex | 계획·검토·재현성 점검·리뷰 반영 | 변경 문서·검사 결과 |
| Gemini 4 Carbon | 독립적인 계획 비평 | 입력본·raw 응답·반영/보류 사유 |
| 사용자 | 재미·화면·청취 판단, 공개·제출 의사 결정 | 짧은 관찰 기록과 선택 |

Codex·Carbon의 작업을 Kiro 사용으로 기록하지 않는다. 일반 개발 과정에 사용하지 않은 Crew·MCP·Powers를 출품 설명에 추가하지 않는다.

## 4. 구현 단계

| 순서 | 할 일 | 완료 조건 |
|---|---|---|
| P0 | 원본·권리·출처 고정, REA 2시간 조사, 화면 설계 | 같은 조건 원본 3회 재현, 입력/종료 확인, 분석 성공 또는 제한 기록 |
| P1 | 계측 패치·trace·TS 최소 엔진·한 화면 | 원본/계측 stdout·종료 일치, 3개 실제 시나리오 비교, 시작→종료 |
| P2 | Classic 완결·Blackout 한 규칙·설명 화면 | 변형의 규칙 순서 확정, 모드별 검증, 90초 시연 가능 |
| P3 | 회귀 수정·Kiro 기록·사용자 관찰 | 실패 원인과 수정 근거. 시험 전 범위 동결 |
| P4 | 추가 시나리오·UI·소리·접근성·재현 안내 | 의미 있는 약 10개 사례, 별도 추가 사례, 키보드/좁은 화면 검사 |
| P5 | 빌드·영문 설명·영상·공개 후보 | 깨끗한 환경 실행, 링크·라이선스·출처·Kiro 기록 확인 |

세부 일정과 중단 조건은 [계획 §7](../plans/REANIMATOR_PLAN.md#7-일정-결과물로-다음-단계-결정)을 따른다. 단계 통과 전 다음 기능을 늘리지 않는다.

## 5. 파일 구조

| 경로 | 책임 |
|---|---|
| `src/engine/classic/` | UI와 분리된 원본 규칙 |
| `src/engine/blackout/` | 명시적 변경 규칙 |
| `src/reference-contract/` | 입력·trace·결과 스키마 |
| `src/comparison/` | 원본 호환 및 변경 규칙 판정 |
| `src/ui/` | 플레이·결과·복원 설명 |
| `reference/upstream/`, `reference/patches/` | 원본과 계측 변경 분리 |
| `reference/fixtures/`, `tools/reference/` | 실제 expected와 생성/재현 도구 |
| `docs/evidence/rea/` | 공개 가능하도록 검토한 REA 근거 |
| `.kiro/specs/`, `.kiro/steering/`, `.kiro/hooks/` | 실제 Kiro 작업 |

위 경로는 구현 계약이다. 현재 파일이 존재한다고 가정하지 않는다. React/TypeScript/Vite, Python reference runner를 기본으로 하고 설치된 버전·lockfile을 기록한다.

## 6. 반드시 지킬 검증 계약

[검증 계약](../reference/VERIFICATION_CONTRACT.md)을 구현 전에 읽는다.

- 원본과 계측본은 같은 입력에서 같은 관찰 결과를 내야 한다.
- C와 TS에 같은 seed를 줬다고 동일한 난수라고 가정하지 않는다. 검증에서는 raw random tape를 사용한다.
- expected는 원본 runner에서만 생성한다. TS가 만든 정답으로 TS를 검증하지 않는다.
- PASS·FAIL·ERROR·NOT RUN을 구분한다. 실행 실패를 게임 패배로 바꾸지 않는다.
- 실제 발견한 버그와 의도적 demo mutation을 구분한다.
- 검증 모드와 일반 자유 플레이의 난수 계약을 구분한다.
- 조명은 난수를 쓰지 않는다. 첫 조명 이후는 원본 trace 비교를 중단하고 별도 요구사항·불변조건으로 판정한다. 자체 TS 엔진을 독립 오라클로 취급하지 않는다.

## 7. 실제 Kiro 사용 흐름

1. Specs로 reference 계약·Classic·변형·UI의 요구사항/설계/작업을 작성한다.
2. Steering에 원본 보존·출처·expected 독립·모드 구분을 적는다.
3. 현재 Kiro 형식에 맞는 hook을 구성하고 실제 동작을 확인한다.
4. 엔진 변경에 관련 검사만 연결한다. fixture를 자동 갱신하지 않는다.
5. 실제 실패 하나의 입력→원인→수정→재검증을 기록한다.

REA MCP 연결은 설치된 문서와 도구 목록을 확인한 후 프로젝트 범위로 구성한다. 설정의 존재와 실제 호출 성공을 구별한다.

## 8. 명령과 완료 기록

구현 시 `dev`, `typecheck`, `test`, `test:e2e`, `build`, `reference:build`, `reference:verify`, `reference:capture`, `verify`를 npm script 또는 동등 명령으로 제공한다.

현재는 실행 명령이 구현되지 않았다. `make check`도 아직 정의되지 않았다. 계획 문서 검사와 앱 테스트 통과를 구분한다.

작업마다 `docs/PROGRESS_LOG.md`에 변경·명령·결과·한계·다음 행동을 남긴다. 평가 데이터는 `docs/EVALUATION.md`, 사전 작업은 `docs/PREEXISTING_WORK.md`, 라이선스는 `THIRD_PARTY_NOTICES.md`로 연결한다.

## 9. 제출 완료와 구현 완료를 구별한다

- 구현: 실제 플레이·비교·모드 구분·검증·빌드가 동작한다.
- 제출 준비: 영문 README·Kiro 사용 설명·3분 미만 시연·공개 후보·권리 고지가 준비됐다.
- 제출: 허가된 공개 작업 후 실제 앱 URL·공개 GitHub·YouTube·Devpost 상태를 확인했다.

마감은 2026-12-05 07:00 KST. 심사 접근은 최소 2027-01-30 06:00 KST까지, 제출 자료 동결은 결과 발표까지 유지한다. 일정 변경 여부는 실제 제출 전에 재확인한다.

공식 근거: [Overview](https://kiroween.devpost.com/) · [Rules](https://kiroween.devpost.com/rules) · [원본 후보](https://www.catb.org/~esr/wumpus/).
