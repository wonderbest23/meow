// Edge- and Node-safe admin session tokens.
//
// The token is a self-contained, HMAC-signed value:  `${issuedAtMs}.${nonce}.${signature}`
//   - `nonce` makes every login produce a distinct token (no static, replayable value).
//   - `issuedAtMs` lets the server expire tokens independently of the client-held cookie maxAge.
//   - the HMAC is verified in constant time by Web Crypto, and rotating the signing secret
//     (or the admin password it is derived from) invalidates every outstanding session.
//
// Sessions are scoped. "support" guards the 1:1 support / legal console; "payments" optionally
// guards the deposit-order console with its own credential. A token signed for one scope can never
// validate for another because the signing material embeds the scope and that scope's password.
//
// Only Web Crypto (`globalThis.crypto`) is used so this module runs unchanged in the Next.js
// proxy (edge runtime) and in Node route handlers.

export type AdminScope = "support" | "payments";

export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h — matches cookie maxAge.

const COOKIE_BY_SCOPE: Record<AdminScope, string> = {
  support: "venture_support_admin",
  payments: "venture_payments_admin",
};

const encoder = new TextEncoder();

export function adminCookieName(scope: AdminScope) {
  return COOKIE_BY_SCOPE[scope];
}

/**
 * 어드민 인증은 비밀번호 하나·세션 하나로 통일한다.
 * 과거에는 결제 콘솔이 ADMIN_PAYMENTS_PASSWORD로 별도 세션을 요구해
 * 화면을 옮길 때마다 다시 로그인해야 했다 — 전부 support 스코프로 붙인다.
 */
export function resolveScope(_scope: AdminScope): AdminScope {
  return "support";
}

export function scopePassword(_scope: AdminScope) {
  return process.env.ADMIN_CHAT_PASSWORD?.trim() ?? "";
}

export function isScopeConfigured(scope: AdminScope) {
  return scopePassword(scope).length >= 8;
}

function secretMaterial(scope: AdminScope) {
  const dedicated = process.env.ADMIN_SESSION_SECRET?.trim();
  const base = dedicated && dedicated.length >= 16 ? dedicated : `admin-session-v2:${scopePassword(scope)}`;
  // Bind the signing key to the scope so a support token can never verify as a payments token.
  return `${scope}|${base}`;
}

const keyCache = new Map<AdminScope, { material: string; key: CryptoKey }>();

async function signingKey(scope: AdminScope) {
  const material = secretMaterial(scope);
  const cached = keyCache.get(scope);
  if (cached && cached.material === material) return cached.key;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(material),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  keyCache.set(scope, { material, key });
  return key;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function signAdminSessionToken(scope: AdminScope, issuedAtMs: number = Date.now()) {
  const nonce = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `${issuedAtMs}.${nonce}`;
  const signature = await crypto.subtle.sign("HMAC", await signingKey(scope), encoder.encode(payload));
  return `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyAdminSessionToken(
  token: string | undefined | null,
  scope: AdminScope,
  now: number = Date.now(),
) {
  if (!token || !isScopeConfigured(scope)) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [issuedAtStr, nonce, signature] = parts;
  const issuedAt = Number(issuedAtStr);
  if (!Number.isFinite(issuedAt)) return false;
  // Reject expired and implausibly future-dated tokens (60s clock-skew allowance).
  if (now - issuedAt > ADMIN_SESSION_TTL_MS) return false;
  if (issuedAt - now > 60_000) return false;
  if (!nonce || !signature) return false;
  let signatureBytes: Uint8Array<ArrayBuffer>;
  try {
    signatureBytes = base64UrlToBytes(signature);
  } catch {
    return false;
  }
  const payload = `${issuedAtStr}.${nonce}`;
  return crypto.subtle.verify("HMAC", await signingKey(scope), signatureBytes, encoder.encode(payload));
}
