# REANIMATOR — Kiro 시작 가이드 v3

2026-11-14 · 대상: Abuse DOS 셰어웨어 · 게임 실행·역공학·구현은 미착수

## 1. 이 문서의 사용법

[제품·일정 계획](docs/plans/REANIMATOR_PLAN.md)이 범위의 기준이다. 이 문서는 사람이 Kiro에서 따라 할 순서와 복사할 프롬프트다. [판정 계약](docs/reference/VERIFICATION_CONTRACT.md)과 [출처](docs/reference/ABUSE_SOURCE_REGISTER.md)를 함께 사용한다.

현재는 계획 작성과 도구 실행 환경 정비까지다. 아래 실행 프롬프트를 Kiro에 전달할 때 해당 단계의 로컬 작업을 시작한다. 커밋·푸시·배포·제출은 별도 사용자 지시 범위를 따른다. 원본 다운로드나 에뮬레이터 실행이 이미 끝났다고 가정하지 않는다.

## 2. Kiro에서 폴더 열기

터미널에서 직접 실행한다. 현재 세션에서는 IDE를 열거나 Kiro 모델을 호출하지 않았다.

```bash
cd /Users/men1692/Desktop/AWS/Kiroween2026
kiro .
```

Kiro IDE 로그인 상태를 확인한다. Kiro 패널에서 새 대화를 열고 아래 첫 프롬프트를 붙인다. 설치 확인값은 IDE 1.4.154, CLI 2.37.1이며 이 가이드는 IDE를 기준으로 한다. CLI와 IDE의 설정 형식을 혼용하지 않는다.

## 3. 첫 프롬프트 — 요구사항과 실행 목록

```text
이 프로젝트는 REANIMATOR다. 실제 배포된 Abuse DOS 셰어웨어 실행 파일을
역공학으로 분석해 일부 동작을 복원하고 3분짜리 새로운 2D 액션으로 재해석한다.

먼저 다음 순서로 읽어라.
1. docs/AGENT_BRIEF.md
2. docs/STATUS.md
3. docs/NEXT_PLAN.md
4. docs/plans/REANIMATOR_PLAN.md
5. docs/reference/VERIFICATION_CONTRACT.md
6. docs/reference/ABUSE_SOURCE_REGISTER.md
7. docs/evidence/TOOLCHAIN.md

이제 .kiro/specs/abuse-reference/의 requirements.md, design.md, tasks.md를
Kiro의 Feature Spec 흐름으로 만들어라. G0/G1만 구체화하고 나머지는 의존 단계로 둬라.
각 task에 작업 파일·명령·산출물·통과 조건·실패 시 다음 행동을 적어라.
기존 Wumpus 계획과 Carbon 리뷰는 과거 이력이다. 현재 대상에 적용하지 마라.

공개된 소스를 다시 빌드한 파일과 현대 SDL 포트를 원본 분석으로 바꾸지 마라.
바이너리 분석·Lisp/소스 열람·실행 관찰·추론을 분리해 기록하라.
게임 구현은 아직 시작하지 말고 spec을 검토 가능한 형태로 제시하라.
새 도구 설치가 필요하면 현재 프로젝트 범위에서 해결하라.
기존 BLACKOUT/REA 작업 트리, 전역 설정을 변경하지 마라.
```

Kiro가 requirements→design→tasks를 제시하면 목표·분석 대상·통과 조건을 확인하고 다음 단계로 진행한다. 이는 Kiro spec 작업 흐름이며 파일마다 별도 허가를 요구하는 규칙이 아니다. 복사한 프롬프트 자체는 Kiro 사용 실적이 아니다.

## 4. REA 연결

프로젝트 전용 도구 실행점은 `scripts/rea.sh`다. 먼저 Kiro 터미널에서 실행한다.

```bash
./scripts/rea.sh --version
```

Kiro 명령 팔레트에서 `MCP`를 검색해 workspace MCP config를 연다. 현재 공식 경로는 `.kiro/settings/mcp.json`이다. 기존 설정이 있다면 백업하고 `mcpServers.rea` 항목만 병합한다. 다음은 **연결 예시**이며 현재 자동 등록했다는 뜻이 아니다.

```json
{
  "mcpServers": {
    "rea": {
      "command": "/Users/men1692/Desktop/AWS/Kiroween2026/scripts/rea.sh",
      "args": ["mcp"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

저장 후 연결 상태와 tools/list를 확인한다. 공급자 설정은 설치된 REA 문서와 실제 `doctor` 결과를 따른다. provider 설치 경로·언어·loader를 추측하지 않는다. MCP 연결 성공과 Abuse 분석 성공은 별도다.

현재 Ghidra·JDK·DOS 에뮬레이터의 사용 가능 여부는 미검증이다. 상세 환경 상태는 [도구 기록](docs/evidence/TOOLCHAIN.md)에 있다. 모든 도구를 전역 자동 승인하거나 클라이언트 전역 설정을 변경하지 않는다.

## 5. 두 번째 프롬프트 — G0 수행

```text
검토한 abuse-reference spec의 G0를 실행하라. 게임 엔진 구현은 시작하지 마라.

1. scripts/rea.sh와 도구 기록을 확인하고 실제 환경 상태를 갱신하라.
2. 원본 DOS 셰어웨어 패키지의 출처와 고지를 확인하고 프로젝트의
   reference/private/에 내려받아 원본을 보존하라. 압축 목록을 먼저 검사하라.
3. 실제 게임 실행 파일과 wrapper/installer를 구분하고 버전·SHA-256·데이터 파일을
   reference/manifests/abuse-source.json에 기록하라. 미확인 값은 null과 이유로 남겨라.
4. docs/reference/ASSET_REGISTER.md에 분석 전용/공개 후보/제외를 파일별로 구분하라.
5. 필요한 에뮬레이터가 없으면 프로젝트 범위 설치를 우선하라. 설치할 수 없으면
   정확한 필요 도구와 이유를 기록하라. 원본 실행 없이 성공 처리하지 마라.
6. 고정 환경에서 시작→이동→점프→종료를 관찰하고 같은 시작 조건을 3회 확인하라.
   수동 입력 관찰은 결정적 replay와 구분하라.
7. docs/evidence/G0_REPORT.md와 docs/KIRO_USAGE.md를 작성하고 진입 문서를 갱신하라.

G0의 완료/실패/미확인을 보고하라. G1은 다음 작업으로 남겨라.
커밋·푸시·외부 공개·유료 API 호출은 하지 마라.
```

G0 결과에서 직접 볼 항목: 원본 플레이 캡처, 실제 파일 해시, 권리 예외, 다음 분석 대상. 이 네 가지가 없다면 다음 단계로 넘어가지 않는다.

## 6. 세 번째 프롬프트 — G1 수행

```text
G0 결과를 읽고 G1 역공학 가능성 조사를 수행하라.

실행 파일의 stub/extender/실제 게임 코드 영역을 먼저 구분하라.
REA tools/list의 실제 schema를 사용하고 결과의 원문과 입력 해시를 보존하라.
첫 질문은 이동 입력→위치 갱신→벽 충돌의 연결이다.
함수 이름을 추정해 호출하지 말고 실제 발견한 함수/주소를 사용하라.
정적 후보를 벽 있음/없음, 키 누름/해제의 실행 관찰과 교차 검증하라.
Lisp/소스에서 읽은 정보는 별도 열로 표시하라. 블라인드 분석이라 부르지 마라.

환경 정리 1시간+분석/실행 3시간 이내에 조사 결과를 정리하라.
실제 게임 경로 1개+실행 연결+측정 가능한 입력/출력 계약이 완료 기준이다.
stub만 분석됐거나 원본 재현이 불안정하면 실패 또는 미확인으로 보고하라.
REA가 지원하지 않는 포맷은 억지로 16비트로 해석하지 마라.
대상 변경·소스 포팅 전환·REA 자체 대규모 개조는 자동으로 하지 마라.

docs/reconstruction/BEHAVIOR_MAP.md, docs/evidence/G1_REPORT.md,
docs/KIRO_USAGE.md와 진입 문서를 갱신하라. 게임 구현은 아직 시작하지 마라.
```

REA CLI를 쓰는 경우의 형태는 아래와 같다. G0가 확정한 절대 경로로 바꾸고 해당 provider의 지원이 확인된 뒤 사용한다. 이 명령을 이미 성공한 기록으로 복사하지 않는다.

```bash
./scripts/rea.sh inspect /ABSOLUTE/PATH/TO/VERIFIED/GAME.EXE --provider ghidra --json
```

## 7. G2 이후의 Kiro 작업 단위

| Spec | 선행 조건 | 만들 것 |
|---|---|---|
| `abuse-reference` | 없음 | G0/G1, 원본·권리·분석·관찰 계약 |
| `restored-motion` | G1 통과 | 이동·점프·충돌·비교기·Canvas·gate |
| `reanimated-slice` | G2 통과 | 사격·적·맵·결과·조명 |
| `evidence-and-release` | 게임 흐름 완결 | 근거 화면·회귀·플레이 관찰·제출 후보 |

각 spec은 requirements/design/tasks로 관리한다. 한 번에 전체 게임 자동 생성을 요청하지 않는다. 다음 공통 프롬프트의 단계명만 바꾼다.

```text
직전 단계의 실제 보고서와 docs/NEXT_PLAN.md를 읽어라.
선행 통과 조건을 확인하고 다음 spec을 requirements→design→tasks 순으로 구체화하라.
검토된 task를 한 단위씩 구현하고 해당 검사를 실행하라.
expected를 새 엔진에서 만들거나 fixture를 자동 갱신하지 마라.
실패는 입력→원인→수정→같은 조건 재검증 순으로 기록하라.
각 완료 단위마다 상태와 다음 작업을 갱신하되 실제 실행한 결과만 적어라.
```

G2에서 npm scripts와 Makefile을 실제로 만든 뒤 harness의 `make check`/`make smoke-local`과 맞춘다. 현재 설정의 `engine=claude`는 scaffold 이력이며 Kiro 직접 작업에 사용하지 않는다. overnight loop는 시작하지 않는다.

## 8. Kiro 기여 기록과 hook

`docs/KIRO_USAGE.md`에는 날짜, spec/task, Kiro가 수행한 내용, 관련 파일, 실행 명령, 결과, 증거 경로를 적는다. Codex 계획·도구 정비를 Kiro 작업으로 바꾸지 않는다.

G2 검사 명령이 생긴 뒤 Kiro UI에서 엔진 변경에 관련 검사를 실행하는 hook을 만든다. 실제 트리거 1회를 실행해 결과를 남긴다. hook이 expected를 갱신하게 하지 않는다. 설정 파일 존재만으로 실사용 완료 처리하지 않는다.

제출 후보에는 실제 실패의 수정 전후 사례 1개를 남긴다. 고의 comparator 오류는 개발 버그와 구분한다.

## 9. 사용자가 확인할 짧은 체크포인트

- G1: 이 파일을 실제 분석했는가? 게임 코드인가? 무엇을 아직 모르는가?
- G2: 원본과 어느 동작이 얼마나 일치하는가? 새로운 입력에서도 유지되는가?
- G3: 설명 없이 조작하고 시작부터 끝까지 플레이할 수 있는가?
- G5: 조명 선택이 재미있는가? 처음 보는 사람이 다시 플레이하는 이유가 있는가?
- G6: 공개할 실제 빌드·영상·설명·권리 고지·Kiro 기록이 모두 준비됐는가?

공식 안내: [Specs](https://kiro.dev/docs/specs/) · [MCP](https://kiro.dev/docs/mcp/configuration/) · [Steering](https://kiro.dev/docs/steering/) · [Hooks](https://kiro.dev/docs/hooks/).
