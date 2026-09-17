#!/usr/bin/env bash
# Claude Code PostToolUse hook (Write|Edit|Bash): 수정 직후 자동 검증.
# - 마지막 검사 이후 바뀐 .ts/.tsx 파일이 있으면 증분 tsc를 돌리고, 파일 위치에 따라 관련 단위 스위트를 돌린다.
# - 실패하면 요약을 stderr로 내고 exit 2 → Claude에게 피드백된다. 바뀐 파일이 없으면 즉시 0으로 끝난다.
# - stdin(JSON)은 읽지 않는다. 어떤 도구로 파일을 바꿨든(Edit, Write, Bash heredoc, 외부 편집) git 기준으로 감지한다.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT" || exit 0
STAMP=".claude/.post-edit-check.stamp"
LOG=".claude/.post-edit-check.log"
mkdir -p .claude
cat >/dev/null 2>&1 || true   # drain stdin

changed="$( { git diff --name-only; git ls-files --others --exclude-standard; } 2>/dev/null | grep -E '\.(ts|tsx)$' | sort -u )"
[ -z "$changed" ] && exit 0
if [ -f "$STAMP" ]; then
  newer="$(printf '%s\n' "$changed" | while IFS= read -r f; do [ -n "$f" ] && [ -f "$f" ] && [ "$f" -nt "$STAMP" ] && printf '%s\n' "$f"; done)"
else
  newer="$changed"
fi
[ -z "$newer" ] && exit 0
touch "$STAMP"
count="$(printf '%s\n' "$newer" | grep -c .)"
started="$(date '+%H:%M:%S')"

fail() { # $1 = label, $2 = output
  printf '[post-edit-check] %s 실패 (%s, 바뀐 파일 %s개)\n' "$1" "$started" "$count" >&2
  printf '%s\n' "$2" | grep -vE '^\s+at ' | tail -30 >&2
  printf '%s FAIL %s files=%s\n' "$(date '+%F %T')" "$1" "$count" >> "$LOG"
  exit 2
}

out="$(npx tsc --noEmit 2>&1)" || fail "tsc" "$out"

suites=()
printf '%s\n' "$newer" | grep -qE '^(lib/plan-builder/(intake-|ksic|business-)|app/plan/chat/)' && suites+=(scripts/business-intake-ui.test.tsx)
printf '%s\n' "$newer" | grep -qE '^lib/plan-builder/(intake-core|intake-questions|intake-options|intake-sector|ksic)\.ts$' && suites+=(scripts/business-intake-questions.test.ts scripts/ksic.test.ts)
printf '%s\n' "$newer" | grep -qE '^lib/plan-builder/intake-(service|http|core|types)\.ts$' && suites+=(scripts/business-intake-service.test.ts)
printf '%s\n' "$newer" | grep -qE '^lib/plan-builder/(coach|coach-review|coach-document|business-hub|business-launch|coach-design)\.ts$' && suites+=(scripts/business-hub.test.ts)
ran=0
for s in "${suites[@]}"; do
  [ -f "$s" ] || continue
  extra=""; [ "$s" = "scripts/business-hub.test.ts" ] && extra="--state-only"
  out="$(NODE_ENV=test PERSISTENCE_MODE=demo-memory OPENAI_API_KEY= ANTHROPIC_API_KEY= node --import tsx "$s" $extra 2>&1)" || fail "$s" "$out"
  ran=$((ran + 1))
done
printf '%s OK tsc suites=%s files=%s\n' "$(date '+%F %T')" "$ran" "$count" >> "$LOG"
printf '[post-edit-check] 통과: tsc + 스위트 %s개 (바뀐 .ts/.tsx %s개)\n' "$ran" "$count"
exit 0
