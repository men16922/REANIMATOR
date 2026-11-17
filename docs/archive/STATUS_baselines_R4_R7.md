# STATUS 이전 기준선 (R4~R7)

## 이전 기준선 (R7 병합 후)

- `make check` exit 0: tsc 통과, node 테스트 380/380, `reference-verify` 3/3 PASS, `reach` PASS, `reach3d` 52 waypoints 3432 ticks, vite build, dist-guard PASS(13 files, 14,721,553 B, 218 대조). 봉인 파일 무변경.
- 브라우저 확인(soak 실행, UI 감사, 원경·카메라 육안), 봇 완주 재측정은 unverified. `lab.png`는 버그 화면이라 R7-UI 수정 후 재촬영 예정.

## 이전 기준선 (R6 병합 후)

- `make check` exit 0: tsc 통과, node 테스트 344/344, `reference-verify` 3/3 PASS, `reach` PASS, `reach3d` 52 waypoints 3432 ticks(로켓 점프 우회 검사 포함), vite build, dist-guard PASS(13 files, 14,684,946 B, 218 대조).
- 충돌: `audioLogic.ts`·`main.ts`(sound 병합), `main.ts`(demo 병합). arms는 자동 병합, fix는 자동 병합. 브라우저 검증과 봇 완주 재측정은 unverified.

## 이전 기준선 (R5 병합 후)

- `make check` exit 0: tsc 통과, node 테스트 291/291, `reference-verify` 3/3 PASS, `reach` PASS, `reach3d` 52 waypoints 3432 ticks(57.2 s), vite build, dist-guard PASS(13 files, 14,652,123 B, 218 대조). 병합 충돌은 `scene3dFull.ts` 1곳(metroid3d 빌드와 hazards `setClassic`, 양쪽 유지). rig·vfx는 자동 병합. frontLift는 벽·램프 재질 전용이라 적 림 셰이더와 겹치지 않음(코드 확인).
- 브라우저 검증(콘솔, drawCalls, 쇼케이스 재촬영)은 오케스트레이터가 진행 중이며 이 문서 작성 시점에는 unverified. 봇 완주 수치는 metroid 브랜치 측정 won 5362 ticks, HP 112이며 병합 후 재측정은 unverified.

## 이전 기준선 (R4 병합 후)

- `make check` exit 0: tsc 통과, node 테스트 244/244, `reference-verify` 3/3 PASS, `reach` PASS, `reach3d` 52 waypoints 3432 ticks, vite build, dist-guard PASS(13 files, 14,619,332 B, 218 대조).
- 봇(hazards 브랜치 측정): won 5362 ticks, HP 112. 병합 후 봇·브라우저 수치(drawCalls, 콘솔)는 unverified.

## 진입점

- [KIRO_USAGE](../KIRO_USAGE.md) · [JUDGES](../JUDGES.md) · [평가](../EVALUATION.md) · [도구](../evidence/TOOLCHAIN.md) · [판정 계약](../reference/VERIFICATION_CONTRACT.md) · [자산 등록부](../reference/ASSET_REGISTER.md)
- spec: `.kiro/specs/{abuse-reference,restored-motion,reanimated-slice,full-3d-quarter-view,metroidvania-3d}/`, steering `.kiro/steering/`, hook `.kiro/hooks/engine-gate-on-save.json`

## 미확인·위험

- 사람 플레이(G5) 미실시. 봇은 HP를 거의 잃지 않아 난이도 근거가 못 된다(무모한 입력 `make difficulty`는 정체).
- `make smoke-local`은 이전 샌드박스에서 Chrome abort(134). 최신 기준 smoke는 unverified. 브라우저 확인은 오케스트레이터의 Playwright 관찰에 의존.
- 15 Hz는 설계값이며 원본 틱은 미측정. `.kiro/settings/mcp.json` REA MCP 쓰기 차단 잔여.
- 쇼케이스 PNG: title, classic, mines, biolabs, boss, combat 저장. `lab.png`는 R7 수정 전 버그 화면이라 재촬영 필요(커밋 제외).
