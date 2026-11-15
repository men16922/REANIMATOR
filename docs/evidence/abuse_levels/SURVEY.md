# Abuse LEVEL00..04 정적 조사 (FEAT-001)

기계 출력은 `survey.json`(`node tools/reference/spe-survey.ts`). 원본 바이트는 담지 않고 개수·크기·좌표·이름만 기록한다. 런타임 관찰(DOSBox)은 FEAT-002이며 이 문서 범위가 아니다(unverified).

## 방법별 사실

### Binary parse (SPE 구조, 5개 파일 모두 검증)

- 헤더 `SPEC1.0\0`, u16 섹션 수, 항목 = `type u8, nameLen u8, name(NUL 포함), flag u8, size u32, offset u32`. 섹션은 디렉터리 직후부터 연속이며 LEVEL03만 `first name` 섹션(20 B)이 추가되고 마지막 섹션 뒤에 58 B 꼬리가 남는다(꼬리 의미 unverified).
- `fgmap`/`bgmap` = `u32 w, u32 h, u16[w*h]`(크기 산술 일치).
- 객체는 열 지향 배열: `type`(u16, `describe_names` 인덱스), `x`·`y`(i32), `aistate`(u16) 등, 각각 1 B 버전 접두. 길이 = 1 + n×원소 크기가 `object_list`의 개수와 일치.
- `area_list.v1`·`object_links`·`light_links` = 버전 1 B + u32 개수 + 고정 길이 레코드(44 B / 8 B / 8 B). `lights` = u32 개수 + 25 B 레코드(레코드 필드 의미 unverified).

| 레벨 | fgmap | bgmap | 객체 | 적 | 픽업(HEALTH 등) | 무기 아이콘 | 문 | 스위치 | 게이트 | 체크포인트 | 영역 | 조명 | 객체 링크 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 00 | 100×100 | 33×33 | 259 | 6 | 31 | 17 | 8 | 35 | 4 | 1 | 12 | 58 | 82 |
| 01 | 100×120 | 33×38 | 317 | 58 | 22 | 30 | 16 | 49 | 16 | 3 | 7 | 95 | 426 |
| 02 | 150×150 | 45×45 | 346 | 78 | 41 | 34 | 20 | 66 | 17 | 6 | 11 | 102 | 173 |
| 03 | 100×150 | 33×45 | 358 | 83 | 36 | 45 | 15 | 56 | 19 | 5 | 13 | 85 | 235 |
| 04 | 110×160 | 35×48 | 398 | 103 | 40 | 32 | 12 | 47 | 21 | 6 | 15 | 97 | 256 |

- 범주 분류는 이름 기반 휴리스틱(inference)이다. 정확한 이름별 개수는 `survey.json`의 `objectCountsByName`.
- 적 이름: ANT_ROOF, HIDDEN_ANT, ANT_CRACK, SPRAY_GUN, TRACK_GUN, JUGGER, ROB1, WHO. LEVEL00은 WHO 6개와 LAVA 71개로 적 대신 지형·튜토리얼 중심, LEVEL01부터 ANT 계열과 SPRAY_GUN, LEVEL02부터 JUGGER·ROB1, LEVEL04는 ANT_ROOF 62개로 최다.
- 오브젝트 좌표 범위(픽셀 가정, unverified): x 30~3115, y 27~1649.
- 객체 수는 259→317→346→358→398로 단조 증가, 적 수는 6→58→78→83→103.

### Lisp reading (`LISP/PEOPLE.LSP`, `STARTUP.LSP`, `TELEPORT.LSP`, `POWERUP.LSP`, `DOORS.LSP`, `SWITCH.LSP`)

- 첫 레벨: `STARTUP.LSP`가 `levels/level00.spe`(트레이너), `skip_trainer_level`이면 `level01.spe`.
- 다음 레벨: `NEXT_LEVEL`(`next_level_ai`)이 플레이어 접촉 + 액션 키에서 `"levels/level"+digstr(aistate,2)+".spe"`를 `request_level_load`. `aistate == end_level`이면 `request_end_game`. `end_level`은 `register/people.lsp`가 없으면 5(셰어웨어), 있으면 19.
- `NEXT_LEVEL_TOP`은 출구 위쪽 장식(바닥 높이 보정). `TP_DOOR`는 두 문을 링크해 액션 키로 순간이동한다. `RESTART_POSITION`은 사망 재시작 지점. 사망 시 `restart_player`가 저장 파일 또는 현재 레벨을 다시 로드하고 HP를 100으로 되돌린다(싱글).
- 문(`SWITCH_DOOR`)은 링크된 키/스위치가 있으면 차단, 열리면 상태 전환. 스위치류는 액션 키와 거리(x<20, y<30)로 작동.

### Binary parse × Lisp reading 결합(레벨 진행)

| 레벨 | START (x,y) | NEXT_LEVEL 목표(aistate) |
|---|---|---|
| 00 | (58,61) | 6개: (1635,936)→01, (1725,936)→02, (1935,936)→03, (2025,936)→04, (105,651)→01, (2655,1431)→01 |
| 01 | (167,43) | level02 |
| 02 | (55,683) | level03 |
| 03 | (629,94) | level04 |
| 04 | (58,88) | 5 = `end_level` -> 게임 종료 |

LEVEL00은 4개 출구가 레벨 1~4를 직접 가리키는 선택 허브(트레이너)다. 이 결합은 NEXT_LEVEL 객체의 aistate 값(바이너리)과 `next_level_ai`(Lisp)의 일치에서 얻었고 실제 플레이로는 확인하지 않았다(unverified).

## Observation / Inference

- Observation: [ABUSE_LEVEL_OBSERVATION.md](../../reference/ABUSE_LEVEL_OBSERVATION.md) 3절(DOSBox 실행, 00→01→02→03→04 전환 확인).
- Inference: 선형 진행 01→02→03→04→종료, 레벨 크기와 적 밀도가 증가하는 난이도 곡선(객체·적 수 근거).

## 한계

- 타일 상위 비트(0x8000) 의미, 좌표 단위, `area_list`·`lights` 필드 의미, LEVEL03 꼬리 58 B는 unverified.
- `.CPF` 파일(7~10 KB)은 열지 않았다(unverified).
