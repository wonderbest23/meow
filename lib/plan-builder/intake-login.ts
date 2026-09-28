/*
 * 사업 기획은 로그인 후에만 시작한다(운영 결정).
 * 로그인 없이 쓰면 그 브라우저에만 저장돼서, 다른 브라우저·앱으로 돌아오면
 * "저장한 사업이 없습니다"가 떠 작업이 사라진 것처럼 보였다.
 *
 * 로그인 서버가 설정되지 않은 곳(로컬 개발·테스트)에서는 막지 않는다.
 * 급히 비로그인 체험을 다시 열어야 하면 INTAKE_GUEST_ALLOWED=1 로 켠다.
 */
export function intakeLoginGate(input: { authConfigured: boolean; guestAllowed: boolean; userId: string | null }): boolean {
  return input.authConfigured && !input.guestAllowed && !input.userId;
}
