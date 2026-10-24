#!/usr/bin/env bash
# 만든 빌드를 띄운다. bash scripts/preview/start.sh [포트=60207]
# 합성 로그인: http://127.0.0.1:<포트>/api/dev/synthetic-login?uid=syn-901&next=/plan/studio?new=1
set -euo pipefail
PORT="${1:-${PORT:-60207}}"
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
export NODE_ENV=production
if [ ! -f .next/BUILD_ID ]; then echo "빌드가 없습니다. 먼저 bash scripts/preview/build.sh" >&2; exit 1; fi
echo "합성 미리보기: http://127.0.0.1:${PORT}  (가짜 AI · 메모리 DB · 서버를 끄면 자료가 사라집니다)"
exec node node_modules/next/dist/bin/next start --hostname "${HOST:-127.0.0.1}" --port "$PORT"
