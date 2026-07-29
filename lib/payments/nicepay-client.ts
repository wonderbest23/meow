// 나이스페이 결제창(Server 승인) 연동.
// 결제창에서 인증만 받고, 최종 승인은 서버가 직접 호출한다 —
// 브라우저에서 금액을 바꿔도 승인되지 않도록.
//
// 규격: https://github.com/nicepayments/nicepay-manual

import { createHash } from "node:crypto";

const API_BASE = "https://api.nicepay.co.kr/v1";
/** 결제창 SDK — 클라이언트에서 불러온다 */
export const NICEPAY_SDK_URL = "https://pay.nicepay.co.kr/v1/js/";

export function nicepayClientKey(): string | null {
  return process.env.NICEPAY_CLIENT_KEY?.trim() || null;
}

function nicepaySecretKey(): string | null {
  return process.env.NICEPAY_SECRET_KEY?.trim() || null;
}

/** 키가 모두 설정되어 실제 결제가 가능한 상태인지 */
export function nicepayConfigured(): boolean {
  return Boolean(nicepayClientKey() && nicepaySecretKey());
}

function basicAuthHeader(): string {
  const clientKey = nicepayClientKey();
  const secretKey = nicepaySecretKey();
  if (!clientKey || !secretKey) throw new Error("NICEPAY_KEYS_NOT_CONFIGURED");
  return `Basic ${Buffer.from(`${clientKey}:${secretKey}`).toString("base64")}`;
}

/**
 * 결제창이 returnUrl로 돌려준 값이 위조되지 않았는지 확인한다.
 * 규칙: hex(sha256(authToken + clientId + amount + SecretKey))
 */
export function verifyAuthSignature(input: {
  authToken: string;
  clientId: string;
  amount: number | string;
  signature: string;
}): boolean {
  const secretKey = nicepaySecretKey();
  if (!secretKey) return false;
  const expected = createHash("sha256")
    .update(`${input.authToken}${input.clientId}${input.amount}${secretKey}`)
    .digest("hex");
  // 길이가 다르면 비교하지 않는다
  if (expected.length !== input.signature.length) return false;
  // 타이밍 차이로 값이 새지 않도록 전체를 비교한다
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ input.signature.charCodeAt(i);
  return diff === 0;
}

export interface NicepayApproveResult {
  ok: boolean;
  resultCode: string;
  resultMsg: string;
  tid: string | null;
  orderId: string | null;
  /** 실제 승인된 금액 — 우리가 기대한 금액과 반드시 대조해야 한다 */
  amount: number | null;
  status: string | null;
  paidAt: string | null;
  raw: Record<string, unknown>;
}

/**
 * 서버 승인. 인증된 거래(tid)를 실제 결제로 확정한다.
 * amount는 우리가 알고 있는 주문 금액을 보내며, 응답 금액도 다시 대조한다.
 */
export async function approveNicepayPayment(tid: string, amount: number): Promise<NicepayApproveResult> {
  const response = await fetch(`${API_BASE}/payments/${encodeURIComponent(tid)}`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount }),
    cache: "no-store",
  });

  const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const resultCode = typeof raw.resultCode === "string" ? raw.resultCode : "";
  const approvedAmount = typeof raw.amount === "number" ? raw.amount : null;
  const status = typeof raw.status === "string" ? raw.status : null;

  return {
    // 승인 성공은 resultCode 0000 + status paid + 금액 일치를 모두 만족해야 한다
    ok: response.ok && resultCode === "0000" && status === "paid" && approvedAmount === amount,
    resultCode,
    resultMsg: typeof raw.resultMsg === "string" ? raw.resultMsg : "",
    tid: typeof raw.tid === "string" ? raw.tid : null,
    orderId: typeof raw.orderId === "string" ? raw.orderId : null,
    amount: approvedAmount,
    status,
    paidAt: typeof raw.paidAt === "string" ? raw.paidAt : null,
    raw,
  };
}

/** 승인된 결제를 취소한다(금액 불일치 등으로 되돌려야 할 때). */
export async function cancelNicepayPayment(tid: string, reason: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/payments/${encodeURIComponent(tid)}/cancel`, {
      method: "POST",
      headers: { Authorization: basicAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ reason, orderId: `cancel_${Date.now()}` }),
      cache: "no-store",
    });
    const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return response.ok && raw.resultCode === "0000";
  } catch {
    return false;
  }
}
