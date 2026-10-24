# 합성 미리보기 공통 설정 — build.sh·start.sh·dev.sh·start-real.sh 가 불러 쓴다(직접 실행하지 않는다).
# 비밀 값은 여기에 두지 않는다. 관리자 비밀번호·세션 비밀은 실행 때마다 새로 만든 일회용 값을 쓴다(환경 변수로 넘기면 그 값을 쓴다).
# 모든 합성 기능(가짜 로그인 syn_uid·/api/dev/synthetic-*)은 SYNTHETIC_AUTH=1 + PERSISTENCE_MODE=demo-memory + APP_ENV=prelaunch
# 셋이 모두 맞을 때만 켜진다(lib/synthetic-preview.ts). 운영 배포에는 이 값들이 없다.

# 저장소 맨 위에서 실행한다
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1
if [ ! -x node_modules/.bin/next ]; then echo "node_modules 가 없습니다. 먼저 npm ci 를 실행하세요." >&2; exit 1; fi

# 개인 설정 파일(.env.local 등)이 있으면 멈춘다 — Next 가 그 안의 운영 DB·문자·메일 키를 함께 읽기 때문이다.
# (.env.production 은 저장소에 커밋된 운영 공개 설정이라 그대로 둔다.) 깨끗한 작업 폴더(git worktree·클라우드)에서 실행하세요.
for f in .env .env.local .env.production.local .env.development.local .dev.vars; do
  if [ -f "$f" ]; then echo "멈춤: $f 가 있습니다. 비밀 값이 섞이지 않게 이 파일이 없는 작업 폴더에서 실행하세요." >&2; exit 1; fi
done

random_secret() { node -e 'process.stdout.write(require("node:crypto").randomBytes(24).toString("base64url"))'; }

# 일회용 관리자 비밀번호·세션 비밀(넘겨 준 값이 있으면 그 값). 이 미리보기 서버에만 쓰이고 어디에도 저장하지 않는다.
export ADMIN_CHAT_PASSWORD="${ADMIN_CHAT_PASSWORD:-$(random_secret)}"
export ADMIN_SESSION_SECRET="${ADMIN_SESSION_SECRET:-$(random_secret)}"

export NEXT_TELEMETRY_DISABLED=1
export PERSISTENCE_MODE=demo-memory
export SYNTHETIC_AUTH=1
export APP_ENV=prelaunch
export NEXT_PUBLIC_APP_ENV=prelaunch
# 개발 전용 값(비밀 아님) — 합성 계정의 프로젝트 토큰을 만드는 데만 쓴다
export AUTH_PROJECT_SECRET=synthetic-preview-only-secret
export BUSINESS_JOURNEY_LAB=true
export HOMEPAGE_EDITOR_PREVIEW_EMAILS="${HOMEPAGE_EDITOR_PREVIEW_EMAILS:-syn-1@synthetic.invalid}"
export LLM_TEXT_PROVIDER=anthropic
export PAYMENTS_ENABLED=false
export PROPOSAL_AI_ENABLED=false
export OPERATING_AI_ENABLED=false
export NEXT_PUBLIC_BUSINESS_INTAKE_V2=1
export INTAKE_LIVE_COMMENT=1
export INTAKE_ANSWER_SUGGESTIONS=1
export NEXT_PUBLIC_INTAKE_COACH_CHAT=1
export NEXT_PUBLIC_INTAKE_EDIT_CHAT=1
export NEXT_PUBLIC_STUDIO=1
# 셸에 남아 있을지 모르는 운영 DB·다른 AI 키를 지운다
unset SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY OPENAI_API_KEY

# 가짜 AI — api.anthropic.com 으로 가는 요청만 가로채 합성 답을 준다(실제 호출 0원). start-real.sh 는 이 두 줄을 덮어쓴다.
export ANTHROPIC_API_KEY=synthetic-not-a-real-key
export NODE_OPTIONS="--import ./scripts/synthetic-e2e/fake-anthropic.mjs"
