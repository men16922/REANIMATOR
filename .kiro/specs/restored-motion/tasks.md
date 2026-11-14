# restored-motion — Tasks

- [x] T01 hlog 파서·fixture schema — `tools/reference/hlog.ts`, 손상 입력 거부
- [x] T02 엔진 수평·정지 — `src/engine/motion.ts`
- [x] T03 점프·천장·낙하 착지·벽 — 같은 파일
- [x] T04 비교기 — `tools/reference/compare.ts` (PASS/FAIL/ERROR/NOT RUN)
- [x] T05a `make check` gate (엔진 테스트 + 개발 시나리오) — fixture 제거·엔진 변조 시 exit 2 확인
- [ ] T05b Canvas 한 화면 (G3)
- [x] T06 holdout: M04 FAIL(1회) → 개발 S3로 이동 → 새 holdout M05 1회 판정 PASS
