# abuse-reference — Design (G0/G1)

## 디렉터리

```
reference/private/          원본 패키지·해제본 (읽기 전용, 공개 제외)
reference/manifests/        abuse-source.json
docs/reference/ASSET_REGISTER.md
docs/evidence/G0_REPORT.md, G1_REPORT.md
docs/reconstruction/BEHAVIOR_MAP.md
.tools/                     프로젝트 범위 도구 (node, rea, 에뮬레이터)
```

## 흐름

1. 도구 상태: `scripts/rea.sh doctor --json`, java/Ghidra/에뮬레이터 탐지.
2. 취득: 배포 페이지 → 실제 링크 → 다운로드 → SHA-256 → `unzip -l` 검사 → 해제.
3. 분류: 파일 시그니처(`file`, MZ 헤더, extender 문자열)로 EXE 종류 판정.
4. 실행 관찰: 프로젝트 범위 DOSBox 계열 + 고정 conf. 시작 조건 3회. 캡처는 evidence에 저장.
5. REA 분석(G1): provider 지원 확인 → `inspect` → 이동/충돌 후보 → 실행 관찰과 교차 검증.
6. 판정: VERIFICATION_CONTRACT.md 기준. 실패 시 원인·다음 행동 기록.

## 증거 분리 원칙

| 열 | 내용 |
|---|---|
| binary | REA/Ghidra 출력(주소, 명령) + 입력 해시 |
| source | Lisp/공개 소스에서 읽은 것 |
| observed | 에뮬레이터 실행 관찰 |
| inferred | 위 근거에서의 추론 |
| designed | 새 게임 설계 |

## 위험과 대응

- Abuse DOS는 32비트 extender(DOS/4GW 계열) 가능성이 있다. REA DOS provider는 MZ real-mode 한정 → 미지원이면 G1 실패/미확인으로 보고하고 대상 변경은 사용자 결정.
- 에뮬레이터 부재: `.tools/`에 공식 릴리스 바이너리 설치 시도.
- 권리: 파일별 고지가 불확실하면 공개 후보에서 제외.
