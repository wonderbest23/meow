/*
 * 사업 기획 대화의 로그인 규칙.
 *
 * 2026-09: 로그인 후에만 시작하게 막았다. 로그인 없이 쓰면 그 브라우저에만 저장돼서, 다른 브라우저·앱으로 돌아오면
 * "저장한 사업이 없습니다"가 떠 작업이 사라진 것처럼 보였다.
 * 2026-11-17 사장님 결정 "한도 걸고 열어줘": 손님도 사업 정보 대화를 무료로 끝까지 할 수 있게 연다(INTAKE_GUEST_ALLOWED=1).
 * AI 비용은 손님 하루 한도(guest-ai-budget.ts)로 묶는다. 사업계획서 작성 · 결제는 여전히 로그인 + 결제가 필요하다(이 규칙과 별개).
 *
 * 로그인 서버가 설정되지 않은 곳(로컬 개발·테스트)에서는 막지 않는다.
 */
export function intakeLoginGate(input: { authConfigured: boolean; guestAllowed: boolean; userId: string | null }): boolean {
  return input.authConfigured && !input.guestAllowed && !input.userId;
}

/*
 * 손님 대화를 열지 — INTAKE_GUEST_ALLOWED=1 이고, 로그인할 때 손님 사업을 계정으로 옮기는 스위치(PLAN_ACCOUNT_LINKING_ENABLED=true)가 켜져 있을 때만.
 * 옮기기 스위치가 꺼져 있으면 로그인 때 옛 길(account-auth.ts claimLegacyProjects)만 돌아 대화가 저장된 plan_states 를 옮기지 않는다.
 * 그 상태로 열면 손님이 대화하다 로그인했을 때 사업이 계정에 보이지 않는다 — 2026-09 에 손님을 막은 바로 그 문제다.
 * 운영 응답(/api/plan/state)에 ownerKey 가 없으면 꺼진 것이다(2026-11-17 확인: 꺼져 있음). 켜기 전에 운영 DB에 0027 · 0028 · 0036 이 있어야 한다.
 */
export function guestIntakeOpen(env: Record<string, string | undefined> = process.env): boolean {
  return env.INTAKE_GUEST_ALLOWED === "1" && env.PLAN_ACCOUNT_LINKING_ENABLED === "true";
}
