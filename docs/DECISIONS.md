# 설계 결정

2026-11-14 · 현재 기준 v3

| 결정 | 이유 | 영향 |
|---|---|---|
| Abuse DOS 셰어웨어 | 사용자가 실제 바이너리 역공학과 액션 복원을 선택 | 배포본/포맷/권리 확인은 G0/G1 |
| 원본 실행 파일을 기준으로 분석 | 소스 포팅만으로 목표를 충족할 수 없음 | 현대 포트·자체 빌드를 원본으로 대체하지 않음 |
| 핵심 동작 복원+3분 신규 게임 | 전체 복원은 일정 위험이 큼 | 복원/신규 설계·관찰 범위를 명시 |
| 브라우저 Canvas 2D | 설치 없는 PC 체험과 작은 구현 범위 | 터치 플레이·3D는 기본 범위 밖 |
| 조명 규칙은 신규 설계 | 복원 결과에 독창적 플레이 추가 | 원본 호환 판정과 분리 |
| G1에서 실제 코드 경로 필수 | stub 분석·도구 설치를 성과로 과장하지 않음 | 4시간 탐색 뒤 계속/축소 판단 |
| REA 공식 배포본과 전용 Node | 공유 checkout 빌드 누락·Node 요구 불일치 해결 | 전역 Node·기존 REA WIP 보존, 프로젝트 wrapper 사용 |
| Kiro 실제 구현 | 출품 필수 도구와 기여 근거 | Codex 계획/정비를 Kiro 실적으로 세지 않음 |

[Wumpus 결정 보관본](archive/DECISIONS_wumpus_v2.1.md)은 현재 권위가 아니다. 사용자 지시가 바뀌면 진입 문서와 함께 갱신한다.

## 2026-11-14 — G1을 옵션 A(바이너리 분석)로 진행
- 사용자가 권리 위험(ABUSE/LICENSE.TXT §1 역공학 금지)을 인지한 상태에서 A를 지시. Kiro 추천은 C였음.
- 조건: 원본 EXE·데이터·분석 DB는 공개물에 포함하지 않음. 분석은 로컬 연구용. 법률 자문 아님.

## 2026-11-14 — G3: 원본 사격 관찰(C01) 중단, 사격은 신규 설계
- 하네스로 발사 입력을 두 위치에 넣었으나 반영되지 않음(로그 바이트 동일). 시간 예산 안에서 원인 미확인.
- 결정: C01은 NOT RUN으로 남기고 무기·적·피해는 new-design으로 구현. "How it was revived" 패널에 사격은 복원이 아님을 명시.

## 2026-11-14 — G3: 스모크 브라우저는 설치된 Chrome 채널
- Playwright 번들 headless shell이 이 Mac에서 프레임을 생성하지 않음(rAF 0/s). 시스템 Chrome을 읽기 전용 사용, 없으면 NOT RUN.

## 2026-11-15 — Full 3D Side-View Metroidvania 전환 및 Kiro 전면 인계
- Decision: 기존 Quarter-View 트윈스틱 3D에서 **Side-View XY 6섹터 Metroidvania 3D**(`Cryo Airlock`, `Central Transit Shaft`, `Sunken Mines`, `Bio-Labs`, `Upper Security Deck`, `Core Vault`)로 전환하고, Wave 1 기반 위에 Wave 2–3 잔여 구현·검증·커밋을 **Kiro(IDE / `kiro-cli`)에 전면 이관**한다.
- Reason: Quarter-View의 Y/Z 투시 착시·옆걸음 스케이팅·`operative.glb` 점프 클립(`0.00~0.50s` 지상 웅크림 + `+0.42m` 루트 스파이크) 결함을 근본 해결하고, 사용자 요청에 따라 이후 개발을 Kiro 중심으로 진행하기 위함.
- Impact: `types3d.ts`, `motion3d.ts`, `map3d.ts`, `riggedModels.ts`, `minimap.ts`/HTML/CSS/Audio와 `.kiro/specs/metroidvania-3d/` 및 `docs/plans/KIRO_METROIDVANIA_HANDOFF.md`를 정립했으며, 봉인 파일(`motion.ts` 등 R8)은 무수정 유지한다. Wave 2 완료 전까지는 중간 컴파일 미완(`world3d.ts` 2오류) 상태다.

## 2026-11-16 — Meshy 티어는 t2.5 smart-topology
- Decision: 터레인 킷 11종을 meshy-t2.5(smart-topology, 4k tris, PBR)로 생성한다.
- Reason: 인스턴싱 draw call 한도(300)와 파일 크기 안에서 7.1 대비 샘플 비교(`cd2e7fb`)로 충분한 품질을 확인. 총 165 credits.
- Impact: 킷 추가는 Bio-Labs 299 calls로 여유가 없다. 추가 조각 전에 병합·트림 필요.

## 2026-11-16 — Metroid는 역공학하지 않고 설계 영감만 사용
- Decision: Metroid 계열 능력·구조는 공개된 설계 개념만 참고해 신규 구현한다(Blast Core, Scan Lens, Thermal Plating 등). 바이너리 분석·에셋 추출은 하지 않는다.
- Reason: IP 위험. Abuse 역공학(옵션 A)과 달리 사용자 지시가 없다.
- Impact: 원본 에셋·코드·명칭을 쓰지 않고 `dist-guard`와 문서에 "영감" 범위만 기록.

## 2026-11-17 — 정적 호스팅은 S3(비공개) + CloudFront(OAC)
- Decision: 제출 데모를 서버 없이 S3 비공개 버킷 + CloudFront로 배포한다(`infra/site.yaml`, `us-west-2`, `*.cloudfront.net`).
- Reason: 게임이 정적 파일 22 MB뿐이라 서버·DB가 필요 없고, 무료 한도 안에서 HTTPS와 보안 헤더를 얻는다. 해커톤 규정상 AWS 배포는 필수가 아닌 것으로 보이나(원문 미확인) 심사자가 바로 플레이할 수 있다.
- Impact: 재배포는 `make check && infra/deploy.sh`. 삭제는 버킷 비우기 후 스택 삭제(`infra/README.md`). 예산 알림은 아직 없다.
