import { ZodError } from "zod";

/*
 * 인증(Supabase Auth) 오류 → 화면에 보일 고정 문구.
 * 예전엔 Supabase 의 영어 원문('For security purposes, you can only request this after 60 seconds.')이
 * 그대로 화면에 나갔다. 원문은 보여 주지 않고, 아는 경우만 골라 쉬운 말로 바꾼다. 모르는 것은 kind 마다의 기본 문구.
 */

export type AuthErrorKind = "recover" | "reset" | "session";

export const AUTH_MESSAGES = {
  /** 같은 주소로 메일을 다시 보내려면 기다려야 할 때(Supabase 기본 60초) */
  emailFrequency: "잠시 후 다시 시도해 주세요. 메일은 1분에 한 번 보낼 수 있어요.",
  /** 서비스 전체 메일 발송 한도에 걸렸을 때 */
  emailQuota: "지금은 메일을 보낼 수 없어요. 잠시 후 다시 시도해 주세요.",
  tooMany: "요청이 많아요. 잠시 후 다시 시도해 주세요.",
  invalidEmail: "이메일 주소를 다시 확인해 주세요.",
  invalidPassword: "비밀번호는 8자 이상으로 입력해 주세요.",
  samePassword: "지금 쓰는 비밀번호와 다른 비밀번호를 입력해 주세요.",
  weakPassword: "비밀번호가 너무 쉬워요. 더 길게, 숫자나 기호를 섞어 만들어 주세요.",
  linkExpired: "링크가 만료됐어요. 비밀번호 찾기를 다시 해 주세요.",
  sessionExpired: "인증 링크가 만료됐어요. 다시 로그인해 주세요.",
  recover: "비밀번호 재설정 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.",
  reset: "비밀번호를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.",
  session: "로그인을 완료하지 못했어요. 다시 시도해 주세요.",
} as const;

type AuthLike = { code?: unknown; status?: unknown; message?: unknown; name?: unknown };

export function authErrorMessage(error: unknown, kind: AuthErrorKind): string {
  if (error instanceof ZodError) {
    const field = error.issues[0]?.path[0];
    if (field === "email") return AUTH_MESSAGES.invalidEmail;
    if (field === "password") return AUTH_MESSAGES.invalidPassword;
    return AUTH_MESSAGES[kind];
  }
  const value = (error ?? {}) as AuthLike;
  const code = typeof value.code === "string" ? value.code : "";
  const message = typeof value.message === "string" ? value.message : "";
  // 같은 주소로 너무 빨리 다시 보낼 때: 'For security purposes, you can only request this after N seconds.'(코드는 over_email_send_rate_limit)
  if (/request this after \d+ seconds?/i.test(message)) return AUTH_MESSAGES.emailFrequency;
  // 서비스 전체 발송 한도: 'Email rate limit exceeded'(같은 코드)
  if (code === "over_email_send_rate_limit" || /email rate limit/i.test(message)) return AUTH_MESSAGES.emailQuota;
  if (code === "over_request_rate_limit" || value.status === 429) return kind === "recover" ? AUTH_MESSAGES.emailFrequency : AUTH_MESSAGES.tooMany;
  if (kind === "reset") {
    if (code === "same_password" || /different from the old password/i.test(message)) return AUTH_MESSAGES.samePassword;
    if (code === "weak_password" || /password should/i.test(message)) return AUTH_MESSAGES.weakPassword;
  }
  if (kind !== "recover" && (/^(?:session_expired|session_not_found|refresh_token_not_found|refresh_token_already_used|bad_jwt|otp_expired|flow_state_expired)$/.test(code)
    || /refresh token|jwt|expired/i.test(message))) {
    return kind === "reset" ? AUTH_MESSAGES.linkExpired : AUTH_MESSAGES.sessionExpired;
  }
  return AUTH_MESSAGES[kind];
}
