#!/usr/bin/env bash
# 개발 서버(next dev) — 고친 곳이 바로 보이지만 CSS 순서 등은 운영 빌드와 다를 수 있다. 화면 최종 확인은 build.sh + start.sh 로.
# bash scripts/preview/dev.sh [포트=8096]
set -euo pipefail
PORT="${1:-${PORT:-8096}}"
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
echo "합성 개발 서버: http://127.0.0.1:${PORT}"
exec node node_modules/next/dist/bin/next dev --hostname "${HOST:-127.0.0.1}" --port "$PORT"
