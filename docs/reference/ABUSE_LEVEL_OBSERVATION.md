# Abuse 레벨 관찰 (LEVEL00~04, 셰어웨어 1.05)

대상: `reference/private/abuse-box/ABUSE/LEVELS/LEVEL00~04.SPE`. 원본 바이트·화면은 이 저장소 산출물과 `dist/`에 넣지 않는다. 기계 출력은 [survey.json](../evidence/abuse_levels/survey.json), 정적 요약은 [SURVEY.md](../evidence/abuse_levels/SURVEY.md), 런타임 로그는 [run/hlog.txt](../evidence/abuse_levels/run/hlog.txt).

방법 표기: **Binary** = SPE 파싱(`tools/reference/spe-survey.ts`), **Lisp** = `LISP/*.LSP` 읽기, **Observation** = DOSBox 실행 로그, **Inference** = 위 근거에서 추론, **New design** = 이 프로젝트의 신규 설계.

## 1. Binary parse (읽음)

| 레벨 | fgmap | 객체 | 적 | 픽업 | 무기 아이콘 | 문 | 스위치 | 게이트 | 체크포인트 | 영역 |
|---|---|---|---|---|---|---|---|---|---|---|
| 00 | 100×100 | 259 | 6 | 31 | 17 | 8 | 35 | 4 | 1 | 12 |
| 01 | 100×120 | 317 | 58 | 22 | 30 | 16 | 49 | 16 | 3 | 7 |
| 02 | 150×150 | 346 | 78 | 41 | 34 | 20 | 66 | 17 | 6 | 11 |
| 03 | 100×150 | 358 | 83 | 36 | 45 | 15 | 56 | 19 | 5 | 13 |
| 04 | 110×160 | 398 | 103 | 40 | 32 | 12 | 47 | 21 | 6 | 15 |

- 맵 단위는 타일. 레벨 02가 면적 최대(150×150), 레벨 04가 가장 세로로 긴 맵(110×160).
- 범주 분류는 객체 이름 기반 휴리스틱이다(inference).
- 레벨별 적 구성: 00은 WHO 6개와 LAVA 71개(튜토리얼·지형), 01부터 ANT 계열·SPRAY_GUN, 02부터 JUGGER·ROB1, 04는 ANT_ROOF 62개. 상세는 `survey.json`의 `objectCountsByName`.
- 문·스위치·게이트가 레벨 02에서 최대(문 20, 스위치 66). 04는 문이 12로 줄고 게이트(21)가 늘어 논리 퍼즐 비중이 높다.
- 체크포인트(RESTART_POSITION)는 00:1, 01:3, 02:6, 03:5, 04:6. 레벨이 길수록 재시작 지점이 늘어난다.
- 팔레트·타일 외형은 이 방법으로 알 수 없다(unverified, 6절).

## 2. Lisp reading (읽음)

- `STARTUP.LSP`: 첫 레벨은 `levels/level00.spe`(트레이너). `skip_trainer_level`이면 `level01.spe`.
- `PEOPLE.LSP` `next_level_ai`: 플레이어 접촉 + `pressing_action_key`(= `player_y_suggest > 0`, 즉 아래 입력)이면 `"levels/level"+digstr(aistate,2)+".spe"`를 `request_level_load`. `aistate == end_level`이면 `request_end_game`. `end_level`은 `register/people.lsp`가 없으면 5, 있으면 19(셰어웨어는 5).
- 문은 링크된 스위치/키에 따라 열림. 스위치는 액션 키와 거리(x<20, y<30)로 작동. `TP_DOOR`는 쌍으로 링크되어 순간이동. 사망 시 저장 파일 또는 현재 레벨을 다시 로드하고 HP 100.
- 레벨 연결(Binary × Lisp): 00은 NEXT_LEVEL 6개(1635,936→01, 1725,936→02, 1935,936→03, 2025,936→04, 105,651→01, 2655,1431→01). 01→02→03→04, 04 출구는 aistate 5 = 게임 종료.

## 3. Observation (실행함)

환경: DOSBox Staging 0.83.0, 신규 작업 사본 `reference/work/levels_obs/`(gitignored), 하네스 [HARNESS.levels.LSP](../../reference/harness/HARNESS.levels.LSP), 실행 [scripts/observe_levels.sh](../../scripts/observe_levels.sh). 하네스는 `get_local_input` Lisp 훅을 덮어써서 매 호출마다 `level_name`·`game_tick`·플레이어 위치·HP를 `HLOG.TXT`에 쓰고, 정적 조사로 얻은 NEXT_LEVEL 좌표로 플레이어를 옮긴 뒤 아래 입력을 유지한다. 강제 레벨 로드는 하지 않는다.

관찰한 사실(`run/hlog.txt`):

| 레벨 | 실제 스폰 (x,y) | 이동 후 NEXT_LEVEL 접촉 | 전환 결과 |
|---|---|---|---|
| `level00.spe` | (58,61) | (1635,936)에서 아래 입력 | 약 6 호출 뒤 `level01.spe` |
| `level01.spe` | (167,43) | (2715,306) | `level02.spe` |
| `level02.spe` | (55,683) | (105,876) | `level03.spe` |
| `level03.spe` | (629,94) | (2505,1296) | `level04.spe` |
| `level04.spe` | (58,88) | (2625,456) | 로그가 끊기고 하네스 입력 호출이 멈춤. 엔딩 시퀀스 진입으로 추정 |

- 스폰 좌표가 정적 START와 일치한다(Binary와 Observation 일치).
- 전환은 레벨 이름이 바뀌는 시점으로 확인했다. 이름은 `levels/levelNN.spe` 형식.
- 원본 틱 번호(`game_tick`)는 레벨마다 다른 값으로 시작한다(73278, 80002, 55590, 39135, 45996). 의미는 unverified.
- 위치 이동은 하네스가 `set_x/set_y`로 한 것이다. 실제 플레이 경로·소요 시간·난이도는 관찰하지 않았다.
- 레벨 04의 종료는 하네스가 끝 신호를 쓰지 못한 상태에서 프로세스가 대기해 `request_end_game` 직행이라고 추정한 것이다. 화면은 보지 못했다(unverified).
- 객체 런타임 census는 Lisp에서 전체 객체를 열거하는 함수를 찾지 못해 하지 않았다. 객체 수는 Binary 값을 쓴다.

## 4. 화면·팔레트 (unverified)

이 실행 환경에는 윈도 서버가 없다. DOSBox(SDL)가 `NSApplication` 초기화에서 SIGABRT 했고(첫 시도의 스택: `Cocoa_RegisterApp` → `NSApplication init` → abort), `SDL_VIDEODRIVER=dummy`로 실행해야 했다. 그래서 `screencapture`와 DOSBox 창 캡처를 쓸 수 없었고 레벨별 스크린샷은 없다. 레벨 팔레트와 타일 외형은 관찰하지 않았다. 필요하면 GUI 세션에서 `scripts/observe_levels.sh`의 dummy 지정을 빼고 실행한다. 화면 캡처는 분석 증거이며 `dist/`에 넣지 않는다.

## 5. Inference (추론)

- 진행: 00 트레이너 허브 → 01 → 02 → 03 → 04 → 종료의 선형 구조. 00은 출구 4개가 01~04를 직접 가리켜 레벨 선택을 겸한다.
- 난이도 곡선: 적 6→58→78→83→103, 객체 259→317→346→358→398로 단조 증가. 레벨 크기는 02에서 정점, 이후 세로 방향으로 길어진다.
- 레벨 01은 객체 링크가 426개로 가장 많아 스위치·문 연동이 촘촘한 첫 본 레벨로 보인다. 링크 의미는 unverified.
- 길이: 객체 수·맵 크기로 보아 01→04로 갈수록 길어진다. 실제 소요 시간은 측정하지 않았다.

## 6. 한계

타일 상위 비트 의미, 좌표 단위, `area_list`·`lights` 필드, LEVEL03 꼬리 58 B, `.CPF` 내용, 레벨 04 종료 화면, 실제 플레이 시간, 시각 팔레트는 모두 unverified. 소스 포팅·현대 포트·stub 분석으로 대체하지 않았다.

## 7. 다단계 설계 시사점 (New design)

아래는 원본 복원이 아니라 이 프로젝트의 신규 설계 제안이다. 근거는 위 1~5절.

1. **허브 + 선형 스테이지**: 원본의 00 허브(출구가 각 스테이지를 직접 연결)는 `Cryo Airlock`을 허브로 두고 섹터 문이 스테이지를 여는 구조와 맞는다. 선형 01→04는 3D Metroidvania의 잠금 문 순서(blue→green→yellow→red)에 대응시킬 수 있다.
2. **밀도 곡선**: 적 수를 첫 구역 대비 약 10배(6→58)로 키운 뒤 완만히 늘린 점을 따른다. 새 스테이지는 튜토리얼(적 거의 없음) → 첫 전투 구역 → 점증 구조로 둔다.
3. **스위치·문·게이트 중심 퍼즐**: 스위치와 문이 전투 요소만큼 많다(레벨 02: 스위치 66). 신규 스테이지에 스위치 연동 문과 논리 게이트를 구역당 몇 개씩 넣을 수 있다.
4. **체크포인트 간격**: 레벨이 길수록 재시작 지점이 늘어난다(1→6). 구역 크기에 비례해 Save/Recharge 스테이션을 배치한다.
5. **출구 연출**: 출구에서 액션 입력(아래)으로 전환. 3D 판에서는 출구 접촉 + 상호작용 키로 스테이지 전환과 짧은 전환 연출을 둔다.
6. **보류**: 시각 톤(팔레트)은 관찰 전이므로 새 스테이지 색 설계에 원본 팔레트 근거를 쓰지 않는다.
