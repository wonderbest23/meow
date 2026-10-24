#!/usr/bin/env bash
# 운영과 같은 빌드(next build, NODE_ENV=production)를 합성 미리보기 설정으로 만든다. 저장소 맨 위에서: bash scripts/preview/build.sh
# 메모리가 적으면 BUILD_LOW_MEMORY=1 bash scripts/preview/build.sh (느리지만 끝까지 간다)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
export NODE_ENV=production
node node_modules/next/dist/bin/next build
