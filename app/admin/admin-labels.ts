/* 관리자 화면 공용 이름표 — 대시보드·결제 주문·상담함이 같은 말을 쓰게 한 곳에 둔다 */

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CARD: "카드(나이스페이)",
  TOSSPAY: "토스페이",
  TRANSFER: "계좌이체",
  APPLE_IAP: "앱 결제(Apple)",
  GOOGLE_IAP: "앱 결제(Google Play)",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  created: "결제 안 끝남",
  confirming: "결제 확인 중",
  awaiting_deposit: "입금 대기",
  deposit_reported: "고객 입금 알림",
  done: "결제 완료",
  partial_canceled: "일부 환불",
  refunded: "환불 완료",
  canceled: "주문 취소",
  aborted: "결제 중단",
  expired: "기한 만료",
  failed: "결제 실패",
};

export function paymentMethodLabel(method: string | null | undefined) {
  return method ? PAYMENT_METHOD_LABELS[method] ?? method : "-";
}

export function paymentStatusLabel(status: string) {
  return PAYMENT_STATUS_LABELS[status] ?? status;
}

/* 상담 상태 — 대시보드와 상담함이 '진행 중'/'상담 중'으로 달랐다 */
export const SUPPORT_STATUS_LABELS = { open: "진행 중", closed: "완료" } as const;

export type AdminSupportCustomer = { kind: "account"; email: string | null } | { kind: "guest" } | { kind: "unknown" };

export function supportCustomerLabel(customer: AdminSupportCustomer | undefined) {
  if (!customer) return "손님 확인 중";
  if (customer.kind === "account") return customer.email || "이메일 없는 계정";
  if (customer.kind === "guest") return "로그인 안 한 손님";
  return "손님을 확인하지 못했어요";
}

export function won(amount: number) {
  return `${amount.toLocaleString("ko-KR")}원`;
}
