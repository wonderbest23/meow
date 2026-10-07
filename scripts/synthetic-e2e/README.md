# AI 비용 없는 합성 점검

실제 AI·운영 DB·문자 없이 사업 만들기 전 과정을 돌려 보는 도구입니다.

- `preview-fake.mts` — 코드를 임시 폴더로 복사해(.env 제외) 미리보기 서버를 띄웁니다. 메모리 DB, 가짜 Anthropic(`fake-anthropic.mjs`: 요청의 JSON 스키마에 맞는 합성 답), 합성 로그인(쿠키 `syn_uid`)은 **복사본에만** 들어갑니다. `inject/`의 개발용 경로(Workflow 대신 섹션 생성, 주간 리포트 발송기)도 복사본에만 넣습니다.
- `drive.mts <origin> [biz,biz]` — 합성 사업 10개를 상담 13문항 → 사업 방향 정리 → 계획서까지 진행
- `ui-check.mts`, `homepage-check.mts`, `auto-design.mts`, `live-doc.mts` — 사업 관리·홍보 키트, 홈페이지 공개·문의, 자동 정리, 실시간 생성 화면 점검

```bash
npx tsx scripts/synthetic-e2e/preview-fake.mts --intake   # 출력의 origin을 scripts/synthetic-e2e/origin.txt 에 저장
npx tsx scripts/synthetic-e2e/drive.mts "$(cat scripts/synthetic-e2e/origin.txt)"
```

같은 IP에서 10분에 상담 저장 120번 제한이 있어 한 번에 8개 정도까지 돕니다. 알림 번호·주간 리포트 설정과 문의 알림 발송은 Supabase가 있어야 해서 여기서는 확인하지 않습니다. 화면 확인에는 맥의 Google Chrome(puppeteer-core)을 씁니다.

`SYNTHETIC_AI_DELAY_MS=15000`을 붙여 띄우면 가짜 AI가 매번 그만큼 기다렸다 답해서, "정리 중" 같은 기다림 화면을 눈으로 확인할 수 있습니다.
- `coach-chat-ui.mts` — 코치 채팅 화면을 PC·휴대폰 크기로 직접 눌러 13문항 → 사업 방향 정리까지 진행(미리보기를 `NEXT_PUBLIC_INTAKE_COACH_CHAT=1`로 띄워야 함)
