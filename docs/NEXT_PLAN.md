# 다음 작업

Wave 2–3 완료. 남은 것은 푸시 승인과 사람 관찰이다.

## 사용자 확인 필요

- `git push origin main` 승인(현재 로컬 커밋만 존재).

## G5 — 사람 플레이 관찰

- `npm run dev`로 1회 이상 직접 플레이해 감각·난이도·탐험 흐름을 [EVALUATION.md](EVALUATION.md)에 기록.
- 관찰 후보: 머리 회전·방향 전환·점프 포즈의 자연스러움, 어두운 샤프트 가독성, 부츠 필수 구간(Shaft 4.4 m, Security 4.4 m)의 체감·막힘 여부, 봇 대비 사람 난이도, 미니맵 확장(Tab).

## G6 — 최종 정리·제출 준비

- 문서 링크(archive 제외)·`make check` 확인 완료. 남음: 실제 Chrome 환경에서 `make smoke-local`과 `capture-showcase.ts` 재실행(맵 변경 후), G5 사람 플레이, `git push`(사용자 승인 대기).
