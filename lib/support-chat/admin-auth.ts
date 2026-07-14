import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const ADMIN_COOKIE = "venture_support_admin";

function configuredPassword() {
  return process.env.ADMIN_CHAT_PASSWORD?.trim() ?? "";
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function sessionValue(password: string) {
  return createHash("sha256").update(`venture-support:${password}`).digest("base64url");
}

export function isAdminChatConfigured() {
  return configuredPassword().length >= 8;
}

export function verifyAdminPassword(candidate: string) {
  const password = configuredPassword();
  if (password.length < 8) return false;
  return timingSafeEqual(digest(candidate), digest(password));
}

export async function createAdminSession() {
  const password = configuredPassword();
  if (password.length < 8) throw new Error("ADMIN_CHAT_NOT_CONFIGURED");
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, sessionValue(password), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE);
}

export async function hasAdminSession() {
  const password = configuredPassword();
  if (password.length < 8) return false;
  const cookieStore = await cookies();
  const candidate = cookieStore.get(ADMIN_COOKIE)?.value;
  if (!candidate) return false;
  return timingSafeEqual(digest(candidate), digest(sessionValue(password)));
}
