import "server-only";
import { z } from "zod";
import type { OwnerSmsResult } from "./owner-sms";

const PATH = "/_oneulstart/support-owner-sms";
export type OwnerSmsEvent = "support-inquiry" | "business-plan-ready";
const configSchema = z.object({
  endpoint: z.string().url().refine(value => {
    const url = new URL(value);
    return url.protocol === "https:" && url.pathname === PATH && !url.username && !url.password && !url.search && !url.hash && !url.port;
  }),
  secret: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  recipient: z.string().regex(/^010\d{8}$/),
  mode: z.enum(["test", "live"]),
  dailyLimit: z.string().regex(/^[1-9]\d?$/).transform(Number).pipe(z.number().max(10)),
});
const receiptSchema = z.object({
  eventId: z.string().uuid(), mode: z.enum(["test", "live"]),
  status: z.enum(["blocked", "test_accepted", "accepted", "rejected", "uncertain"]),
  code: z.string().regex(/^[A-Z][A-Z0-9_-]{0,79}$/), duplicate: z.boolean().optional(),
  eventType: z.enum(["support-inquiry", "business-plan-ready"]).optional(),
});

export function ownerSmsRelayConfig() {
  return configSchema.safeParse({
    endpoint: process.env.OWNER_SMS_RELAY_URL, secret: process.env.OWNER_SMS_RELAY_SECRET,
    recipient: process.env.OWNER_SMS_TO, mode: process.env.OWNER_SMS_MODE, dailyLimit: process.env.OWNER_SMS_DAILY_LIMIT,
  });
}

async function hmac(secret: string, text: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(text))), value => value.toString(16).padStart(2, "0")).join("");
}

export async function sendOwnerSmsRelay(config: z.infer<typeof configSchema>, eventId: string, signal: AbortSignal, eventType: OwnerSmsEvent = "support-inquiry"): Promise<OwnerSmsResult> {
  const recipientCheck = await hmac(config.secret, `recipient:${config.recipient}`);
  // Keep existing inquiry bytes stable so deployed receipts still deduplicate.
  const body = JSON.stringify(eventType === "support-inquiry"
    ? { version: 1, eventId, mode: config.mode, recipientCheck }
    : { version: 2, eventId, mode: config.mode, recipientCheck, service: "oneulstart", eventType });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await hmac(config.secret, `${timestamp}\nPOST\n${PATH}\n${body}`);
  signal.throwIfAborted();
  const response = await fetch(config.endpoint, {
    method: "POST", redirect: "error", signal,
    headers: { "Content-Type": "application/json", "x-oneul-time": timestamp, "x-oneul-signature": signature }, body,
  });
  if (!response.body) return { status: "uncertain", code: "RELAY_EMPTY_RESPONSE" };
  const reader = response.body.getReader();
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 4096) return { status: "uncertain", code: "RELAY_INVALID_RECEIPT" };
      chunks.push(chunk.value);
    }
    if (!response.ok) return { status: response.status >= 400 && response.status < 500 ? "rejected" : "uncertain", code: `RELAY_HTTP_${response.status}` };
    const all = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
    const parsed = receiptSchema.safeParse(JSON.parse(new TextDecoder().decode(all)));
    if (!parsed.success || parsed.data.eventId !== eventId || parsed.data.mode !== config.mode
      || (eventType === "business-plan-ready" && parsed.data.eventType !== eventType)
      || (parsed.data.status === "accepted" && (config.mode !== "live" || parsed.data.code !== "PROVIDER_ACCEPTED"))
      || (parsed.data.status === "test_accepted" && (config.mode !== "test" || parsed.data.code !== "ALIGO_TEST_ACCEPTED"))) {
      return { status: "uncertain", code: "RELAY_INVALID_RECEIPT" };
    }
    return { status: parsed.data.status, code: parsed.data.code };
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
