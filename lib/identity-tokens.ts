import { createHash, createHmac } from "node:crypto";

export const GUEST_COOKIE = "venture_guest";
export const AUTH_ACCESS_COOKIE = "venture_access";
export const AUTH_REFRESH_COOKIE = "venture_refresh";

export function hashIdentityToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function userProjectToken(userId: string) {
  const secret = process.env.AUTH_PROJECT_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error("계정 프로젝트 연결 비밀키가 설정되지 않았습니다.");
  return createHmac("sha256", secret).update(`today-startup:${userId}`).digest("base64url");
}
