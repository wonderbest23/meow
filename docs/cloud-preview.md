# 운영과 같은 미리보기(합성 로그인·가짜 AI) — 클라우드에서도 쓰는 법

운영과 **같은 빌드**(`next build` → `next start`)를 띄우되, 로그인·AI·DB는 모두 가짜로 바꾼 미리보기입니다.
이 맥이 없어도(클라우드 세션 등) 같은 방법으로 화면 점검을 할 수 있습니다. 돈이 들지 않습니다(가짜 AI, 0원).

- 로그인: 가짜 계정(`syn-숫자`). 주소 하나로 로그인됩니다.
- AI: `scripts/synthetic-e2e/fake-anthropic.mjs`가 Anthropic 요청만 가로채 합성 답을 줍니다. 실제 호출 0번.
- DB: 메모리(`PERSISTENCE_MODE=demo-memory`). 서버를 끄면 자료가 사라집니다. 운영 DB에는 닿지 않습니다.
- 결제·제안서 AI·운영 AI는 꺼져 있습니다.

## 1. 준비 (한 번)

저장소 맨 위 폴더에서 합니다. `.env.local` 같은 개인 설정 파일이 **없는** 폴더여야 합니다(있으면 스크립트가 멈춥니다 — 그 안의 운영 키가 섞이지 않게).

```bash
npm ci
```

화면 점검(ui-audit)을 하려면 크롬이 필요합니다.

- 맥: 설치된 Google Chrome을 그대로 씁니다.
- 리눅스(클라우드):
  ```bash
  npx @puppeteer/browsers install chrome@stable
  # 출력 마지막 줄의 경로를 CHROME_PATH 로 둡니다. 예:
  export CHROME_PATH="$PWD/chrome/linux-<버전>/chrome-linux64/chrome"
  ```
  한글이 네모로 보이면 한글 글꼴을 설치합니다(예: `sudo apt-get install -y fonts-noto-cjk`).
  크롬이 공유 라이브러리가 없다고 하면 `npx @puppeteer/browsers install chrome@stable --install-deps`(관리자 권한 필요)로 다시 설치합니다.

## 2. 빌드하고 띄우기

```bash
bash scripts/preview/build.sh            # 운영과 같은 빌드(몇 분 걸림). 메모리가 적으면 BUILD_LOW_MEMORY=1 을 앞에 붙입니다
bash scripts/preview/start.sh            # http://127.0.0.1:60207 (포트를 바꾸려면: bash scripts/preview/start.sh 60307)
```

고친 곳을 바로 보고 싶을 때는 개발 서버를 씁니다. 다만 CSS 순서처럼 운영 빌드에서만 드러나는 문제는 개발 서버에서 안 보이므로, **최종 확인은 꼭 build.sh + start.sh** 로 합니다.

```bash
bash scripts/preview/dev.sh              # http://127.0.0.1:8096
```

서버를 끌 때는 그 터미널에서 Ctrl+C. (메모리를 많이 쓰므로 점검이 끝나면 바로 끕니다.)

## 3. 가짜 계정으로 로그인

브라우저에서 이 주소를 열면 `syn-901` 계정으로 로그인한 뒤 작업실로 갑니다.

```
http://127.0.0.1:60207/api/dev/synthetic-login?uid=syn-901&next=/plan/studio?new=1
```

- `uid` 는 `syn-` 로 시작하는 이름(예: `syn-1`, `syn-901`). 계정마다 사업이 따로 저장됩니다.
- `next` 는 로그인 뒤 갈 화면(같은 사이트 안 주소만).
- 스크립트에서는 쿠키 `syn_uid=syn-901` 을 붙여 API를 불러도 됩니다.
- 관리자 화면 비밀번호는 실행할 때마다 새로 만든 일회용 값이라 알 수 없습니다. 관리자 화면을 봐야 하면
  `ADMIN_CHAT_PASSWORD=<아무 값> bash scripts/preview/start.sh` 처럼 직접 정해서 띄웁니다(이 미리보기 서버에만 쓰입니다).

점검용 사업을 미리 만들려면(가짜 AI라 0원):

```bash
BASE_URL=http://127.0.0.1:60207 node scripts/ui-audit/seed.mjs syn-901 full        # 계획서까지
BASE_URL=http://127.0.0.1:60207 node scripts/ui-audit/seed.mjs syn-902 designed    # 사업 방향 정리까지
BASE_URL=http://127.0.0.1:60207 node scripts/ui-audit/seed.mjs syn-903 partial:2   # 질문 2개 남기고
```

## 4. 화면 점검(ui-audit)

`scripts/ui-audit/` 의 도구는 미리보기 서버에 붙어 화면을 위에서 아래로 훑고, 문제마다 빨간 테두리를 그린 스크린샷을 남깁니다.
찾는 문제 8가지: 상태 블록 세로 가운데 아님 · 제목·본문·단추 간격 · 외톨이 줄바꿈 · 이동 단추 화살표 없음 · 터치 영역 44px 미만 · 같은 문구 중복 · 잘림·겹침·가로 스크롤 · 고정 요소가 내용 가림.

공통 설정:

- `BASE_URL` — 미리보기 주소(기본 `http://127.0.0.1:60207`)
- `--out <폴더>` 또는 `OUT` — 결과 폴더(기본 `tmp/ui-audit`, 저장소에 올라가지 않음)
- `CHROME_PATH` — 크롬 위치(맥은 비워 두면 됨)

```bash
# 화면 하나 (휴대폰 390px, syn-901 로 로그인해서)
node scripts/ui-audit/page.mjs "/plan/studio?new=1" --width 390 --uid syn-901 --out tmp/ui-audit/r1

# 묶음 점검 — [너비] [단계,단계]
node scripts/ui-audit/d-public.mjs 390 --out tmp/ui-audit/r1     # 손님 화면(첫 화면·로그인·가입·404·예시 사업 등)
node scripts/ui-audit/d-user.mjs 390 --out tmp/ui-audit/r1       # 로그인 화면(내 사업·계정·고객센터·문의·결제 등) — 필요한 사업을 스스로 만듦
node scripts/ui-audit/d-studio.mjs 390 --out tmp/ui-audit/r1     # 작업실(대화·생성 중·계획서·홈페이지·개업·유지보수)
node scripts/ui-audit/d-hp.mjs 390 all <planId> --out tmp/ui-audit/r1   # 홈페이지(홈페이지가 있는 사업 번호가 필요, HP_UID=그 계정)
node scripts/ui-audit/studio-tabs.mjs --out tmp/ui-audit/r1      # 작업실 탭을 PC·휴대폰 너비별로

# 고른 그림을 시트로 모아 보기: <OUT>/picks.json 에 [{ "file": "flags/001-....png", "screen": "...", "width": 390, "problem": "..." }]
node scripts/ui-audit/sheet.mjs "r1 점검" --out tmp/ui-audit/r1
```

결과: `<OUT>/flags/NNN-<화면>-<너비>-<종류>.png`(표시 그림), `<OUT>/issues.jsonl`(한 줄에 문제 하나).
같은 IP에서 짧은 시간에 요청이 많으면 제한에 걸릴 수 있어, 도구는 화면마다 다른 가짜 IP(`x-forwarded-for`)를 붙입니다.

## 5. 이 맥(로컬)에만 남는 것

- **진짜 AI로 돌리는 실험** — 돈이 듭니다. 소유자가 허락한 경우에만, 무료 크레딧을 확인하고 상한을 정해서 합니다.
  키는 환경 변수로만 넘깁니다(파일 경로를 스크립트에 적지 않습니다):
  ```bash
  ANTHROPIC_API_KEY=... LLM_MAX_KRW=40000 bash scripts/preview/start-real.sh   # 포트 60209, 비용 기록 tmp/real-usage.jsonl
  ```
  클라우드 세션에는 진짜 키를 두지 않습니다.
- **아이폰 앱 빌드·시뮬레이터**(Xcode)와 앱스토어 제출.
- **소유자의 크롬**(로그인된 실제 계정으로 운영 사이트를 보는 일).

## 6. 안전장치

- 가짜 로그인(`syn_uid`)과 개발용 주소(`/api/dev/synthetic-login`, `/api/dev/synthetic-generate`, `/api/dev/synthetic-weekly`)는
  아래 **세 조건이 모두 맞을 때만** 켜집니다(`lib/synthetic-preview.ts`). 하나라도 어긋나면 개발용 주소는 404, 로그인은 `syn_uid` 쿠키를 보지 않습니다.
  1. `SYNTHETIC_AUTH=1`
  2. `PERSISTENCE_MODE=demo-memory` (운영·스테이징은 Supabase)
  3. `APP_ENV` 가 `prelaunch` 또는 `local` (운영은 `APP_ENV` 를 두지 않음, `NEXT_PUBLIC_APP_ENV=production` 이어도 꺼짐)
- 운영(`NODE_ENV=production`, `APP_ENV` 없음)에서는 미들웨어가 `/api/dev/*` 를 통째로 404 로 닫습니다(`lib/launch-scope.ts`).
- 운영 빌드에서 메모리 DB는 원래 막혀 있고, 위 세 조건이 맞는 미리보기에서만 허용됩니다(`lib/persistence.ts`).
- 이 내용은 `scripts/synthetic-preview.test.ts`(신뢰성 시험 `synthetic-preview`)가 매번 확인합니다:
  운영처럼 보이는 환경 9가지에서 개발용 주소 404 · `syn_uid` 무시, 미리보기에서는 동작, 스크립트에 개인 경로·비밀 값 없음.
- 스크립트에는 비밀 값이 없습니다. 관리자 비밀번호·세션 비밀은 실행 때마다 새로 만든 일회용 값이고, `AUTH_PROJECT_SECRET` 은 개발 전용 고정 문구입니다.
  셸에 남은 `SUPABASE_*`·`OPENAI_API_KEY` 는 지우고 시작합니다.
