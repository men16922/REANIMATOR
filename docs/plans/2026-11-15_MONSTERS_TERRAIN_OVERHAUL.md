# 몬스터·지형 전면 개선 계획 (2026-11-15)

요청: 몬스터 움직임이 어색하고 맵·지형이 프로토타입 수준이다. 전면 개선한다.

## 기준선 (관찰, make check exit 0)

- `node --test tests/` 45/45 통과. reach3d 52 waypoints 3431 ticks. 봇 완주 3433 ticks, HP 160, won.
- dist-guard PASS: 13 files, 14,330,458 B, 218 대조.
- 브라우저 검증(`make smoke-local`)은 Chrome 부재로 불가. 모든 시각 항목은 unverified.

## 문제 목록

- 몬스터: yaw 즉시 반전, 이동 없이 walk 애니메이션 재생, 경직 시 idle로 즉시 스냅, 순찰·인지·추적 해제(leash) 없음, crawler/stalker/spitter 공격 전조 없음, crawler/spitter는 clip이 없어 bob만 적용, 피격 플래시가 흰 실루엣으로 포화.
- 지형: 박스 슬랩 위주, 배경이 빈 공간, 동일 텍스처 반복, 구역 정체성 약함.

## 단계

1. **FEAT-002 시뮬**: EnemyState3D에 state/stateTicks/facing/turnTicks/speedNow/homeX. 가속 제한, 회전 지연(히스테리시스), alert 비트, 순찰·복귀, crawler 웅크림 14틱+도약 16틱+회복 40틱, stalker 도약, spitter 카이팅+12틱 조준, 경직 감속. 결정론 유지(Math.random 금지).
2. **FEAT-003 렌더**: 완만한 회전, |vx| 기반 clip timeScale, attack 선딛기, 전용 크로스페이드, clip 없는 모델의 절차 애니메이션(pivot Group), 흰 실루엣 원인 수정(emissive 포화 제한, 종류별 색조), 바닥 전조 데칼, 텔레메트리에 state 추가.
3. **FEAT-004 지형**: `src/render3d/decor3d.ts`와 절차 텍스처(시드 고정 mulberry32). 섹터별 배경벽·파이프·케이블·소품(InstancedMesh), 원경 실루엣, 먼지·증기, 솔리드 립/트러스. 충돌·map3d solids 불변.
4. **FEAT-005 조명·성능·문서**: 섹터별 조명 프리셋, 업그레이드/세이브 발광 완화, draw call·삼각형 텔레메트리, 문서 갱신.

## 성능 예산

- 신규 PointLight 최대 2개(목표 0). emissive 메쉬·InstancedMesh·병합 지오메트리 우선. 추가 draw call 약 120 이하. 이전에 PointLight +5로 fps 60→28 하락한 사례가 있다.

## 검증 목록

- 각 단계 `make check` exit 0, reach3d 52 waypoints 불변, 봇 won(HP ≥ 약 100), 봉인 파일 diff 없음.
- 단위 테스트: 회전 지연, 전조 관찰 가능, 순찰 복귀, 가속 한계, 결정론.
- 브라우저(unverified): 섹터별 스크린샷, 콘솔 오류 0, fps.
