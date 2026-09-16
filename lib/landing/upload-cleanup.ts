import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_MS = 60 * 60_000;
const pathPattern = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/i;

export function issueUploadCleanupToken(path: string, userId: string, secret: string, now = Date.now()) {
  if (!secret || !pathPattern.test(path) || !path.startsWith(`${userId}/`)) throw new Error("invalid_upload_owner");
  const payload = Buffer.from(JSON.stringify({ path, userId, at: now, purpose: "unused-editor-upload" })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function readUploadCleanupToken(token: string, userId: string, secret: string, now = Date.now()): string | null {
  if (!secret || token.length > 1500) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const signature = Buffer.from(parts[1], "base64url");
  const expected = createHmac("sha256", secret).update(parts[0]).digest();
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (value.purpose !== "unused-editor-upload" || value.userId !== userId || !Number.isFinite(value.at) || value.at > now || now - value.at > MAX_AGE_MS || typeof value.path !== "string" || !pathPattern.test(value.path) || !value.path.startsWith(`${userId}/`)) return null;
    return value.path;
  } catch { return null; }
}

export function containsUploadReference(value: unknown, url: string): boolean {
  if (typeof value === "string") return value === url || value.includes(url);
  if (Array.isArray(value)) return value.some(item => containsUploadReference(item, url));
  return !!value && typeof value === "object" && Object.values(value).some(item => containsUploadReference(item, url));
}
