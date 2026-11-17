# STATUS 아카이브 (R15, R20, R23~R25)

2026-11-17 `/tidy-docs`로 `docs/STATUS.md`에서 이동. 현재 상태는 [STATUS](../STATUS.md).

## R25 지형 2차 (2026-11-17, 로컬 커밋)

- `tools/meshy/textures.ts`: 텍스처 5종 추가(reactor-floor-calm, reactor-wall, foundry-wall, hazard-trim 크롭 스트립, steel-grating). 미사용 roughness 맵(-r.webp) 출하 중단. Stage 3 위 면 = calm 바닥, 옆 면 = reactor-wall; Stage 2 옆 면 = foundry-wall; 엘리베이티드 그레이트 = steel-grating(`surfaceLookFor(..., cls)`).
- `edgeTrim.ts`: 플랫폼/캣워크 전면 하자드 셰브론 띠(섹터당 병합 메시 1개, 렌더 전용). `applyTwoSurface`는 three 셰이더 청크가 바뀌면 경고 후 패치를 건너뜀(`patchNormalChunk`, `tests/terrain-surfaces.test.ts`).
- `make check` exit 0(765/765), 봇 핀 불변(Normal 4978/HP126 등 테스트 통과), dist-guard PASS(56 files, 20,779,055 B). draw calls: combat 275, biolabs 264, security 244, mines 178, Stage 2/3 방 96~128. 증거 `docs/evidence/r25_terrain/{before,after}/`.
- 레벨 교체 후 평면 단색 프레임은 Vite HMR로 모듈을 여러 번 다시 불러온 개발 페이지에서만 재현(새 페이지 14장 연속 교체는 정상). 실제 플레이어 경로는 unverified. Unverified: `make smoke-local`, 사람 플레이, Reduce motion 육안(터레인 코드는 reduceFx를 읽지 않음).

## R24 지형 텍스처 (2026-11-17, 로컬 커밋)

- `tools/meshy/textures.ts`(`npm run meshy:textures`, sharp): Meshy 1024 PNG 5종 -> 반주기 크로스페이드 타일링 보정 512 WebP 알베도 + Sobel 노멀 + 휘도 거칠기(`public/assets/textures/`, 결정적). 매니페스트 `texture/*`·ASSET_REGISTER 등록.
- `terrainSurfaces.ts`: 스테이지/섹터별 표면(S1 floor/wall, mines-rock, foundry-iron, reactor-frost). `solidBatches.ts` 월드 공간 박스 투영 UV(`BatchItem.world`). 위쪽 면은 floor, 나머지 면은 wall 텍스처(재질 1개, 셰이더 패치, 로드 실패 시 절차 텍스처 유지). 렌더 전용.
- 배경 진정: 비활성 섹터 vista 밝기 0.3(활성 0.82), 블룸 -20%, 안개 +20%. Bio-Labs 좌하단 회색 다각형은 이웃(shaft) vista 헤이즈 패치였고 사라짐.
- `make check` exit 0(760/760), 봇 Normal 4978/HP126 불변, dist-guard PASS(52 files, 20.4 MB). 그리기 호출 최대 combat 280(≤300). 증거 `docs/evidence/r24_terrain/{before,after}/`. Unverified: `make smoke-local`, 사람 플레이, Reduce motion 켠 상태 육안 확인.

## R23 FEAT-003 전체 런 엔딩 (2026-11-17, 로컬 커밋)

- `records.ts`에 런 로그(`addToRun`: Stage 1 클리어가 새 런 시작, `summarizeRun`: 3스테이지 합계)와 최고 전체 런 기록(별도 키 `reanimator.fullrun.v1`, v1 스테이지 기록 키는 불변이라 마이그레이션 불필요). Stage 3 클리어 화면에 "REANIMATED" 카드(총 시간·죽음·킬, 스테이지별 줄, 최고 기록). 디버그 훅 `__reanimatorShowEnding()`(dev/debug 빌드만, 저장소 복원). `tests/fullrun.test.ts`.
- `make check` exit 0(759/759). Unverified: 브라우저 표시(오케스트레이터 검증).

## R23 FEAT-002 게임패드·접근성 (2026-11-17, 로컬 커밋)

- `src/game3d/gamepad.ts`(순수 매핑·데드존, 표준 매핑: 스틱/D-pad 이동, 우스틱 조준, A 점프, B 대시, X/RT 발사, Y 상호작용, LT 카운터, LB/RB 무기, Start 일시정지)와 `settings.ts`(키 `reanimator.settings.v1`: reduceFx, largeHud). `src/ui/main.ts` 입력 계층에서만 패드를 읽고 시뮬은 불변. 설정에 "Reduce motion and flashing"(기존 흔들림·플래시 감쇠에 연결)과 "Larger HUD text", 컨트롤 안내에 게임패드 추가. `tests/gamepad.test.ts`.
- `make check` exit 0(753/753). 봇 핀 불변. Unverified: 실제 패드 하드웨어, 브라우저 UI(오케스트레이터 검증).

R23 FEAT-001 상세: [archive/STATUS_R23_FEAT001.md](STATUS_R23_FEAT001.md).

## R20 Foreman 메시·릴 Stage 2/3 컷·폴리시 (2026-11-16, 로컬 커밋 de8a151·c3e21e8·fd78fd5)

- Slag Foreman 전용 Meshy 메시(절차 포즈), 트레일러 릴 10컷에 Stage 2 Foreman·Stage 3 Spire 컷 추가.
- 폴리시: Foreman 미니보스 이름 카드(섹터 카드 형식), Warden 인트로 카드 스테이지별(Stage 3 = SPIRE WARDEN), Stage 3 보스 바·목표·텔레포터 힌트 이름 통일, Foreman 전용 음성 5종, Foreman 피격 스파크·사망 버스트, 가까운 증기 분출 시 카메라 흔들림. 스크린샷 [r20_polish](../evidence/r20_polish).
- draw calls: Stage 1 combat 릴 컷 306 → 287(그림자 패스 캐스터 제한 등, [DRAWCALLS](../evidence/r20_reel/DRAWCALLS.md)). 전 컷 300 이하.
- `make check` exit 0(725/725, reach3d 52 waypoints 3432 ticks, dist-guard PASS 34 files). 봇 핀 불변: Normal 4978/HP126, Story 4880/142, Hard 5319/104(min 100).
- 인트로 재발동 조사: Warden 인트로는 `world3d.ts`에서 플레이어가 `core` 방에 있고 `bossIntroDone`이 false이고 Warden이 살아 있을 때만 시작한다. Cryo Stacks 오버레이는 디버그 텔레포트에서 온 것으로 추정(unverified).
- Unverified: `make smoke-local`, `make release`/`vite preview`, Stage 2·3 사람 플레이, 시네마틱 인트로 오버레이의 SPIRE WARDEN 육안(DOM 텍스트만 확인).


## R15 터레인 킷 (Meshy 11종, 로컬 커밋)

- 11개 GLB 인제스트(`terrain/`), `terrainKit.ts` 인스턴싱과 6개 섹터 연결, 시각 전용. `make check` exit 0(654/654, dist-guard 24 files). 브라우저 6개 섹터 draw calls 148~299(<=300), 콘솔 오류 0, 스크린샷 `docs/evidence/r15_meshy_terrain/`. Bio-Labs 299로 여유 없음. 사람 플레이 unverified. Meshy t2.5 smart-topology 4k tris PBR, 165 credits 사용(잔액 608). 상세 `docs/archive/rounds/R15_MESHY_TERRAIN.md`.

## 세션 마감 검증 (오케스트레이터 Playwright 관찰, 2026-11-15)

- **R9**: `__reanimatorUiAudit()` 12개 시나리오 ok, Z 스캔 윤곽 표시, 보안 데크 Vault Nook 시크릿 발견, `8376998` 이후 카메라가 Nook 안까지 따라감, 콘솔 경고 0.
- **R10/R11**: 오프닝 알람·기상 비트가 레터박스와 HUD 없이 렌더, 무릎 꿇은 operative, 푸터 1996, HUD 한 줄에 HUNTER pill, 헌터 외형 개선 확인. 최종 `3c8e7a0`의 외형은 오케스트레이터가 재확인하지 않았다(unverified).
- **회귀 의심 조사(재현 불가)**: `__reanimatorAdvance`(skipIntro) 후 1.5 s 뒤 타이틀+어트랙트가 다시 나온다는 보고를 실제 Chrome(Playwright)에서 현재 코드로 조사했다(`src/ui/main.ts`: `__reanimatorAdvance` ~L1576, `hideIntro` ~L471, `exitShowcase` ~L1118). 5 s 후 호출과 로드 직후 호출 모두 mode `playing` 유지, `#title` display none, `#hud` 표시, 내비게이션 없음, 4 s 안정. `show('title')` 호출처는 `exitShowcase`, 쇼케이스 `title` 장면, `uiAudit`, 시작 시뿐이며 Advance 뒤에는 발동하지 않는다. 유력한 원인은 오케스트레이터 세션 중 동시 파일 편집으로 인한 Vite 전체 리로드 또는 낡은 HMR 인스턴스(리로드되면 타이틀+Bio-Labs 어트랙트와 이전 HUD 상태가 나온다). 코드 변경 없음. dev 서버를 깨끗이 재시작해 재확인할 것.
- Abuse·Metroid 느낌 요청은 R4_METROID_GAPS, R5-Rig, R9 Vault Nook, Warden 카운터, Classic View로 이미 반영됐다. 원본 Abuse 데이터는 쓰지 않았다.

이전 기준선(R8–R14)과 R10–R12 세부: [archive/STATUS_R8_R14.md](STATUS_R8_R14.md).
