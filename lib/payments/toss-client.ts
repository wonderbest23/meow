import type { TossPaymentResponse } from "./domain";

const TOSS_API = "https://api.tosspayments.com/v1";

export class TossPaymentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

function secretKey() {
  const value = process.env.TOSS_SECRET_KEY;
  if (!value) throw new TossPaymentError("토스페이먼츠 시크릿 키가 설정되지 않았습니다.", "TOSS_NOT_CONFIGURED", 503);
  return value;
}

async function tossRequest(path: string, init: RequestInit, idempotencyKey?: string): Promise<TossPaymentResponse> {
  const authorization = Buffer.from(`${secretKey()}:`).toString("base64");
  const response = await fetch(`${TOSS_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${authorization}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey ?? crypto.randomUUID(),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = payload as { code?: string; message?: string };
    throw new TossPaymentError(
      error.message ?? "결제사 요청에 실패했습니다.",
      error.code ?? "TOSS_API_FAILED",
      response.status,
    );
  }
  return payload as TossPaymentResponse;
}

export function confirmTossPayment(input: {
  paymentKey: string;
  orderId: string;
  amount: number;
}) {
  return tossRequest("/payments/confirm", {
    method: "POST",
    body: JSON.stringify(input),
  }, input.orderId);
}

export function queryTossPayment(paymentKey: string) {
  return tossRequest(`/payments/${encodeURIComponent(paymentKey)}`, {
    method: "GET",
  });
}

export function tossConfigured() {
  return Boolean(process.env.TOSS_CLIENT_KEY && process.env.TOSS_SECRET_KEY);
}
