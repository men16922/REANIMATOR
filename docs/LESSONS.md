# 작업 시 유의점

2026-11-14

- harness scaffold의 `make check` 문자열은 실제 gate가 아니다. 구현 전에 명령 존재와 검사 범위를 확인한다.
- 작업 전 `git status -sb`로 저장소 상태를 확인한다(작성 시점 main에 커밋 없음). 커밋·푸시는 사용자 지시 범위에서만 한다.
- Carbon 리뷰는 공통 harness `agy_invoke critic`의 plan 모드를 사용한다. 이 경로에는 권한 우회 플래그가 없다.
- 기존 BLACKOUT의 최신 문서는 EchoForge 데모 이후의 별도 게임을 설명한다. 오래된 기억 대신 현재 brief와 브랜치를 확인한다.

- REA 소스 package 버전·compiled runtime·Node 지원 범위는 별도 확인한다. 이번 실행점은 프로젝트 `scripts/rea.sh`다.
- DOS MZ 인식만으로 게임 본체 분석을 주장하지 않는다. stub/extender/overlay의 실제 분석 범위를 확인한다.
- 원본 바이너리 근거, Lisp/소스 열람, 동작 관찰을 분리한다. 기존 Carbon 리뷰를 새 대상 검토 결과로 재사용하지 않는다.

- 문서 수치는 직접 관찰한 명령 출력만 쓴다. 2.5D 단계 수치(30 tests, 9-file dist)가 3D 단계 문서에 남아 stale해지기 쉬우므로 갱신 시 `rg '30/30|5,171,090'`로 확인한다.
- 모델 크기·삼각형 수는 `ls -la public/assets/models`와 `reference/manifests/meshy-assets.json`에서 가져온다. 자산 교체 시 등록부를 함께 갱신한다.
- 봉인 파일(`src/engine/motion.ts` 등)은 신규 3D 작업에서도 수정하지 않는다. 신규 이동은 `src/engine/motion3d.ts`에 둔다.

- `operative.glb` Meshy `jump` 클립(`1.867s`)은 `0.00..0.50s` 지상 예비 웅크림과 `+0.42m` `Hips.y` 스파이크를 포함하므로 `vy` 기반 `0.53..1.08s` 직접 스크럽과 `hipsBaseY` 클램프가 필수다.
- Mixamo 리그는 팔 본 축이 `+Y` 기준이므로 양손 라이플 IK는 로컬 오일러 회전 대신 월드 기반 쿼터니언 정렬 + `riflePivot` 월드 기저 고정을 유지해야 360° 조준이 뒤틀리지 않는다.
- 가산(additive) 본 회전(`rotation.x -= …`)은 클립이 그 본을 애니메이션하지 않으면 프레임마다 누적된다. 매 프레임 기본 자세로 되돌린 뒤 적용한다(머리 회전 버그).
- PointLight 하나가 소프트웨어 WebGL fps를 크게 깎는다(5개 추가로 60→28 fps). 장식 광원은 emissive로 대체한다.

