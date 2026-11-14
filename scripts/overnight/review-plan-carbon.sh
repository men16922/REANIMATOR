#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HARNESS_ROOT="${OVERNIGHT_HARNESS_ROOT:-/Users/men1692/.codex/plugins/cache/overnight-harness/overnight-harness/1.9.0}"
source "$HARNESS_ROOT/templates/scripts/overnight/lib/engines.sh"
log() { printf '%s\n' "$*" >&2; }
run_with_timeout() {
  python3 -c 'import subprocess,sys; r=subprocess.run(sys.argv[1:],timeout=600); sys.exit(r.returncode)' "$@"
}
export AGY_CRITIC_MODEL=gemini-4-carbon-high AGY_CRITIC_EFFORT=high AGY_PRINT_TIMEOUT=9m
unset OVERNIGHT_CRITIC_MODEL
agy_routing_preflight critic
PROMPT="독립적인 제품/게임/해커톤 계획 리뷰를 한국어로 작성하라. 파일 수정과 명령 실행 없이 아래 제공된 계획만 검토하라. 사용자는 기존 Diablo Reverse(MYTHOS BLACKOUT) 및 REA로 고전 게임을 자신만의 버전으로 재제작, Kiroween 수상과 상품화를 원한다. 현재는 계획 단계다. 공식 확인: 2026-10-30 이후 신규 프로젝트, 기존 작업 공개시 활용 가능, Kiro 실제 사용 필수, 다섯 기준 각20%, 마감 12/05 07 KST, 공개 OSS repo와 .kiro 및 3분미만 시연 필요. 사용자 시험 11/28, 그전 검토 주1시간. 계획의 모순, 대상고객 혼선, 재미, REA가 장식인지, 범위, 변형 검증의 엄밀성, 일정, 읽기 쉬움에 집중. 1) 판정 2) P0/P1 문제 최대6개 3) 각 문제를 고칠 정확한 문구/규칙 4) 사용자에게 전달할 짧은 결론. 자체 점수를 수상확률로 표현하지 말 것. 계획:\n$(cat "$ROOT/docs/plans/REANIMATOR_PLAN.md")"
agy_invoke critic "$ROOT" "$PROMPT"
