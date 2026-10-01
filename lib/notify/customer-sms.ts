import { z } from "zod";

/*
 * 사장님(홈페이지 주인) 휴대폰으로 보내는 문자 — 알리고 중계(ops/owner-sms/relay.py v3)를 거친다.
 *
 * 알리고는 등록된 고정 IP 에서만 받는데 Cloudflare Workers 는 고정 IP 가 없어, 대표 알림과 같은 중계 서버를 쓴다.
 * 요청에는 받는 번호와 숫자 몇 개만 싣고, 문구는 중계가 고정 문구로 만든다(자유 글 없음).
 * 같은 eventId 를 다시 보내면 중계가 앞선 결과를 돌려준다(중복 발송 없음) — 그래서 재시도해도 안전하다.
 * 켜는 스위치는 CUSTOMER_SMS_ENABLED=1, 연결 값은 대표 알림 중계와 같다(OWNER_SMS_RELAY_URL·SECRET·MODE).
 */

const PATH = "/_oneulstart/support-owner-sms";
export type CustomerSmsEvent = "homepage-lead" | "weekly-report";
export type CustomerSmsParams = Record<string, never> | { leads: number; prevLeads: number; views: number };
export type CustomerSmsResult = { status: "accepted" | "test_accepted" | "rejected" | "uncertain" | "blocked"; code: string; duplicate?: boolean };

const configSchema = z.object({
  endpoint: z.string().url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && url.pathname === PATH && !url.username && !url.password && !url.search && !url.hash && !url.port;
  }),
  secret: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  mode: z.enum(["test", "live"]),
});
export type CustomerSmsConfig = z.infer<typeof configSchema>;

export function customerSmsConfig(env: Record<string, string | undefined> = process.env): CustomerSmsConfig | null {
  if (env.CUSTOMER_SMS_ENABLED !== "1") return null;
  const parsed = configSchema.safeParse({ endpoint: env.OWNER_SMS_RELAY_URL, secret: env.OWNER_SMS_RELAY_SECRET, mode: env.OWNER_SMS_MODE });
  return parsed.success ? parsed.data : null;
}

/** 알림 받을 휴대폰 — 010 으로 시작하는 11자리만. 하이픈·공백은 지운다 */
export function normalizeAlertPhone(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  return /^010\d{8}$/.test(digits) ? digits : null;
}

/** 같은 일(홈페이지·주)에는 늘 같은 eventId — 중계의 중복 방지가 UUID 를 요구한다 */
export async function stableEventId(seed: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`oneulstart:${seed}`))).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function hmacHex(secret: string, text: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(text))), (value) => value.toString(16).padStart(2, "0")).join("");
}

const receiptSchema = z.object({
  eventId: z.string().uuid(), mode: z.enum(["test", "live"]),
  status: z.enum(["blocked", "test_accepted", "accepted", "rejected", "uncertain"]),
  code: z.string().regex(/^[A-Z][A-Z0-9_-]{0,79}$/), duplicate: z.boolean().optional(), eventType: z.string().optional(),
});

export async function sendCustomerSms(config: CustomerSmsConfig, input: { eventId: string; eventType: CustomerSmsEvent; recipient: string; params: CustomerSmsParams }, transport: typeof fetch = fetch, timeoutMs = 6000): Promise<CustomerSmsResult> {
  if (!/^010\d{8}$/.test(input.recipient) || !z.string().uuid().safeParse(input.eventId).success) return { status: "blocked", code: "CUSTOMER_SMS_INPUT_INVALID" };
  const body = JSON.stringify({ version: 3, eventId: input.eventId, mode: config.mode, service: "oneulstart", eventType: input.eventType, recipient: input.recipient, params: input.params });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await hmacHex(config.secret, `${timestamp}\nPOST\n${PATH}\n${body}`);
  let response: Response;
  try {
    response = await transport(config.endpoint, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(timeoutMs),
      headers: { "Content-Type": "application/json", "x-oneul-time": timestamp, "x-oneul-signature": signature }, body,
    });
  } catch {
    return { status: "uncertain", code: "RELAY_UNREACHABLE" };
  }
  const text = await response.text().catch(() => "");
  if (text.length > 4096) return { status: "uncertain", code: "RELAY_INVALID_RECEIPT" };
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* 이상한 답은 아래에서 '확인 불가'로 */ }
  const parsed = receiptSchema.safeParse(json);
  // 막힘(한도·꺼짐)은 중계가 이유를 담아 4xx/5xx 로 준다 — 이유를 그대로 살린다
  if (parsed.success && parsed.data.status === "blocked") return { status: "blocked", code: parsed.data.code };
  if (!response.ok) return { status: response.status >= 400 && response.status < 500 ? "rejected" : "uncertain", code: `RELAY_HTTP_${response.status}` };
  if (!parsed.success || parsed.data.eventId !== input.eventId || parsed.data.mode !== config.mode
    || (parsed.data.status === "accepted" && (config.mode !== "live" || parsed.data.code !== "PROVIDER_ACCEPTED"))
    || (parsed.data.status === "test_accepted" && (config.mode !== "test" || parsed.data.code !== "ALIGO_TEST_ACCEPTED"))) {
    return { status: "uncertain", code: "RELAY_INVALID_RECEIPT" };
  }
  return { status: parsed.data.status, code: parsed.data.code, ...(parsed.data.duplicate ? { duplicate: true } : {}) };
}
