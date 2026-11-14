# Requirements: Metroidvania 3D (Side-View)

Full 3D 렌더링 + 사이드뷰(XY 평면 진행) 메트로이드바니아. Metroid Dread × 1995 Abuse. 신규 설계이며 원본 복원이 아니다. 타입 계약은 `src/game3d/types3d.ts`.

용어: **System** = 3D 시뮬레이션(`src/game3d/`) 및 렌더러/HUD. 시뮬레이션 60 Hz.

## R1. 섹터 구조
1. THE System SHALL 6개 섹터를 `SectorId3D`로 정의한다: `airlock`(Cryo Airlock), `shaft`(Central Transit Shaft), `mines`(Sunken Mines), `biolabs`(Bio-Labs), `security`(Upper Security Deck), `core`(Core Vault).
2. THE System SHALL 모든 `RoomDef3D.neighbors`를 대칭으로 유지하고, 모든 방을 spawn에서 그래프 도달 가능하게 한다.
3. THE System SHALL `shaft`를 수직 허브로 두고 나머지 섹터가 직접 또는 한 섹터 경유로 연결되게 한다.
4. WHEN 플레이어가 방 경계를 넘으면, THE System SHALL 현재 방 id를 갱신하고 해당 방을 방문 처리한다.

## R2. 색상 잠금 문
1. THE System SHALL `DoorLockKind3D` 6종을 지원한다: `blue`, `green`, `yellow`, `red`, `console`, `escape`.
2. WHEN Pulse 탄이 `blue` 문에 명중하면, THE System SHALL 문을 연다.
3. WHEN Scattergun 탄이 `green` 문에 명중하면, THE System SHALL 문을 연다.
4. WHEN Grenade 폭발이 `yellow` 문(Cracked Bio-Wall)에 닿으면, THE System SHALL 벽을 파괴한다.
5. WHEN Rail-Cannon 탄이 `red` 문(Security+Rail Bulkhead)에 명중하고 Security 키 조건이 충족되면, THE System SHALL 문을 연다.
6. WHEN 플레이어가 콘솔 반경 안에서 `F`를 누르면, THE System SHALL `console` 문을 연다.
7. WHEN Meltdown이 시작되면, THE System SHALL `escape` 문을 연다. 그 전에는 열지 않는다.
8. IF 무기가 문의 잠금 종류와 맞지 않으면, THEN THE System SHALL 문 상태를 바꾸지 않고 피드백 사운드만 낸다.
9. THE System SHALL 한번 연 문을 세이브 슬롯에 영속시킨다.

## R3. Thruster Boots 게이트
1. THE System SHALL `shaft` 상부에 높이 4.4 m 지점을 배치하되, 기본 점프 최고점이 이를 넘지 못하게 한다.
2. WHEN 플레이어가 `thruster_boots` 업그레이드를 획득하면, THE System SHALL 공중 점프 1회를 허용한다(`double_jump` 사운드).
3. WHILE 업그레이드가 없으면, THE System SHALL 공중 점프 입력을 무시한다.
4. WHEN 플레이어가 착지하면, THE System SHALL 공중 점프 횟수를 초기화한다.
5. THE System SHALL 부츠 없이 4.4 m 상부에 도달할 수 있는 경로가 없음을 `reach3d` 검사로 보장한다.

## R4. Energy Tank와 Save/Recharge
1. THE System SHALL `energy_tank` 획득마다 최대 HP를 +30 올리고 현재 HP를 +30 회복한다.
2. THE System SHALL 같은 탱크를 한 번만 획득 가능하게 하며 세이브에 영속시킨다.
3. WHEN 플레이어가 `SaveStation3D.radius` 안에서 `F`를 누르면, THE System SHALL 진행 상태를 저장하고 HP와 탄약을 최대로 회복한다(`save_station` 사운드).
4. WHEN 플레이어가 사망하면, THE System SHALL 마지막 저장 상태로 복귀시킨다. 저장이 없으면 `spawn`으로 복귀한다.
5. THE System SHALL 방당 Save 스테이션을 최대 1개(`hasSave`)로 제한한다.

## R5. HUD 그리드 미니맵
1. THE HUD SHALL `RoomDef3D.gridX/gridY/gridW/gridH`로 메트로이드식 그리드 미니맵을 그린다.
2. THE HUD SHALL 방문한 방만 채우고, 현재 방을 강조한다.
3. THE HUD SHALL Save 스테이션, 잠금 문 색, 보스·탈출 방 아이콘을 방문한 방에 한해 표시한다.
4. THE HUD SHALL 미니맵 표시 상태를 시뮬레이션 상태에 쓰지 않는다(읽기 전용).

## R6. 캐릭터 포즈
1. THE Renderer SHALL 상체와 하체를 분리(split-body)한다. 하체는 이동 방향, 상체는 조준 방향을 따른다.
2. THE Renderer SHALL `aimDirX/aimDirY`로 XY 평면 360° 조준 쿼터니언을 구성하고, 양손 라이플 IK로 두 손을 총 소켓에 고정한다.
3. WHEN `aimSignX`가 바뀌면, THE Renderer SHALL 몸을 뒤집지 않고 상체 요를 회전시켜 조준 쪽을 본다.
4. THE Renderer SHALL 점프 클립을 `vy`에 속도 잠금하여 3단계(상승, 정점, 하강)로 스크럽하고, `landingFactor`로 착지 완충을 적용한다.
5. WHEN 이동 방향과 조준 방향이 반대(`moveX`와 `aimSignX`의 부호가 다름)이면, THE Renderer SHALL 하체 걷기 클립을 역재생한다(reverse-leg backpedal).
6. THE Renderer SHALL 포즈 계산을 `PlayerPoseState3D`만 입력으로 받는 순수 함수로 두고, 시뮬레이션 상태를 변경하지 않는다.

## R7. 헤드램프 격리 (R3.3 유지)
1. THE System SHALL `w.light`를 렌더러와 HUD에서만 읽는다.
2. THE System SHALL 이동, 전투, 픽업, 문, 위험 지형, 적 AI, 저장에서 `w.light`를 읽지 않는다.
3. THE Test SHALL 램프를 켜고 끈 월드와 켜지 않은 월드에 같은 입력을 360틱 주어, `light`와 배터리를 제외한 전체 상태가 `deepEqual`임을 확인한다.

## R8. 복원 보존
1. THE System SHALL 15 Hz DOS Restoration Lab(`#lab`)과 `src/engine/motion.ts`를 변경하지 않는다.
2. THE System SHALL 봉인 파일을 수정하지 않는다: `src/engine/{motion,collider}.ts`, `src/game/{light,map,world}.ts`, `tools/game/reach.ts`, `tests/{game,reference}.test.ts`, `reference/{fixtures,holdout}/**`.
3. THE System SHALL 메트로이드바니아 이동을 `src/engine/motion3d.ts`에만 둔다.
4. WHEN `make check`를 실행하면, THE System SHALL `reference-verify` S1·S2·S3와 `dist-guard`를 통과한다.
5. THE Docs SHALL 15 Hz가 설계값이고 3D 메트로이드바니아는 원본 복원이 아님을 명시한다.
