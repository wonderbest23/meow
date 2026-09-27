import "server-only";
import { z } from "zod";
import { getServerSupabase } from "../persistence";
import { ownerSmsRelayConfig, sendOwnerSmsRelay, type OwnerSmsEvent } from "./owner-sms-relay";

const ENDPOINT = "https://apis.aligo.in/send/";
const MESSAGE = "[오늘창업] 새 고객센터 문의가 접수됐습니다.";
const TIMEOUT_MS = 6000;
const MAX_RESPONSE_BYTES = 16_384;

export type OwnerSmsResult = {
  status: "disabled" | "blocked" | "test_accepted" | "accepted" | "rejected" | "uncertain";
  code: string;
};

const configSchema = z.object({
  apiKey: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
  userId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.@-]{1,79}$/),
  mode: z.enum(["test", "live"]),
  from: z.string().regex(/^(?:0\d{8,10}|1\d{7})$/),
  to: z.string().regex(/^010\d{8}$/),
  dailyLimit: z.string().regex(/^[1-9]\d{0,3}$/).transform(Number).pipe(z.number().max(1000)),
});

const receiptSchema = z.object({
  result_code: z.number().int(),
  msg_id: z.number().int().positive().optional(),
  success_cnt: z.number().int().nonnegative().optional(),
  error_cnt: z.number().int().nonnegative().optional(),
  msg_type: z.string().optional(),
});

function result(status: OwnerSmsResult["status"], code: string): OwnerSmsResult {
  if (status !== "disabled" && status !== "accepted" && status !== "test_accepted") console.warn(`[owner-sms] ${status}:${code}`);
  return { status, code };
}

async function readReceipt(response: Response) {
  if (!response.body) throw new Error("EMPTY_RECEIPT");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new Error("RECEIPT_TOO_LARGE");
      text += decoder.decode(chunk.value, { stream: true });
    }
    return receiptSchema.safeParse(JSON.parse(text + decoder.decode()));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

// Call only after a newly saved event. Never retry an uncertain send.
export async function notifyOwnerBySms(eventId?: string, eventType: OwnerSmsEvent = "support-inquiry"): Promise<OwnerSmsResult> {
  if (process.env.OWNER_SMS_ENABLED !== "1") return result("disabled", "SMS_DISABLED");
  if (eventType !== "support-inquiry" && eventType !== "business-plan-ready") return result("blocked", "SMS_EVENT_INVALID");
  if (eventType === "business-plan-ready" && process.env.OWNER_SMS_REPORT_READY_ENABLED !== "1") return result("disabled", "REPORT_SMS_DISABLED");
  const transport = process.env.OWNER_SMS_TRANSPORT ?? "aligo";
  if (eventType === "business-plan-ready" && transport !== "relay") return result("blocked", "REPORT_SMS_RELAY_REQUIRED");
  if (transport !== "aligo" && transport !== "relay") return result("blocked", "SMS_TRANSPORT_INVALID");
  const relay = transport === "relay" ? ownerSmsRelayConfig() : undefined;
  if (relay && (!relay.success || !z.string().uuid().safeParse(eventId).success)) return result("blocked", "SMS_RELAY_CONFIG_REQUIRED");
  const parsed = configSchema.safeParse({
    apiKey: process.env.ALIGO_API_KEY?.trim(),
    userId: process.env.ALIGO_USER_ID?.trim(),
    mode: process.env.OWNER_SMS_MODE?.trim(),
    from: process.env.OWNER_SMS_FROM?.trim(),
    to: process.env.OWNER_SMS_TO?.trim(),
    dailyLimit: process.env.OWNER_SMS_DAILY_LIMIT?.trim(),
  });
  if (transport === "aligo" && !parsed.success) return result("blocked", "SMS_CONFIG_REQUIRED");
  const config = parsed.success ? parsed.data : undefined;
  const dailyLimit = relay?.success ? relay.data.dailyLimit : config!.dailyLimit;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("SMS deadline exceeded", "TimeoutError")), TIMEOUT_MS);
  let transmitted = false, response: Response | undefined;
  try {
    const db = getServerSupabase();
    if (!db) return result("blocked", "DURABLE_LIMIT_REQUIRED");
    // One shared UTC-day counter, including uncertain/failed attempts; no memory fallback.
    const quota = await db.rpc("bump_rate_limit", {
      p_bucket: "support-owner-sms", p_key: "oneulstart", p_window_ms: 86_400_000,
    }).abortSignal(controller.signal).retry(false);
    if (quota.error || !Number.isSafeInteger(quota.data) || quota.data < 1) return result("blocked", "LIMIT_UNAVAILABLE");
    if (quota.data > dailyLimit) return result("blocked", "DAILY_LIMIT_REACHED");
    controller.signal.throwIfAborted();
    transmitted = true;
    if (relay?.success) {
      const receipt = await sendOwnerSmsRelay(relay.data, eventId!, controller.signal, eventType);
      return result(receipt.status, receipt.code);
    }
    if (!config) return result("blocked", "SMS_CONFIG_REQUIRED");
    response = await fetch(ENDPOINT, {
      method: "POST", redirect: "error", signal: controller.signal,
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({
        key: config.apiKey, user_id: config.userId, sender: config.from, receiver: config.to,
        msg: MESSAGE, msg_type: "SMS", testmode_yn: config.mode === "test" ? "Y" : "N",
      }),
    });
    if (!response.ok) return result(response.status >= 400 && response.status < 500 ? "rejected" : "uncertain", `PROVIDER_HTTP_${response.status}`);
    const receipt = await readReceipt(response);
    if (!receipt.success) return result("uncertain", "INVALID_PROVIDER_RECEIPT");
    const { result_code, msg_id, success_cnt, error_cnt, msg_type } = receipt.data;
    if (result_code < 0) return result("rejected", `ALIGO_REJECTED_${result_code}`);
    if (result_code !== 1 || !msg_id || success_cnt !== 1 || error_cnt !== 0 || msg_type !== "SMS") {
      return result("uncertain", "UNCONFIRMED_PROVIDER_RECEIPT");
    }
    if (config.mode === "test") return result("test_accepted", "ALIGO_TEST_ACCEPTED");
    // Provider acceptance is not proof of delivery to the handset.
    return result("accepted", "PROVIDER_ACCEPTED");
  } catch {
    return result(transmitted ? "uncertain" : "blocked", controller.signal.aborted ? "SMS_TIMEOUT" : transmitted ? "SMS_REQUEST_FAILED" : "LIMIT_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
    if (response?.body && !response.bodyUsed) await response.body.cancel().catch(() => {});
  }
}
