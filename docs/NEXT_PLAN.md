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
