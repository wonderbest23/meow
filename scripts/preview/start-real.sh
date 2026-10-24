#!/usr/bin/env bash
# 진짜 AI(Anthropic)로 띄운다 — 돈이 든다. 소유자가 허락한 실험에서만 쓴다(무료 크레딧 확인 · LLM_MAX_KRW 로 상한).
# 키는 환경 변수 ANTHROPIC_API_KEY 로만 받는다(파일에서 읽지 않는다). 비용 기록은 LLM_USAGE_LOG(기본 tmp/real-usage.jsonl).
#   ANTHROPIC_API_KEY=... LLM_MAX_KRW=40000 bash scripts/preview/start-real.sh [포트=60209]
# 빌드는 build.sh 로 만든 것을 그대로 쓴다.
set -euo pipefail
PORT="${1:-${PORT:-60209}}"
REAL_KEY="${ANTHROPIC_API_KEY:-}"
if [ -z "$REAL_KEY" ] || [ "$REAL_KEY" = "synthetic-not-a-real-key" ]; then echo "ANTHROPIC_API_KEY 환경 변수가 필요합니다." >&2; exit 1; fi
if [ -z "${LLM_MAX_KRW:-}" ]; then echo "LLM_MAX_KRW(원 단위 비용 상한)를 정해 주세요. 예: LLM_MAX_KRW=40000" >&2; exit 1; fi
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
export NODE_ENV=production
export ANTHROPIC_API_KEY="$REAL_KEY"
mkdir -p tmp
export LLM_USAGE_LOG="${LLM_USAGE_LOG:-$PWD/tmp/real-usage.jsonl}"
# 가짜 AI 대신 사용량 기록기(상한을 넘으면 막는다)
export NODE_OPTIONS="--import ./scripts/synthetic-e2e/llm-usage-logger.mjs"
if [ ! -f .next/BUILD_ID ]; then echo "빌드가 없습니다. 먼저 bash scripts/preview/build.sh" >&2; exit 1; fi
echo "진짜 AI 미리보기: http://127.0.0.1:${PORT}  (상한 ${LLM_MAX_KRW}원, 기록 ${LLM_USAGE_LOG})"
exec node node_modules/next/dist/bin/next start --hostname "${HOST:-127.0.0.1}" --port "$PORT"
