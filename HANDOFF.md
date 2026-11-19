# 오늘창업 인수인계 (2026-11-19)

다른 Claude 계정이나 다른 컴퓨터에서 이어서 작업할 때 **이 문서부터** 읽는다.

- 2026-09까지의 예전 기록: [docs/archive/HANDOFF-2026-09.md](docs/archive/HANDOFF-2026-09.md)
- 작업 규칙 요약은 저장소 맨 위 [CLAUDE.md](CLAUDE.md)에 있고, Claude Code가 이 폴더를 열면 자동으로 읽는다.
- **이 저장소는 공개(PUBLIC)다.** 비밀값, 계좌·주민·사업자 개인정보, 이메일·전화번호, 서버 접속 정보는 여기에 쓰지 않는다. 그런 내용은 외장하드의 비공개 인수인계 문서에 있다(10장).

---

## 0. 5분 요약

| 항목 | 내용 |
| --- | --- |
| 서비스 | oneulstart.com. 대화로 사업 방향을 정리하고, 사업계획서(49,000원)와 홈페이지를 만들어 준다. |
| 계획서의 성격 | 창업자가 실제로 시작하고 운영하는 **실행 문서**다. 정부지원(예창패·PSST) 제출용이 아니다. |
| 말투 방향 | 아무리 작은 사업이라도 "나도 할 수 있겠다"는 희망을 주되, 숫자는 실제 값만 쓰고 보장 표현은 하지 않는다. 철학자 인용은 출처가 확인된 것만(`lib/plan-builder/philosophy-quotes.ts`). |
| 저장소 | https://github.com/wonderbest23/meow , 기본 가지 `main` |
| 운영 | Cloudflare Workers(워커 이름 `today-startup`) + Supabase(운영 프로젝트 `newapp`). **`main`에 병합하면 GitHub Actions가 바로 운영에 배포한다.** iOS 앱도 oneulstart.com을 그대로 불러오므로 웹 변경이 곧 앱 변경이다. |
| 코드 상태 | 진행 중이던 작업 가지는 모두 PR로 병합됐다(#414~#439). 로컬에만 있는 코드 변경은 없다. |
| 지금 운영 버전 | #439까지 반영(2026-11-18 배포 성공). 이 문서가 병합되면 그 뒤 버전. |
| 오픈 걸림돌 | ① **결제가 닫혀 있음**(실제 나이스페이 열쇠 미등록, 사장님 몫) ② 실제 계획서 1편 확인(AI 비용, 허락 필요) ③ 사장님 알림 메일 시험 ④ 결제 화면에 계좌이체 길이 없음(결정 필요). 자세한 것은 7장. |

---

## 1. 작업 규칙 (사장님 지시 — 꼭 지킨다)

1. **한국어로만 말한다.** 진행 안내, 마무리 요약, 대화 요약 직후 첫 답까지. 영어 용어와 코드식 주소는 쉬운 말로 풀어 쓴다. 코드·커밋 메시지·식별자는 그대로 둔다. PR 설명은 한국어로.
2. **실제 AI(API)는 부르기 전에 묻는다.** 크기와 상관없이(20원짜리 시험도) 호출 횟수와 대략 비용을 말하고 허락을 받는다(2026-11-18부터). 운영 사이트에서 손님 대화를 해 보는 것도 AI를 부르므로 해당된다. 묻지 않아도 되는 것: 가짜 AI 미리보기, 단위 시험, 신뢰성 시험, 타입 검사, 로그 읽기, AI를 안 부르는 HTTP 확인.
   - 참고 원가: 첫 문장 읽기(Opus) 1회 약 16원, 사업 방향 정리 약 150~170원, 손님 한 명이 방향 카드까지 약 200~300원, 계획서 1편 약 5,000~8,500원, AI 손님 41명 전수 점검 1회 약 3.4~3.9만원.
   - 숨은 비용: 작업실의 홈페이지 탭은 **열기만 해도** AI 초안을 만든다(`POST /api/plan/landing`). 계획서 만들기 버튼은 결제 전에도 첫 항목 1개를 무료로 써 준다(AI 비용).
3. **비밀번호·카드·식별 번호는 Claude가 입력하지 않는다.** 로그인, 회원가입 비밀번호, 결제 정보, CLI 로그인(`wrangler login`, `supabase login`, `gh auth login`)은 사장님이 한다. 사장님이 비밀번호를 모르면 재설정 메일·카카오 로그인·새 시험 계정을 안내한다.
4. **비밀값은 절대 화면·문서·커밋에 내보내지 않는다.** `.env*`, `.dev.vars`, wrangler 설정 파일의 값은 열어 출력하지 않는다. 변수 이름만 다룬다. 저장소가 공개라서 휴대폰 캡처(이메일·아바타 보임)나 개인 데이터가 든 파일도 커밋하지 않는다.
5. **병합은 사장님이 "병합해"라고 할 때만.** 병합 = 운영 배포다. 병합한 뒤에는 배포를 끝까지 지켜보고(`gh run watch`) 운영 상태를 확인한다.
6. **운영 DB 변경은 명시적 OK를 받고 한다.** 마이그레이션 적용 방법은 4장.
7. **커밋 직전에는 항상** `npm run lint`(타입 검사)와 `node --import tsx scripts/reliability-tests.mts`(신뢰성 시험)를 다시 돌린다. 문구만 바꿔도 시험이 문구를 검사하는 경우가 있다.
8. **흐름 통과가 아니라 값이 말이 되는지 본다.** 손님이 읽는 내용(채운 값, AI 답, 말투)을 바꾸면 다양한 사업 문장으로 0원 확인을 하고, 허락받은 뒤 실제 AI로 확인한다. 보고할 때 "흐름 시험"인지 "내용 확인"인지 밝힌다.
9. **땜질보다 구조.** 사업마다 규칙을 덧붙이지 않는다. AI가 글을 읽어 사실 표를 채우고, 코드는 검증·계산만 하는 방향.
10. **출시 걸림돌을 움직이는 일만 제안한다.** 2026-11-13 사장님 말: "결과물 + UIUX 관련만". 바쁘기만 한 다듬기, 대규모 재점검, 로컬 모델 실험은 걸림돌을 푸는 경우가 아니면 제안하지 않는다. 계획서 품질 라운드는 2026-10-29 "여기까지" 이후 요청이 없으면 하지 않는다.
11. **UI는 글을 최소로.** 제목·단추가 이미 말하는 설명은 넣지 않는다. 기본 애니메이션을 넣고 움직임 줄이기 설정이면 끈다. 법적 고지는 줄이되 없애지 않는다. UI PR은 병합 제안 전에 375px·1280px에서 메뉴·드롭다운·빈 상태·채운 상태를 직접 눌러 본다.
12. 사장님은 개발자가 아니다. 쉬운 말로, 정확한 클릭 경로와 그대로 붙여넣을 명령으로 안내한다. 사장님은 Claude가 직접 해 주길 원한다(로그인·결제·비밀번호만 예외). 오늘창업과 아트앤브릿지(다른 사업)를 섞지 않는다.

---

## 2. 새 계정·새 컴퓨터에서 처음 설정하기

### 경우 A — 같은 Mac, 같은 macOS 사용자에서 Claude 계정만 바꾼 경우
- 옮길 것이 없다. 저장소(`~/Developer/meow-main`), 로그인 상태(gh, wrangler), 비밀 파일, Claude 메모(`~/.claude/…`)가 모두 macOS 사용자 폴더에 있어서 그대로 쓸 수 있다.
- Claude Code에서 이 저장소 폴더를 열고 시작하면 된다. 저장소의 `CLAUDE.md`와 `.claude/settings.json`(수정 뒤 자동 타입 검사 훅)이 자동으로 적용된다.

### 경우 B — 다른 macOS 사용자이거나 다른 Mac인 경우
1. 저장소 받기
   ```bash
   git clone https://github.com/wonderbest23/meow.git ~/Developer/meow-main
   ```
2. Node 22 이상 설치(CI가 22를 쓴다. 이전 Mac은 26으로도 시험 통과), 그다음 저장소 맨 위에서:
   ```bash
   npm ci
   ```
3. 사장님이 직접 로그인할 것(Claude는 못 함)
   - GitHub: `gh auth login`
   - Cloudflare(운영 로그·비밀값 이름 보기): `npx wrangler login` — 브라우저에서 로그인한 뒤 **"Allow"까지** 눌러야 끝난다.
   - Supabase CLI(마이그레이션할 때만): `supabase login` — 실제 터미널 입력이 필요하다.
4. 비밀 파일 옮기기(사장님이 직접, GitHub에 올리면 안 됨): `.env.local`(운영 DB를 가리킴, 조심), `.env.eval.local`(실험용 AI 키), `.env.nicepay-sandbox.local`. 없어도 신뢰성 시험과 가짜 AI 미리보기는 돈다.
5. Claude 메모 옮기기(선택): 외장하드의 비공개 인수인계 폴더에 메모 원본 사본이 있다(10장). 새 사용자의 `~/.claude/projects/-Users-<새사용자이름>-Developer-meow-main/memory/`에 넣으면 이전 대화에서 쌓인 규칙·참고 자료가 이어진다. 전역 규칙 `~/.claude/CLAUDE.md` 사본도 같은 폴더에 있다.
6. 확인
   ```bash
   npm run lint
   ```
   ```bash
   node --import tsx scripts/reliability-tests.mts
   ```
   마지막 줄이 `182/182 reliability suites passed`처럼 전부 통과로 나오면 된다(이 문서 시점 182개).

---

## 3. 매일 쓰는 명령

| 하려는 일 | 명령 | 비용 |
| --- | --- | --- |
| 타입 검사 | `npm run lint` (= `tsc --noEmit`). CI는 타입 검사를 안 돌리므로 직접 돌린다. | 0원 |
| 신뢰성 시험 전체(CI와 같음) | `node --import tsx scripts/reliability-tests.mts` — 외부 네트워크를 막고, 비밀 변수를 지운 채 스위트마다 따로 돈다. | 0원 |
| 시험 파일 하나 | `node --require ./scripts/ledger-test-runtime.cjs --import tsx scripts/<이름>.test.ts` | 0원 |
| 새 시험 등록 | `scripts/reliability-tests.mts`의 `suites.push(...)`에 이름을 넣어야 CI에서 돈다. | — |
| 운영과 같은 빌드(가짜 AI) | 깨끗한 폴더에서 `bash scripts/preview/build.sh` → `bash scripts/preview/start.sh 60207` | 0원 |
| 합성 로그인 | `http://127.0.0.1:60207/api/dev/synthetic-login?uid=syn-901&next=/plan/studio?new=1` | 0원 |
| 실제 AI 미리보기 | `ANTHROPIC_API_KEY=<키> LLM_MAX_KRW=<상한> bash scripts/preview/start-real.sh 60209` — 상한이 없으면 시작을 거부한다. | **유료, 먼저 허락** |
| 배포 지켜보기 | `gh run list --repo wonderbest23/meow --limit 3` → `gh run watch <번호> --repo wonderbest23/meow --exit-status` | — |
| 운영 상태 | `curl -s https://oneulstart.com/api/health/persistence` → `"status":"ready"`면 정상 | 0원 |
| 운영 로그 | `npx wrangler tail today-startup --format pretty` (`--status error`, `--search <글자>`) | 0원 |

**미리보기 주의**
- `scripts/preview/*.sh`는 `.env`, `.env.local` 같은 개인 설정 파일이 있으면 멈춘다(운영 DB·키가 섞이지 않게). 원래 저장소 폴더에는 `.env.local`이 있으므로, 깨끗한 작업 폴더를 따로 만든다:
  ```bash
  git worktree add ../meow-preview origin/main && cd ../meow-preview && npm ci
  ```
- `next dev`는 운영 빌드와 CSS 순서가 달라 운영에서만 나는 문제를 못 본다. 최종 확인은 `build.sh` + `start.sh`.
- 가짜 AI 미리보기의 한계(제품 버그 아님): 계획서 "작성 시작"이 503(Cloudflare Workflow가 없어서), 합성 로그인은 손님 대화를 계정으로 옮기는 실제 코드를 건너뛴다. 계획서는 `POST /api/dev/synthetic-generate {planId}`로 만든다.
- 내장 브라우저 창이 가려져 있으면 페이지가 아주 느리게 뜬다. 사이트 문제가 아니다.

---

## 4. 배포와 운영

- **배포 순서**(`.github/workflows/deploy.yml`): `main` push → `npm ci` → 신뢰성 시험(실패하면 배포 안 함) → `npm run deploy`. 새 push가 오면 돌던 배포는 취소된다. 보통 3분 30초~5분.
- `npm run deploy` = `predeploy-guard` → `opennextjs-cloudflare build` → **`node scripts/ascii-worker-bundle.mjs`** → `opennextjs-cloudflare deploy .open-next/ascii/cloudflare-worker.js --no-bundle`
  - ASCII 단계(#438)가 왜 있나: 서버 파일이 약 5천만 자인데 정규식 속 한글이 남아 있으면 V8이 파일 전체를 2배 메모리로 올린다. 그래서 워커가 시작하자마자 119MB(한도 128MB)를 써서 사업 방향 정리 같은 긴 작업이 "Worker exceeded memory limit"로 죽었다. 남은 글자를 `\uXXXX`로 바꾸면 68MB로 시작한다. 이 단계를 빼면 같은 장애가 돌아온다. 시험 `ascii-worker-bundle`이 지킨다.
- **Cloudflare Workflows**(긴 AI 작업이 여기서 돈다): `today-startup-plan-sections`(사업 방향 정리, 계획서 장 생성 등, `lib/plan-builder/section-workflow.ts`), `today-startup-draft-package`, `today-startup-direct-plan`. 워커가 자기 자신을 서비스 바인딩(`WORKER_SELF_REFERENCE`)으로 부른다.
- **메모리 장애 찾기**: `wrangler tail`에서 결과가 `exceededMemory`인 요청을 본다. 7일치 통계는 Cloudflare GraphQL의 `workersInvocationsAdaptive`(필터 `scriptName: "today-startup"`, 차원 `status`)로 볼 수 있다. 로컬 측정은 `wrangler dev --inspector-port <포트>`로 띄우고 개발자 도구 프로토콜의 `Runtime.getHeapUsage`로 잰다.
- **운영 설정 값**: 일반 설정은 `wrangler.jsonc`의 `vars`(배포할 때마다 이 값으로 덮어쓴다). 비밀값은 워커 secret이다. 이름 목록만 보기: `npx wrangler secret list --name today-startup`. 값 넣기는 사장님이 `npx wrangler secret put <이름> --name today-startup`에 직접 붙여 넣는다.
- **운영 DB 마이그레이션**(사장님 OK 먼저):
  - 운영 DB의 마이그레이션 기록이 저장소와 맞지 않는다(예전에 손으로 적용한 것들). 그래서 **그냥 `supabase db push`는 절대 하지 않는다** — 오래된 마이그레이션 약 25개를 다시 돌리려 한다.
  - 새 파일 하나만 적용하는 방법: 임시 폴더에 원격에 이미 있는 버전마다 빈 파일을 두고 새 파일 하나만 넣어 `supabase db push --dry-run`으로 그 하나만 나오는지 확인한 뒤 적용하거나, Supabase 대시보드 SQL 편집기에 붙여 실행한다. 자세한 순서는 비공개 인수인계 문서에 있다.
  - SQL은 반복 실행해도 안전하게(`if not exists`, `create or replace`). 새 파일은 `lib/schema-readiness.ts`에 추가하고, **그 코드를 병합하기 전에** 운영 DB에 먼저 적용한다. 확인은 `/api/health/persistence`가 `ready`인지와 관리자 화면 `/admin/schema`.

---

## 5. 코드 지도 (대화 → 사업 방향 → 계획서 → 결제)

| 파일 | 하는 일 |
| --- | --- |
| `app/plan/chat/BusinessIntake.tsx` | 대화 화면(손님·로그인 모두)의 본체. 질문 진행, 첫 문장 읽기·AI 읽기·답변 추천 호출. |
| `app/api/plan/chat/route.ts` | 대화 명령 저장, 사업 방향 정리·계획서 생성을 Workflow로 보냄, 결제 전 미리보기 1장 처리. |
| `app/api/plan/chat/understand/route.ts` | 첫 사업 문장을 사업마다 한 번 AI로 읽어 말한 값과 짐작을 넣는다. 늦은 저장은 버리고, 대화가 진행된 뒤에는 다시 읽지 않는다(#439). |
| `lib/plan-builder/idea-understanding.ts` | 첫 문장에서 말한 값 + 말하지 않은 칸 짐작(업종·운영 범위·운영 중 여부 포함). |
| `lib/plan-builder/intake-reader.ts` | 질문에 대한 답을 작은 AI(Haiku)가 읽어 고칠 칸을 돌려준다. |
| `lib/plan-builder/live-comment.ts` | 첫 설명 옆 AI 한마디(두 문장, 저장 안 함). |
| `lib/plan-builder/coach-design.ts` | 사업 방향 카드의 지시문(`BUSINESS_DESIGN_RULES`)과 검증. |
| `lib/plan-builder/intake-service.ts` / `intake-core.ts` | 대화 상태 저장·AI 작업 실행 / 질문·답·계산의 핵심 로직. |
| `lib/plan-builder/intake-timing.ts` | 시간 상수와 "첫 문장 읽기를 아직 할 때인지" 판단. |
| `lib/plan-builder/section-prompt-v3.ts` | 계획서 장 작성 지시문(희망 말투, 철학 인용 규칙 포함). |
| `lib/plan-builder/section-workflow.ts` | Workflow 본체(사업 방향 정리, 계획서 장 생성). |
| `lib/llm/complete.ts` | AI 호출 공통부(JSON 꺼내기·손질, 사용량 기록). |
| `lib/payments/nicepay-environment.ts` | 결제 환경. 운영에서 시험용(sandbox)이면 결제를 막는다. |
| `app/plan/pay/PlanCheckout.tsx` | 결제 화면. 금액은 서버(`/api/payments/plan/prepare`)가 정한다. |

---

## 6. 최근 병합 (2026-11-14 ~ 11-18)

- #439 첫 문장 읽기: 대화가 진행된 뒤 다시 연 화면에서는 AI를 다시 부르지 않음(운영에서 다시 열 때마다 약 32원 + 다음 요청 409가 나던 문제).
- #438 운영 메모리 초과 고치기: 배포 파일의 남은 한글을 `\uXXXX`로(시작 메모리 119MB → 68MB). 운영에서 사업 방향 정리가 3번 연속 실패하던 원인.
- #437 사업 방향의 첫걸음을 작게(조사 수가 20명을 넘으면 "먼저 5~10명" → "개업 전까지 전체" 두 걸음).
- #436 각본 점검 시험(AI 답을 정해 두고 한 대화를 끝까지).
- #435 이미 운영 중인 가게: 목표를 "6개월 안에 손익분기"로 채우지 않고, 예산은 "새로 해 볼 일에 쓸 돈"으로.
- #434 지나가듯 "그건 많아요"라고 한 값은 기준값을 걷어 내고 다시 묻기.
- #433 첫 AI 한마디: "될 수 있는 까닭" → "먼저 풀 한 가지".
- #432 운영 범위를 AI가 사업에 맞춰 짐작. #431 업종을 AI가 글 전체로 짐작.
- #430 홈의 "어떤 사업이든" 구역: 한 손님의 기획 과정 다섯 단계를 자동 넘김으로.
- #429 사업 방향 정리 JSON 깨짐 줄이기. #428 질문 답·방향 뒤 대화를 AI가 읽고 판단 + AI 손님 전수 점검 도구.
- #427 말하지 않은 칸을 AI가 짐작. #426 방향 카드 뒤 대화를 바로 반영. #425 애니메이션 작은 묶음. #424 첫 답 409 막기.
- #423 계획서에 철학자의 말. #422 "생각하며 채우는" 채움 상자. #421·#420 로그인 안 한 손님 대화 + 손님 AI 하루 한도(전체 2,000단위, 1명 60단위).
- #419 계획서 돈 계산. #418 대화 답 고치기. #417 사이트 표기·신뢰. #416 흐름 6곳. #415 희망적인 계획서 글. #414 결제 안전장치.

---

## 7. 출시 준비 현황 (2026-11-18 밤 기준)

### 확인한 것 (운영에서)
- 손님 대화 → 사업 방향 카드까지 정상(#438 뒤 32초 만에 완료, 메모리 오류 없음).
- 로그인 안 한 손님의 대화가 **로그인 뒤 계정에 그대로 따라온다**(답, 방향 카드, 첫걸음 모두).
- 화면을 다시 열어도 첫 문장 읽기 AI가 다시 불리지 않는다(#439). 단, "처음 읽기가 늦게 끝난 뒤 다시 연" 바로 그 경우는 운영에서 재현하지 못했고 시험으로만 확인.
- 통신판매업 표시: 운영 푸터에 "신고 완료"로 나온다.
- 공개 화면·로그인 화면 375/768/1280px에서 넘침·깨진 그림·콘솔 오류 없음(가짜 AI 미리보기 포함).
- 가짜 AI 미리보기에서 계획서 10장 생성, PDF(12쪽)·Word 파일 내려받기 정상. PDF 안의 한글 모양은 눈으로 보지 못함.

### 오픈 걸림돌
1. **결제가 닫혀 있다.** 결제 화면에 가격은 나오지만 버튼 대신 "아직 결제를 열기 전이에요"가 뜬다(`/api/plan/access`가 `payable:false`).
   - 원인: 워커 secret에 나이스페이 **시험용** 열쇠(`NICEPAY_SANDBOX_*`)만 있고 **실제** 열쇠(`NICEPAY_CLIENT_KEY`, `NICEPAY_SECRET_KEY`)가 없다. 코드는 운영에서 시험용이면 일부러 결제를 막는다(시험 결제는 돈이 안 오가는데 유료 기능만 열리므로).
   - 할 일(사장님): 나이스페이 가맹 계약 → 실제 열쇠 두 개 받기 → `npx wrangler secret put NICEPAY_CLIENT_KEY --name today-startup`, `NICEPAY_SECRET_KEY`도 같은 방법으로 직접 붙여 넣기. `NICEPAY_ENVIRONMENT` secret이 `sandbox`로 되어 있으면 `production`으로 바꾸거나 지운다(기본값이 production). 그 뒤 결제 출시 조건(`evaluatePlatformLaunchReadiness`: 사업자·통신판매 표시, 로그인 설정)도 통과해야 버튼이 열린다(통과 여부 미확인).
2. **실제 계획서 1편 확인.** #437이 계획서에 넘기는 내용을 바꿨으므로 한 편 만들어 내용이 말이 되는지 본다. 약 5,000~8,500원, 허락 필요.
3. **돈 흐름 끝까지 한 번**(1번이 풀린 뒤): 결제 → 계획서 생성 → PDF·Word 받기 → 환불 신청. 사장님이 결제하고 Claude는 로그를 본다.
4. **사장님 알림 메일 시험.** 결제·환불·멈춘 결제 알림이 `RESEND_API_KEY`, `OWNER_NOTIFY_EMAIL` secret에 달려 있는데 실제로 오는지 기록이 없다. 고객센터 문의 1건을 보내 확인한다. AI 작업 실패 알림은 아직 없다.
5. **계좌이체 길 결정.** 계좌이체 주문 화면(`app/payment/transfer`)과 설정 값은 있는데, 결제 화면에서 그리로 가는 길이 없다. 카드 결제만 열지, 계좌이체도 보여 줄지 사장님 결정.

### 걸림돌은 아니지만 알려진 문제
- 부업 문장("평일 저녁이랑 주말에만")인데 운영 범위가 "하루 5마리", 매달 비용이 150만원으로 채워졌다(기준값 짐작이 부업에 안 맞음).
- 대화에서 말한 본전 숫자와 방향 카드의 본전 숫자가 다를 때가 있다.
- 사업 방향 정리 실패가 AI 손님 점검에서 약 9% 있었다(#429로 줄였지만 다시 재지 않음).
- "아이디어가 없는" 손님이 적은 글이 메모로만 저장되는 경우, 운영 중인 가게에 가격·월 비용을 짐작으로 채우는 문제.
- 작은 누름 영역("일반/전문가" 32px, 요약 줄 21px), 방향 카드의 "빠듯" 표현이 잦음(82장 중 22장), 업종 이름 "유통 · 온라인 판매".
- 운영 오류를 자동으로 알려 주는 장치가 없다(지금은 `wrangler tail`로 직접 본다).

### 운영에 남아 있는 시험 자료
- 2026-11-18 점검 때 만든 손님 사업 "동네 반려견 방문 미용"(`plan_fdcb2198-…`)이 사장님 계정의 "내 사업"에 남아 있다. 지울지는 사장님께 묻고 지운다.

---

## 8. 열린 PR (2026-11-19)

| PR | 내용 | 상태 |
| --- | --- | --- |
| #412 `feat/intake-reader-ui` | 일반 모드 화면에 AI 읽기 붙이기 | main과 충돌. 그 뒤 #428이 AI 읽기를 화면에 붙였으므로 아직 필요한지부터 확인(미확인). |
| #385 `local2-oceanside-skin` | 동네 가게 2 홈페이지 겉모습 | 충돌 없음, 5일 지남. 사장님이 원할 때만. |
| #174 `sim5` | 돈 계산 시뮬레이션 | 오래됨(10-14). 계산은 #419 등으로 따로 고쳐짐. 닫아도 될 후보. |
| #29 `chore/opus-cost-query` | 30일 비용 쿼리 | 오래됨(09-28). 닫아도 될 후보. |

PR을 닫거나 병합하는 것은 사장님께 묻고 한다.

---

## 9. 시험·연구 도구

- **AI 손님 전수 점검**(`scripts/synthetic-e2e/`, 설명은 그 폴더 `README.md`): AI 손님 41명이 실제 화면 순서대로 대화하고 다른 AI가 심사한다. 1회 약 3.4~3.9만원이라 **사장님 허락 없이는 돌리지 않는다**. 실제 AI 미리보기를 대상으로만 돈다(운영 사이트 대상 불가).
  - 작은 유료 확인: `reader-check.mts`(약 20원), `chat-check.mts`(약 250원), `guess-check.mts`(약 600원). 모두 허락 먼저.
  - 비용 상한: `NODE_OPTIONS="--import ./scripts/synthetic-e2e/llm-usage-logger.mjs" LLM_MAX_KRW=<원> LLM_USAGE_LOG=<새 파일>`. 로그 파일을 회차마다 새로 써야 한다(기존 파일의 금액을 이어서 센다). 동시 호출이 많으면 상한을 조금 넘을 수 있다.
  - 가짜 AI(`scripts/synthetic-e2e/fake-anthropic.mjs`)는 미리보기 기본값이라 0원.
- **계획서 품질 비교(0원)**: `scripts/plan-eval/run.mts --capture-prompts --offline <폴더>`로 지시문을 뽑고, 세션 안의 새 서브에이전트가 이름을 가린 결과물을 `docs/사업계획서-품질기준-최종본-2026-10-09.md` 기준으로 채점한다. 유료 채점기는 쓰지 않는다.
- **일반 모드 AI 읽기 시험 100문제**(`local-eval/`, 이번에 저장소에 올림): `cases.json`(문제), `expected.json`(정답), `node grade.cjs out-<이름>.json`(채점). 기준점: Haiku + 사이트 코드 97/100. 로컬 모델(LM Studio)로 푸는 `run-local.mts`도 있다.
- **로컬 AI(LM Studio, 0원)**: 실제 Claude가 낸 결과를 다시 읽어 문제를 찾는 데만 쓴다. 사이트 AI의 대역으로는 쓰지 않는다(점수가 크게 낮음). Qwen은 assistant 차례에 `<think>\n\n</think>\n\n`을 미리 넣어야 바로 답한다. 모델 파일과 실험 스크립트는 외장하드에 있다(10장).

---

## 10. 저장소 밖에 있는 것

| 위치 | 내용 |
| --- | --- |
| 외장하드 `/Volumes/무제/ClaudeWork/2026-11-oneulstart-handoff/` | **비공개 인수인계 문서**(`인수인계-비공개.md`: 이 Mac의 경로, 비밀 파일 이름과 옮기는 법, DB 마이그레이션 정확한 순서, 문자 중계 서버 배포, AI 잔액 확인법), Claude 메모 원본 사본, 전역 규칙 사본, 공개 저장소에 올리지 않은 참고 문서·캡처 |
| 외장하드 `/Volumes/무제/ClaudeWork/2026-11-oneulstart-ai-customer-sweep/` | 2026-11-17 AI 손님 점검 결과(41명 × 여러 회차, 약 15만원어치), `결과보기.html`(오프라인으로 열림), 로컬 실험 스크립트 `local-lab/`(이름이 `-real`로 끝나는 것만 유료) |
| 외장하드 `/Volumes/무제/LMStudio/models` | 로컬 AI 모델(Qwen 27B, Gemma 12B) |
| 각 컴퓨터의 저장소 폴더 | 비밀 파일 `.env.local`(운영 DB), `.env.eval.local`(실험용 AI 키), `.env.nicepay-sandbox.local` — Git에 없음 |
| GitHub 저장소 설정 | Actions secret `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`(배포용) |
| Cloudflare 워커 secret | AI 키, Supabase 키, 나이스페이, 알림 메일·문자 설정 등 |

외장하드는 소유권을 무시하는 형식이라 다른 macOS 사용자나 다른 Mac에 꽂아도 읽고 쓸 수 있다. 외장하드가 없으면 Mac 내장 디스크에 새 작업 폴더를 만들지 말고 연결을 부탁한다(사장님 전역 규칙).

---

## 11. 다음에 할 일 (순서)

1. 사장님이 나이스페이 실제 열쇠를 받으면 → secret 등록을 터미널에서 안내(값은 사장님이 붙여 넣음) → 결제 화면에 결제 버튼이 뜨는지 확인(0원).
2. 돈 흐름 끝까지 한 번: 사장님 결제 → 계획서 생성 지켜보기(운영 로그) → PDF·Word 받기 → 환불 신청 화면. 계획서 생성은 실제 AI라 미리 비용을 말한다.
3. 고객센터 문의 1건으로 사장님 알림 메일이 오는지 확인.
4. 계좌이체 길을 열지 사장님 결정을 받아 반영.
5. 그 뒤에야 7장의 "알려진 문제" 중 사장님이 고르는 것을 고친다(부업 짐작 값부터 추천).
