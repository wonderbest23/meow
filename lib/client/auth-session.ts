/** /api/auth/session 이 돌려주는 로그인 상태 */
export type AuthSession = { authenticated?: boolean; email?: string | null };

/*
 * 같은 순간에 여러 곳(왼쪽 메뉴·머리말·마이페이지·상담 첫 화면)이 로그인 상태를 물으면 요청 하나를 나눠 쓴다 —
 * 예전엔 화면 하나를 열 때마다 같은 요청이 두세 번 나갔다. 답을 오래 기억하지는 않는다(로그아웃이 바로 보이게):
 * 요청이 끝나면 다음 질문은 다시 서버에 묻는다. 확인하지 못하면 실패로 돌려준다(로그인 안 됨으로 바꾸지 않게).
 */
let pending: Promise<AuthSession> | null = null;

export function loadAuthSession(): Promise<AuthSession> {
  if (!pending) {
    pending = fetch("/api/auth/session", { cache: "no-store" })
      .then(response => { if (!response.ok) throw new Error("session unavailable"); return response.json() as Promise<AuthSession>; })
      .finally(() => { pending = null; });
  }
  return pending;
}
