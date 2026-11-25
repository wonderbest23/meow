/*
 * 인증 메일 링크(비밀번호 재설정 · 가입 확인)가 /account 가 아닌 곳으로 돌아왔을 때 /account 로 다시 보낸다.
 * Supabase 는 돌아올 주소가 허용 목록과 맞지 않으면 기본 주소(홈)로 보낸다. 그러면 #access_token…&type=recovery 가
 * 홈에 붙어 오는데 홈은 읽지 않아, 재설정 메일 링크를 눌러도 비밀번호 바꾸기 대신 홈만 보였다(2026-11-25 사장님 제보).
 * 로그인한 사람은 홈에서 /plan 으로 넘어가는데, #해시는 브라우저가 따라 붙여 두므로 어느 화면에서든 같은 판단을 한다.
 * 토큰은 주소의 # 뒤에만 있고 서버로 가지 않는다. 옮길 때도 # 뒤 그대로 넘겨 /account 화면이 읽고 바로 지운다.
 */
export function authLinkRescueHref(pathname: string, hash: string): string | null {
  if (pathname === "/account" || pathname.startsWith("/account/")) return null;
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const hasTokens = !!params.get("access_token") && !!params.get("refresh_token");
  const linkError = !!(params.get("error_code") ?? params.get("error"));
  if (!hasTokens && !linkError) return null;
  // 인증 링크만 — 다른 화면이 쓰는 #해시(앵커)는 건드리지 않는다
  if (hasTokens && !params.get("type") && !params.get("token_type")) return null;
  return `/account${hash.startsWith("#") ? hash : `#${hash}`}`;
}
