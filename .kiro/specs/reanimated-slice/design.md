# reanimated-slice — Design

| 파일 | 역할 | 근거 유형 |
|---|---|---|
| `src/engine/motion.ts` | 복원 이동 규칙 + `Collider` 인터페이스 | binary-static + runtime-observed |
| `src/engine/collider.ts` | 타일 충돌(발 지점, 반폭 6, 키 28) | new-design |
| `src/game/map.ts` | 50×14 타일 맵 | new-design |
| `src/game/world.ts` | 15 Hz tick, 무기·크롤러·피해·목표 | new-design (발사 지연 3은 script-read 값 차용, 원본 미관찰) |
| `src/game/light.ts` | 조명 배터리 규칙 | new-design, variant-contract |
| `src/render/canvas.ts` | 320×200 Canvas, 어둠 레이어 | new-design |
| `src/ui/main.ts` | 고정 tick 루프, 보간, 입력, 일시정지·포커스, 화면 | new-design |
| `tools/game/reach.ts` | 복원 엔진 기반 도달성 BFS | 검사 도구 |
| `tools/smoke/smoke.ts` | 브라우저 스모크(설치된 Chrome 채널) | 검사 도구 |

Gate: `make check` = typecheck + 테스트 + 기준 시나리오 + 도달성 + build. `make smoke-local` = build + 스모크.
