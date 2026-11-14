# abuse-reference — Tasks

- [x] 1. 환경 확인 — doctor, JDK, 에뮬레이터·Ghidra 탐지. `docs/evidence/TOOLCHAIN.md` 갱신
- [x] 2. 원본 취득과 해시 — `reference/private/abuse-box.zip`, `reference/manifests/abuse-source.json`
- [x] 3. 권리·자산 등록부 — `docs/reference/ASSET_REGISTER.md` (역공학 금지 조항 → 사용자 A 결정, `docs/DECISIONS.md`)
- [x] 4. EXE 형식 판정 — MZ stub + DOS/4GW + LE (내부 MZ 0x26654, LE 0x290a4)
- [x] 5. 에뮬레이터 설치와 원본 실행 — DOSBox Staging 0.83.0, 원본 실행 캡처, 같은 시작 조건 3회(결정적 replay로 충족)
- [x] 6. G0 보고서 — `docs/evidence/G0_REPORT.md`
- [x] 7. (G1) REA 로딩 가능성 — 원본 직접: stub만(16비트). LE→ELF 변환본: Ghidra 12.2 + arm64 decompiler 빌드 + JDK 25로 1,544 함수
- [x] 8. (G1) 이동→충돌 경로 연결 — `docs/reconstruction/BEHAVIOR_MAP.md`, `docs/evidence/G1_REPORT.md`. 정적 예측과 3회 동일 관찰 일치
- [ ] 9. Kiro workspace MCP 등록 — `.kiro/settings/mcp.json` 쓰기가 권한 규칙(kiro-scope)으로 차단됨. 사용자 수동 추가 필요
