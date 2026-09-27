const allowed = new Map<string, readonly string[]>([
  ["/api/auth/session", ["GET", "POST"]],
  ["/api/auth/login", ["POST"]],
  ["/api/auth/logout", ["POST"]],
  ["/api/auth/google", ["POST"]],
  ["/api/auth/kakao", ["GET"]],
  ["/api/auth/register", ["POST"]],
  ["/api/auth/recover", ["POST"]],
  ["/api/auth/reset", ["POST"]],
  ["/api/auth/payments", ["GET"]],
  ["/api/account/support", ["GET", "POST"]],
  ["/api/plan/state", ["GET", "PUT", "POST"]],
  ["/api/plan/chat", ["GET", "POST"]],
]);

/** Apply only to the separate limited-beta deployment, never implicitly to other services. */
export function betaApiBoundary(request: Request, enabled: unknown): Response | null {
  if (enabled !== "1") return null;
  const path = new URL(request.url).pathname;
  // Limited beta dispatches intake through after(), not the internal HTTP receiver.
  if (!path.startsWith("/api/") && !path.startsWith("/__internal/")) return null;
  const methods = allowed.get(path);
  if (methods?.includes(request.method) && (path !== "/api/plan/chat" || request.headers.get("x-business-intake") === "2")) return null;
  return Response.json({ code: "beta_scope_restricted", message: "한정 베타에서 제공하지 않는 기능입니다." }, { status: 403, headers: { "Cache-Control": "no-store" } });
}
