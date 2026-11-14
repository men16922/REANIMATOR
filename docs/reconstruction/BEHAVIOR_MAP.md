# Behavior map (G1)

2026-11-14 · Kiro 세션 · 원본 `ABUSE/ABUSE.EXE` sha256 `8ba92587d070936cc776be4d15e0e68f62859fb0e473b068ac608b812b01074f`.

## 주소 체계

- 원본은 MZ stub(0x0) + DOS/4GW + 내부 MZ(0x26654) + LE 헤더(0x290a4). 32비트 LE 객체 2개.
- 분석 대상은 변환본 `reference/derived/ABUSE.le.elf`(sha256 `3ba3582f…cc6ca6d`, `scripts/le2elf.py`). LE 객체 1(code, base 0x10000, 0x99619 bytes), 객체 2(data, base 0xb0000, 0x31920 bytes). 내부 fixup 17,885개(전부 32비트 offset) 적용, 미처리 0.
- **이 문서의 모든 주소는 LE 객체 linear 주소(= ELF vaddr)다.** 원본 파일 오프셋 = `0x4e854 + (page-1)*0x1000 + (addr - objbase) % 0x1000` (`reference/derived/ABUSE.le.json`의 mapping_rule).
- 변환 타당성: LE entry 0x9e0cc = 원본 파일 0xdc920 바이트 `EB 76 "WATCOM C/C++32 Run-Time system"`. 첫 data page 기준을 내부 MZ 상대로 해석해야 이 일치가 나온다.
- REA 직접 inspect(원본 EXE)는 MzLoader `x86:LE:16:Real Mode`로 **stub만** 열었다 → 게임 코드 분석으로 쓰지 않음.

## M-MOVE-01 · 수평 이동 입력 → 속도 → 위치 → 벽 충돌

| 단계 | 주소 | 근거 유형 | 내용 |
|---|---|---|---|
| 입력 훅 | 심볼 `get_local_input` 0xb1276 → 0xc8ff4, 호출자 0x5e2d3 | binary-static | 심볼이 함수로 정의되면 Lisp 평가, 결과 리스트를 첫 원소 xv(+0xca), 둘째 yv(+0xce) 등으로 저장 |
| 입력 정의 | `LISP/INPUT.LSP` `get_local_input` | script-read | xv = left -1 / right 1 / 0 |
| 캐릭터 이동 함수 | `LISP/PEOPLE.LSP` 500행 `(move_fun cop_mover)` | script-read | Lisp `cop_mover` 정의는 `/* */` 주석 처리. C 구현 사용 |
| `cop_mover` 등록 | 0x1ef04–0x1ef10: `add_lisp_function`(0x2720c) 번호 0x24, 인자 3 | binary-static | dispatcher 0x1f0fc case 0x24 → **0x14760** |
| `cop_mover` C | 0x14760 | binary-static | yvel(+10)>10이면 1 감소(종단 속도), 디컴파일 168행에서 **mover 0x3a1d8** 호출 |
| `mover` 등록 | 0x1d9c3–0x1d9d4: `add_c_function`(0x270d0) 번호 0x12, 인자 3 | binary-static | dispatcher 0x20634 case 0x12 → 0x3a1d8 |
| 능력치 조회 | 0x3d96f: `figures[type]->abil[idx]` (+0x16+idx*4) | binary-static | 이름 테이블 0xbc180: 0 start_hp,1 start_accel,2 stop_accel,3 jump_xvel,4 jump_yvel,5 run_top_speed,6 jump_top_speed,7 tint_color,8 push_xrange,9 walk_top_speed |
| 능력치 값(cop) | `PEOPLE.LSP` 486–495 | script-read | walk_top_speed 3, jump_yvel -15, run_top_speed 9, jump_top_speed 10, jump_xvel 9, stop_accel 9, start_accel 8 |
| 정지 상태 출발 | 0x3a265–0x3a279 (xm>0): dir=1, **xvel(+6)=run_top_speed**; 0x3a27e–0x3a294 (xm<0): dir=-1, **xacel(+0xe)=-run_top_speed** | binary-static | 좌우 비대칭 |
| 가속 | 0x3a9a2–0x3a9cc: xacel = ±start_accel | binary-static | |
| 속도 상한 | 0x3a9cf–0x3aa27: state 2/6→walk_top_speed, 10→run_top_speed, 3/4/5→jump_top_speed(xm=0이면 0), 기타 1000 | binary-static | |
| 클램프 | 0x3aa2c–0x3aa4b: \|xvel+xacel\|>limit → xacel=±limit−xvel | binary-static | |
| 정지 감속 | 0x3a3e0~ (xm=0): stop_accel(DL=2)로 감속, 부호 넘으면 xvel=xacel=0, state 2 | binary-static | 디컴파일 0x3a412/0x3a538 |
| 물리 적용 | 0x3aa5b → **0x38704**: xvel+=xacel 등, `try_move` 호출 후 x(+0x3e)/y(+0x42) += 잘린 변위 | binary-static | |
| try_move | **0x37e82**(obj=EAX,x=EDX,y=EBX,&xv=ECX,&yv,flags) | binary-static | flags&1: 끝점을 0x558e5로 자르고 xv=새x−x |
| 타일 충돌 | **0x558e5** | binary-static | 좌표/타일폭(0xc931c)·타일높이(0xc9320)로 검사 범위, 레벨 크기(+0xc/+0xe)로 끝점 클램프 |
| 객체 충돌 | 0x4d47c / 0x4d7ca ("bad x for object") | binary-static / inferred | 객체 목록 순회. 이번 시나리오에서는 미관찰 |
| 필드 의미 | x +0x3e, y +0x42, xvel +6, yvel +10, xacel +0xe, yacel +0x12, dir +0x4e, state +0x52 | inferred (정적 사용 + 관찰 일치) | Lisp `x`/`xvel` builtin 값과 관찰이 일치 |

### 정적 예측 vs 실행 관찰 (`g1_r1..3`, 3회 동일 해시)

| 입력/조건 | 정적 예측 | 관찰 (n: x, xvel, state) | 판정 |
|---|---|---|---|
| 정지→오른쪽 | xvel=9, xacel=8 → 클램프 0 → +9/tick | 90→91: 32→41, v=9, st 2→10 | 일치 |
| 정지→왼쪽 | xacel=-9 → -8 덮어씀, limit 9 → v=-8, 다음 -9 | 30→31: 58→50 v=-8, 32: 41 v=-9 | 일치 (비대칭 확인) |
| 달리기 중 반대 방향 | xacel=-8: 9→1→-7→-9 | run_e n175–177: v 1, -7, -9 | 일치 |
| 키 해제(v=9) | stop_accel 9 → 1 tick 정지, state 2 | 110→111: v 9→0, st 10→2 | 일치 |
| 왼쪽 벽 | try_move가 끝점 클램프 | 33: x=32 도달, 34: v=0 st=2, 60까지 x=32 유지(입력 -1) | 일치 (관통 없음) |
| 점프 | yvel=jump_yvel(-15), 이후 중력 yacel 누적 | 171: y 91→76 v=-15, 172–180 v -14,-12,-7,0,5,10,16,16,0 | 일치. 상승 감소는 천장이 아니라 중력. v8 로그 소수부 fy/fya가 8비트 고정소수 적분 규칙과 정확히 일치(아래) |

## 미관찰 경로

- walk_top_speed(3) 상한 경로(state 2/6에서 가속 지속), 객체 간 충돌, 사다리(climb_handler), 특수능력, 경사 이동의 y 보정 세부, 천장 충돌 판정 상세.
- RNG 관련 경로 전부: NOT RUN.

## M-GRAV-01 · 수직 적분·점프·착지 (G2에서 비교기로 판정)

근거: binary-static 0x14760(cop_mover), 0x3a1d8, 0x38704 + runtime-observed `docs/evidence/g2/runs/v8_r*`, `m04v8_r*`, `m05v8_r*` (각 3회 sha256 동일).

규칙(필드는 BEHAVIOR_MAP 상단 오프셋 참조, 구현은 `src/engine/motion.ts`):
1. **cop_mover 0x14760**: `if (yvel > 10) { yacel = 0; yvel -= 1 }` (터미널 속도). state 4에서 yvel>0이면 tick 시작에 state 5(하강).
2. **0x38704 적분**: `fyacel += 200`(올림 → yacel); `t = fyvel + fyacel`; `yvel += (t>>8) + yacel`. 음수 yvel/yacel이면 소수부를 `(-v)&255`로 반전해 더한다. 중력 상태(gravity)에서만.
3. **이동 후**: `yvel = 실제 변위`. 천장(관찰 y=43)에서 -9가 -7로 잘리고 다음 tick yvel 0. 바닥(y=91)에서 yvel/yacel/소수부 0, gravity 0, state 6(3 tick) 후 2.
4. **점프 시작**: 지상 state 2/10에서 ym<0 → yvel=-15, state 4, gravity 1. 벽에 막혀도 state 4 유지(xacel 0).
5. **공중 좌우**: state 5에서 xm≠0이면 xacel=±start_accel(8), 상한 jump_top_speed(10)은 자유 비행에서 **미검증**. 벽에 막혀도 공중에서는 xacel 유지, 지상에서는 xacel=0·state 2.

정정: G1 시점의 "점프 상승 감소는 중력이며 천장이 아님"은 부분적으로 틀렸다. 중력 + 천장(y=43) 둘 다 작용한다.

판정: S1·S2·S3 개발 PASS, holdout M05 PASS (`docs/evidence/G2_REPORT.md`).
