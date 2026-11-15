# 다음 작업

Wave 2–3 완료. 남은 것은 푸시 승인과 사람 관찰이다.

## 사용자 확인 필요

- `git push origin main` 승인(현재 로컬 커밋만 존재).

## G5 — 사람 플레이 관찰

- `npm run dev`로 1회 이상 직접 플레이해 감각·난이도·탐험 흐름을 [EVALUATION.md](EVALUATION.md)에 기록.
- 관찰 후보: 머리 회전·방향 전환·점프 포즈의 자연스러움, 어두운 샤프트 가독성, 부츠 필수 구간(Shaft 4.4 m, Security 4.4 m)의 체감·막힘 여부, 봇 대비 사람 난이도, 미니맵 확장(Tab).

## G6 — 최종 정리·제출 준비

- 문서 링크(archive 제외)·`make check` 확인 완료. 남음: 실제 Chrome 환경에서 `make smoke-local`과 `capture-showcase.ts` 재실행(맵 변경 후), G5 사람 플레이, `git push`(사용자 승인 대기).

## 개선 계획(2026-11-15 수행 완료)

- [x] 난이도 측정 도구 `make difficulty`(`tools/game/difficulty.ts`) + 테스트.
- [x] `PCFShadowMap`, vite `three` 청크 분리, 아카이브 링크 수정, riggedCount 원인 문서화.
- [ ] 남음: Chrome 환경에서 `make smoke-local`·showcase로 그림자·청크 변경 확인, G5 사람 플레이, 푸시 승인.

## 재귀 개선 2차(2026-11-15)

- [x] 샤프트 좌상단 하늘색 사각형·좌하단 연두색 삼각형 원인 추정: 문(`door-airlock-shaft` blue y0–3.6, `door-shaft-mines` green y-11~-7.4, x=23.6–24.4, z±3.2)의 측면(깊이 6.4 m)이 원근으로 보이며, 균일 emissive 0.85 + 블룸으로 단색화됨. 수정: 문 재질에 `emissiveMap`(hazard/wall 텍스처) 적용, emissiveIntensity 0.6, 펄스 0.5±0.15. 브라우저 시각 확인은 unverified.
- [x] 샤프트 가독성: HemisphereLight 강도 1.15→1.35, 지면색 0x242028(PointLight 추가 없음, fps 비용 없음).
- [ ] 브라우저 재확인: `__reanimatorAdvance([], {x:30,y:1,boots:true,openDoors:[]})` 후 스냅샷으로 샤프트 좌측 문 면이 줄무늬 질감이며 단색 면이 없는지, 콘솔 오류 0, fps 확인. 이어서 `__reanimatorRunBot(4000)`으로 완주 유지 확인.

## 재귀 개선 3차(2026-11-15)

- [x] Acid 블룸 과다 완화: acid 재질 emissiveIntensity 1.35→0.5, acid PointLight 5/11→3/9, UnrealBloomPass strength 0.42→0.36, radius 0.32→0.3, threshold 0.84→0.9, 출구 포털 링 emissive 1.9→1.3. 시각 확인 unverified.
- [x] HUD 목표 줄 고정: `index.html`에 `.hud-break`(flex-basis 100%)를 OBJ 칩 앞에 추가해 OBJ를 항상 둘째 줄에 배치.
- [ ] 브라우저 재확인: `__reanimatorRunBot(700)`(mines)·1500(biolabs) 스크린샷에서 acid 면이 텍스처로 보이고 플랫폼·적이 가독성 있는지, Core Vault에서 OBJ 칩이 둘째 줄인지, 콘솔 오류 0. 업그레이드/세이브 발광 실린더 포화는 미조정(필요 시 다음 라운드).

## 몬스터·지형 전면 개선(2026-11-15 시작)

계획: [plans/2026-11-15_MONSTERS_TERRAIN_OVERHAUL.md](plans/2026-11-15_MONSTERS_TERRAIN_OVERHAUL.md)

- [x] FEAT-001 기준선 기록(테스트 45/45, reach3d 52 wp 3431 ticks, 봇 3433 ticks HP 160) 및 계획 문서.
- [x] FEAT-002 몬스터 AI 상태·회전·도약·순찰·가속(시뮬).
- [x] FEAT-003 몬스터 애니메이션 블렌딩·절차 모션·흰 실루엣 수정.
- [x] FEAT-004 섹터별 지형 세트 드레싱·절차 텍스처·분위기.
- [x] FEAT-005 조명 프리셋·블룸 완화·성능 텔레메트리·문서.
- 브라우저 검증은 모두 unverified(Chrome 불가).

### 브라우저 재검증 체크리스트(오케스트레이터 Playwright, 모두 unverified)

- 훅: `__reanimatorAdvance([], {x,y,boots:true,openDoors:[...]})`, `__reanimatorRunBot(maxTicks)`. 진입 tick: shaft 180, mines 490, biolabs 1390, security 1700, core 2400. 매 섹터에서 `__reanimator()`로 `drawCalls`, `triangles`, 콘솔 오류 0, fps 기록(PointLight 추가 없음, fps 60 근처 기대).
- airlock: 차갑고 푸른 톤, 블룸 약함, 세이브 패드가 단색이 아니라 어두운 링 위 청록 발광.
- shaft: 푸른 회색, 문 면 줄무늬 질감, 업그레이드 없음.
- mines: 따뜻한 앰버 톤, acid가 텍스처로 보임, 부츠 젬이 유리 케이지 안 코어로 읽히고 평면 노란 덩어리가 아님.
- biolabs: 녹색 틴트, 블룸 최대 0.4여도 젬·Energy Tank가 형태 유지.
- security: 밝고 푸른 흰 톤, 콘솔 링, 세이브 패드.
- core: 붉은 톤, 보스 충격파와 Meltdown 경보 시 ambient가 붉게 전환, 종료 후 프리셋 색 복귀.
- 방 전환 시 색·강도가 약 0.4초에 걸쳐 부드럽게 변하는지(깜빡임 없음).
- 이후 `__reanimatorRunBot(4000)`으로 완주 유지 확인(시뮬 기준 3674 ticks).
