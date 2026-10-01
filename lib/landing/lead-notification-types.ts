export type LeadNotificationStatus = "pending" | "processing" | "sent" | "retry" | "blocked" | "failed";
export type LeadNotificationError = "missing_email_config" | "recipient_missing" | "provider_rejected" | "provider_unavailable" | "delivery_unknown" | "attempt_limit";
export type LeadNotificationSummary = {
  leadId: string;
  status: LeadNotificationStatus;
  attempts: number;
  nextAttemptAt: string | null;
  acceptedAt: string | null;
  errorCode: LeadNotificationError | null;
};
export const LEAD_NOTIFICATION_MAX_ATTEMPTS = 5;
export const LEAD_NOTIFICATION_LABELS: Record<LeadNotificationStatus, string> = {
  pending: "알림 대기",
  processing: "알림 보내는 중",
  sent: "알림 보냄",
  retry: "알림 재시도 대기",
  blocked: "알림 설정 확인 필요",
  failed: "알림 발송 확인 필요",
};
