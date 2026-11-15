# 다음 작업

이전 계획 전문: [archive/NEXT_PLAN_through_R3.md](archive/NEXT_PLAN_through_R3.md)(재귀 개선 1~3차, 몬스터·지형, R1~R3 후속 체크리스트 포함).

## R5 병합 후 (오케스트레이터)

- [x] metroid → render → rig → vfx 병합, `make check` 통과(STATUS 기준선).
- [ ] 브라우저 확인(진행 중): 적 리깅·LOD, Crawl Slide·파괴 블록·맵 단말·탈출 해치, 메시 병합 후 drawCalls, 증기 시트, 보스 카메라, 피격 플래시·투사체 글로우·색수차, 콘솔 오류 0.
- [ ] `biolabs.png`, `boss.png` 재촬영 후 커밋. `combat.png`, `lab.png` 추가.
- [ ] 병합 후 봇 완주(`__reanimatorRunBot`) 재측정.
- [ ] Metroid 후속(벽 점프 보강, 패리, 스캔)은 [R4_METROID_GAPS](plans/R4_METROID_GAPS.md) 참조.

## R4 병합 후 (오케스트레이터)

- [x] 트랙 A·B·C·D 병합, `make check` 통과(STATUS 기준선).
- [ ] 브라우저 확인: hazards3d(크러셔 등 MeshStandardMaterial)가 Classic View(`V`)에서 팔레트·디더와 어울리는지, 영웅 포즈·무기 모델, 폭발·보스 셰이더, 콘솔 오류 0.
- [x] 적 애니메이션 리깅(R5-Rig), Metroid 보강 일부(R5-Metroid). Abuse 느낌 강화 후속은 남음.
- [ ] 쇼케이스 PNG 중 `combat.png`, `lab.png` 미저장(README 갤러리가 참조).
- [ ] Credits 패널 브라우저 확인: Title > Extras > Credits, `Esc`와 Back이 Extras로 돌아오는지, 키보드 포커스.

## 브라우저 확인 (R3까지 누적, unverified 항목)

- [ ] Classic View(`V`)에서 mood 조명·고어·hive·dropper 렌더, 설정 패널(View/CRT/Gore/Reduce flashing/볼륨).
- [ ] 타이틀 메뉴(Play/Continue/Settings/Extras), 어트랙트 6컷, 보스 인트로·텔레그래프.
- [ ] 절차: `__reanimatorAdvance([], {x,y,boots:true,openDoors:[...]})`, `__reanimatorRunBot(maxTicks)`, `__reanimator()`의 `drawCalls`·`triangles`·`enemyRender`, 콘솔 오류 0.

## 사용자 확인 필요

- `git push origin main` 승인(로컬 커밋만 존재).
- G5: `npm run dev`로 직접 플레이해 감각·난이도·탐험 흐름을 [EVALUATION.md](EVALUATION.md)에 기록. 관찰 후보: 부츠 필수 구간 체감, 보스 3페이즈 난이도, Classic View 가독성.
- 원본 Abuse 느낌 강화 요청(2026-11-15 사용자 메시지): R3 Classic View·조명·고어가 첫 대응이며 추가 라운드에서 앰버 팔레트·메뉴·사운드 톤을 더 맞출지 결정 필요.

## 이월

- Chrome 가능한 환경에서 `make smoke-local`, `node tools/smoke/capture-showcase.ts` 재실행.
- Kiro 내 REA MCP 연결(`.kiro/settings/mcp.json` 쓰기 차단).
