# STATUS 보관 (R21·R22)

## R22 Frost 에셋·실행 기록 (2026-11-17, 로컬 커밋 287d595·3409aef·c1a8681 + 기록 커밋)

- Meshy GLB 3종 ingest(WebP 512): frost-shield 226,352 B / 3000 tris(Bulwark 방패, 내려가면 숨김), coolant-pipe-wall 241,004 B / 3907(Stage 3 뒷 레인), cryo-rack 162,872 B / 2448. Stage 3 draw calls 95-138([DRAWCALLS](evidence/r22_assets/DRAWCALLS.md)).
- 실행 기록: `src/game3d/records.ts`(키 `reanimator.records.v1`, 스테이지별 최단 시간·최소 사망·최다 처치, 안전 파싱, `tests/records.test.ts`). 클리어 화면에 NEW BEST와 기록 줄, Stage Select에 BEST 시간·사망. 새로고침 후 유지 확인 [r22_records](evidence/r22_records/).
- `make check` exit 0(744/744, dist-guard PASS). 봇 핀 불변.
- Unverified: `make smoke-local`, 오디오 청감, Stage 2·3 사람 플레이, 릴리스 zip `vite preview`.

## R21 렌더 버그·Stage 3 신규 적·스테이지 사운드·README (2026-11-17, 로컬 커밋 8c2699b·bcf4e06·f1b4286·b9f9d1d)

- Foreman 흰 실루엣 원인: 윈드업 중 패리 창(`parryOpen`)의 흰색 0.6 emissive 플래시가 텍스처 없는 emissive로 거의 검은 알베도를 덮음(런타임 emissive `cbcbcb`). 수정: Foreman 재질 `emissiveMap = map`, 패리 펄스는 주황(`PARRY_FLASH_DARK_HEX`). 전후 [r21_foreman](evidence/r21_foreman/). Furnace Gate 126 draw calls.
- r19 검은 사각형 원인: 보스 인트로 레터박스 `.bar`가 HUD 전역 `.bar`(5.5em, `body:not(.classic) .bar{position:relative}`)에 덮여 좌상단 사각형 2개가 됨. 클래스 `lb-bar`로 분리. SPIRE WARDEN 카드 육안 확인 [r21_stage3](evidence/r21_stage3/).
- Stage 3 Cryo Bulwark(`stage3.ts`, 변형 `bulwark`): 정면 서리 방패가 Pulse·Scattergun을 30%로 감쇠, 윈드업·공격·회복·경직 중엔 내려감, Rail·Grenade·Flamer·Rocket·밟기·카운터는 관통. 이벤트 `shield_block`. 스토커 3개 슬롯에 적용(id·수 불변). Cryo Stacks 133 draw calls(방패 1개당 +1).
- 스테이지 사운드: `themeForStage`(Stage 2 −2반음·0.92배·모루 클랭, Stage 3 +3반음·1.06배·사인 아르페지오·틱 햇), `STAGE_AMBIENT`, `stageSurfaceFor`, 도착 스팅어 `stinger.stage2/3`. 브라우저에서 Stage 3 테마·스팅어 재생 확인.
- README 재작성(피치, 기능, 복원 범위, 스크린샷), `index.html` 메타. dist 가드에 `kiro`/`judg` 금지어 추가, 빌드에서 봉인 픽스처의 `knownLimits` 문구를 제거하는 Vite 플러그인(소스 불변, Lab PASS 확인).
- `make check` exit 0(737/737). 봇 핀 불변: Stage 1 Normal 4978/126, Story 4880/142, Hard 5319/104. Stage 2/3 핀도 불변. `make release` exit 0(`release/reanimator-1.1.0-web.zip`).
- Unverified: `make smoke-local`(샌드박스 Chrome 실행 실패, NOT RUN), 사람 플레이, 오디오 청감.

