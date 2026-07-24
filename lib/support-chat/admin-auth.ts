import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import {
  ADMIN_SESSION_TTL_MS,
  adminCookieName,
  isScopeConfigured,
  resolveScope,
  scopePassword,
  signAdminSessionToken,
  verifyAdminSessionToken,
  type AdminScope,
} from "./admin-session";

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export function isAdminChatConfigured() {
  return isScopeConfigured("support");
}

export function verifyAdminPassword(candidate: string, scope: AdminScope = "support") {
  const password = scopePassword(resolveScope(scope));
  if (password.length < 8) return false;
  // Both operands are fixed-length SHA-256 digests, so the comparison is constant time
  // and does not leak the password length.
  return timingSafeEqual(digest(candidate), digest(password));
}

export async function createAdminSession(scope: AdminScope = "support") {
  const effective = resolveScope(scope);
  if (!isScopeConfigured(effective)) throw new Error("ADMIN_CHAT_NOT_CONFIGURED");
  const cookieStore = await cookies();
  cookieStore.set(adminCookieName(effective), await signAdminSessionToken(effective), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_TTL_MS / 1000,
  });
}

export async function clearAdminSession(scope?: AdminScope) {
  const cookieStore = await cookies();
  // Logging out of the support console clears everything; an explicit scope clears just that one.
  const scopes: AdminScope[] = scope ? [resolveScope(scope)] : ["support", "payments"];
  for (const target of scopes) cookieStore.delete(adminCookieName(target));
}

export async function hasAdminSession(scope: AdminScope = "support") {
  const effective = resolveScope(scope);
  const cookieStore = await cookies();
  return verifyAdminSessionToken(cookieStore.get(adminCookieName(effective))?.value, effective);
}
