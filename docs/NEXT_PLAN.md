# 다음 작업

이전 계획 전문: [archive/NEXT_PLAN_through_R3.md](archive/NEXT_PLAN_through_R3.md)(재귀 개선 1~3차, 몬스터·지형, R1~R3 후속 체크리스트 포함).

## R4 병합 후 (오케스트레이터)

- [ ] 트랙 A(시각), B(환경 위험), C(플레이어), D(`r4/docs`)를 main에 병합하고 `make check` 재실행. 결과를 STATUS 기준선에 갱신.
- [ ] 쇼케이스 PNG 7장을 `docs/evidence/showcase/`에 저장: `title.png`, `classic.png`, `combat.png`, `boss.png`, `mines.png`, `biolabs.png`, `lab.png`. README 갤러리가 이 경로를 참조한다.
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
