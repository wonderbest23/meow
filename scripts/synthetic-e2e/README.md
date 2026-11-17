# AI 비용 없는 합성 점검

실제 AI·운영 DB·문자 없이 사업 만들기 전 과정을 돌려 보는 도구입니다.

- `preview-fake.mts` — 코드를 임시 폴더로 복사해(.env 제외) 미리보기 서버를 띄웁니다. 메모리 DB, 가짜 Anthropic(`fake-anthropic.mjs`: 요청의 JSON 스키마에 맞는 합성 답), 합성 로그인(쿠키 `syn_uid`)과 개발용 경로(`/api/dev/synthetic-login`·`synthetic-generate`·`synthetic-weekly`: 합성 로그인, Workflow 대신 섹션 생성, 주간 리포트 발송기)는 저장소에 들어 있지만 `SYNTHETIC_AUTH=1`·`PERSISTENCE_MODE=demo-memory`·`APP_ENV`(prelaunch·local)가 모두 맞을 때만 켜집니다(`lib/synthetic-preview.ts`). 운영에서는 404입니다. 운영과 같은 빌드로 띄우는 방법은 `docs/cloud-preview.md`를 보세요.
- `drive.mts <origin> [biz,biz]` — 합성 사업 10개를 상담 13문항 → 사업 방향 정리 → 계획서까지 진행
- `ui-check.mts`, `homepage-check.mts`, `auto-design.mts`, `live-doc.mts` — 사업 관리·홍보 키트, 홈페이지 공개·문의, 자동 정리, 실시간 생성 화면 점검

```bash
npx tsx scripts/synthetic-e2e/preview-fake.mts --intake   # 출력의 origin을 scripts/synthetic-e2e/origin.txt 에 저장
npx tsx scripts/synthetic-e2e/drive.mts "$(cat scripts/synthetic-e2e/origin.txt)"
```

같은 IP에서 10분에 상담 저장 120번 제한이 있어 한 번에 8개 정도까지 돕니다. 알림 번호·주간 리포트 설정과 문의 알림 발송은 Supabase가 있어야 해서 여기서는 확인하지 않습니다. 화면 확인에는 맥의 Google Chrome(puppeteer-core)을 씁니다.

`SYNTHETIC_AI_DELAY_MS=15000`을 붙여 띄우면 가짜 AI가 매번 그만큼 기다렸다 답해서, "정리 중" 같은 기다림 화면을 눈으로 확인할 수 있습니다.
- `coach-chat-ui.mts` — 코치 채팅 화면을 PC·휴대폰 크기로 직접 눌러 13문항 → 사업 방향 정리까지 진행(미리보기를 `NEXT_PUBLIC_INTAKE_COACH_CHAT=1`로 띄워야 함)

## AI 손님 전수 점검(실제 AI · 돈이 든다)

큰 변경 뒤에는 가짜 AI 시험(흐름)만으로 끝내지 않고, 값과 말이 그 사업에 말이 되는지까지 본다(2026-11-17).

- `customer-sweep.mts <origin> <결과 폴더> [all|id,id] [동시 수]` — AI가 손님 41명(작은 사업 · 사투리 · 영어 · 화난 손님 · 운영 중 · 아이디어 없음 …)을 맡아 실제 화면과 같은 순서로 끝까지 대화하고(손님 글이 서버로 가는 길은 `app/plan/chat/intake-ui/model.ts`를 그대로 쓴다), 다른 AI가 대화 전체를 읽고 문제를 적는다. 41명 한꺼번에 약 5분, 사이트 AI 약 2만 원 + 손님·심사 AI 약 1.5만 원.
- `customer-sweep-report.mts <결과 폴더>` — 심사 결과를 같은 원인끼리 묶어 심각한 순서로(`_groups.json`).
- `customer-sweep-compare.mts <전 폴더> <후 폴더>` — 두 번을 나란히(같은 질문 되묻기 · 되묻기 안내 · 방향 뒤 답 · AI 읽기 실패 · 점수). AI 0원.
- `reader-check.mts` — 질문에 적은 말을 작은 AI(Haiku)가 바르게 읽는지 실제 손님 말 30개로(한 번 약 20원).
- `guess-check.mts` — 첫 문장에서 말하지 않은 칸의 짐작 값과 시간.

서버는 실제 AI 미리보기(`scripts/preview/start-real.sh`, 손님 허용 `INTAKE_GUEST_ALLOWED=1 PLAN_ACCOUNT_LINKING_ENABLED=true`)로 띄운다. 도구가 쓰는 AI는 `llm-usage-logger.mjs`로 따로 재고 상한(`LLM_MAX_KRW`)을 둔다. 결과를 믿기 전에 도구가 실제 화면과 같이 움직였는지 대화 기록을 직접 읽어 본다(확인 카드 · 여러 개 고르는 칩 · 긴 글 자르기 같은 도구 한계가 있었다).
