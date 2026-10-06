/*
 * 운영자 처리 알림 — 환불 요청 접수·도메인 구매 결제처럼 '사람이 영업일 안에 손으로 처리해야
 * 하는' 일이 생겼을 때 운영자에게 메일을 보낸다. 약관에 처리 기한을 약속해 두고도 아무도
 * 모르면 기한을 넘기게 된다.
 *
 * 발송은 고객센터 문의 알림과 같은 lib/notify/owner-email 을 그대로 쓴다(Resend, 받는 주소는
 * OWNER_NOTIFY_EMAIL, 열쇠는 RESEND_API_KEY). 새 발송 수단을 따로 두지 않는다.
 * 열쇠가 없으면 owner-email 이 경고만 남기고 건너뛴다 — 로컬·미설정 환경에서는 아무 일도 없다.
 *
 * 절대 던지지 않고, 오래 기다리지도 않는다 — 결제 복귀·환불 접수 응답이 알림 때문에
 * 늦어지거나 실패하면 주객전도다.
 */
import { notifyOwnerByEmail } from "./notify/owner-email";

/** 응답을 붙잡아 두는 최대 시간 — owner-email 자체 제한(6초)보다 짧게 끊는다 */
const OPS_ALERT_WAIT_MS = 3000;

export async function notifyOperator(subject: string, lines: string[]): Promise<void> {
  try {
    const text = [...lines, "", `발생 시각: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`].join("\n");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), OPS_ALERT_WAIT_MS); });
    const outcome = await Promise.race([notifyOwnerByEmail(`[오늘창업] ${subject}`, text), timeout])
      .finally(() => clearTimeout(timer));
    if (outcome === "timeout") console.error(`[ops-alert] 알림 발송이 ${OPS_ALERT_WAIT_MS}ms 안에 끝나지 않음: ${subject}`);
  } catch (error) {
    console.error(`[ops-alert] 알림 발송 오류: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** 도메인 구매 결제 완료 — 결제 복귀(return)와 결과 확인(reconcile) 어느 쪽에서 완료돼도 같은 알림 */
export async function notifyDomainPurchasePaid(order: { orderId: string; amount: number; domain: string | null }): Promise<void> {
  // .com 은 자동 등록(lib/landing/domain-registrar.ts)이 켜져 있으면 손댈 일이 없다 — 실패하면 따로 '손으로 처리' 메일이 간다
  const auto = Boolean(process.env.CLOUDFLARE_REGISTRAR_TOKEN?.trim()) && /^[^.]+\.com$/.test(order.domain ?? "");
  await notifyOperator(auto ? "도메인 구매 결제 완료 — 자동 등록 중(.com)" : "도메인 구매 결제가 완료됐습니다 — 등록 처리 필요", [
    `주소: ${order.domain ?? "(주소 정보 없음)"}`,
    `금액: ${order.amount.toLocaleString("ko-KR")}원`,
    `주문번호: ${order.orderId}`,
    "",
    "처리하기: https://oneulstart.com/admin/domains",
  ]);
}
