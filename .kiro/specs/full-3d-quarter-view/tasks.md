# full-3d-quarter-view — Tasks

각 항목은 `requirements.md`의 R4.x와 대응한다. 완료 표시는 코드 존재와 이 세션에서 실행한 `node --test tests/`(35/35 pass)를 근거로 한다. 이 spec 작성 세션에서 `make check`·`make smoke-local`·`playthrough.ts`는 다시 실행하지 않았다(이전 체크포인트 기록은 `docs/STATUS.md` 참조).

## 엔진·시뮬레이션

- [x] `src/engine/motion3d.ts`: `ABILITY_3D`, `stepBody3D`, 램프·카타워크 `floorHeightAt3D`, 벽/기둥 슬라이드 `resolveHorizontal3D`, Jet-Dash (R4.1–R4.3)
- [x] `src/game3d/world3d.ts`: `newWorld3D`/`stepWorld3D` 60 Hz 결정적 시뮬레이션 (R4.1, R4.4)
- [x] `src/ui/main.ts`: 고정 60 Hz 누산 루프(`SIM_HZ_3D`, 프레임당 최대 4 step), 일시정지·재시작 (R4.1, R4.14, R4.28)

## 맵

- [x] `src/game3d/map3d.ts`: 4구역(A/B/C/D), 카타워크 2, 램프 4, 아시드 vat, 기둥 7, 배럴 11, 메드 스테이션 3, 적 스폰 15 (R4.5–R4.6)
- [x] 남쪽 컷어웨이 벽 `visualMaxY`, 북쪽 고벽 (R4.7)
- [x] `gate_c`/`gate_d` 보안 도어 `isSolidActive` 연동 (R4.8)
- [x] `tools/game/reach3d.ts`: START → CONSOLE → CORE → EXIT 도달성 (R4.9)

## 전투·목표

- [x] 무기 4종 `WEAPON_META` (Pulse·Scattergun 7 펠릿·Grenade 바운스·Rail hitscan) + 페데스탈 해금 (R4.15–R4.16)
- [x] 바이오 배럴 연쇄 폭발 `fuseTicks`, `triggerExplosion3D` (R4.17)
- [x] 적 4종 AI(`crawler`/`stalker`/`spitter`/`warden`) (R4.18)
- [x] Core Warden 2페이즈(≤50% HP), 슬램 충격파 점프 회피, 코어 보호막 (R4.11, R4.19–R4.20)
- [x] Security Console → `gate_c`, 코어 파괴 → Meltdown 5400 tick → `gate_d` → Exit 승패 (R4.10, R4.12–R4.13)
- [x] 결정적 봇 `src/game3d/bot3d.ts` + `tools/game/playthrough.ts` (R4.4)

## 렌더·자산

- [x] `Scene3DRenderer`: `PCFSoftShadowMap`, `ACESFilmicToneMapping`, `FogExp2`, sun 그림자 (R4.22)
- [x] `UnrealBloomPass(0.42, 0.32, 0.84)` + `OutputPass` 후처리 (R4.22)
- [x] Quarter-View 카메라, 커서 look-ahead, 흔들림, 벽 페이드 (R4.23)
- [x] 360° 커서 조준 `screenToWorldAim`, 레이저·레티클 (R4.26)
- [x] `riggedModels.ts`: operative·warden·bio-stalker 66-joint 멀티클립 `SkinnedMesh`, 클립 크로스페이드 (R4.24)
- [x] `RIFLE_SOCKET`으로 `pulse-rifle.glb`를 `mixamorigRightHand`에 부착 + 총구 `muzzleLocal` (R4.25)
- [x] 정적 GLB 6종(pulse-rifle, bio-barrel, crawler, spitter, power-core, exit-gate) + 로드 실패 폴백 (R4.27)
- [x] `reference/manifests/meshy-assets.json` v2 매니페스트 (R4.24)

## R3.3·불변식

- [x] R3.3 헤드램프 격리: 렌더러/HUD 전용 `w.light`, 360 tick 동일성 테스트 (R4.21)
- [x] `src/engine/motion.ts`·`reference/{fixtures,holdout}/**` 무수정 유지 (R4.29)
- [x] `dist-guard` 원본 파일 미포함 (R4.30)

## 테스트 (`tests/game3d.test.ts`)

- [x] `motion3d`: 가속·마찰·점프 호·램프·벽/기둥 슬라이드·Jet-Dash
- [x] `world3d`: 무기 4종·수류탄 바운스·배럴 연쇄·Rail 벽 정지
- [x] Core Warden: Phase 2, 충격파 점프 회피, 코어 보호막
- [x] R3.3 Strict Light Isolation (360 ticks)
- [x] Rigged/static Meshy GLB 존재·스킨·필수 클립

## 남은 항목

- [ ] G5 사람 플레이 관찰, 체감 난이도·3분 목표 시간 측정 (사람 필요)
- [ ] 이 spec 작성 후 `make check`·`make smoke-local` 재실행 기록 (unverified)
- [ ] Kiro 내 REA MCP 연결(`.kiro/settings/mcp.json` 쓰기 차단 잔여)
