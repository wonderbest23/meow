import { getServerSupabase } from "../persistence";
import { getPaymentOrder } from "./repository";
import { getRefundRequest } from "./refund-requests";
import { orderProduct } from "./refund-effects";
import { productName } from "./plan-orders";
import { DOMAIN_PRODUCT_AMOUNT, DOMAIN_PURCHASE_REGISTRATION_AMOUNT, REGEN_PACK_COUNT } from "./domain";
import { readDomainRequest } from "../landing/domain-purchase";
import { resolveTokenBalance } from "../landing/ai-tokens";
import { resolveRegenQuota } from "../plan-builder/regen-quota";

/*
 * 환불 판단 근거 — 약관의 '남은 만큼 환불'을 운영자가 DB 없이 계산할 수 있게 상품별 숫자와 제안 금액을 모은다.
 * 제안은 약관 공식(lib/platform-legal/domain.ts 환불 항목)대로이며, 연결 후 7일 이내 전액 같은 예외는 운영자가 판단한다.
 */

export type RefundBasis = { product: string; paidAt: string | null; lines: string[]; suggested: number | null; suggestedWhy: string };

const won = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;
const MONTH_MS = 30 * 86_400_000;

export async function refundBasis(requestId: string, now = Date.now()): Promise<RefundBasis | null> {
  const request = await getRefundRequest(requestId);
  if (!request) return null;
  const order = await getPaymentOrder(request.orderId);
  if (!order) return null;
  const product = orderProduct(order);
  const planId = String((order.opportunity as { planId?: string } | null)?.planId ?? "");
  const paidAt = order.confirmedAt;
  const lines = [`상품: ${productName(product)} · ${won(order.amount)} · ${order.method === "TRANSFER" ? "계좌이체" : "카드"}`, `결제일: ${paidAt ? new Date(paidAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : "기록 없음"}`];
  let suggested: number | null = null;
  let suggestedWhy = "";

  if (product === "domain" || product === "domain-purchase") {
    const request = readDomainRequest((order.opportunity as { domainRequest?: unknown }).domainRequest);
    const site = order.projectId ? await getServerSupabase()?.from("landing_sites").select("custom_domain").eq("project_id", order.projectId).maybeSingle() : null;
    if (request) lines.push(`도메인: ${request.domain} · ${request.status === "registered" ? `등록됨${request.registeredAt ? ` (${new Date(request.registeredAt).toLocaleDateString("ko-KR")})` : ""}` : "등록 전"}`);
    lines.push(`지금 연결된 주소: ${site?.data?.custom_domain ?? "없음"}`);
    const months = paidAt ? Math.min(12, Math.max(1, Math.ceil((now - Date.parse(paidAt)) / MONTH_MS))) : null;
    if (product === "domain-purchase" && request?.status !== "registered") { suggested = order.amount; suggestedWhy = "등록 전 — 전액"; }
    else if (months !== null) {
      const base = product === "domain-purchase" ? DOMAIN_PRODUCT_AMOUNT : Math.min(order.amount, DOMAIN_PRODUCT_AMOUNT);
      suggested = Math.floor(base * (12 - months) / 12);
      suggestedWhy = `${months}개월 사용(일부라도 쓴 달은 한 달) → ${12 - months}개월분${product === "domain-purchase" ? ` · 등록비 ${won(DOMAIN_PURCHASE_REGISTRATION_AMOUNT)} 제외` : ""}. 연결 후 7일 이내면 전액`;
    }
  } else if (product === "tokens" && planId && order.ownerId) {
    const balance = await resolveTokenBalance(order.ownerId, planId);
    lines.push(`토큰: 충전 ${balance.purchased.toLocaleString("ko-KR")} · 사용 ${balance.used.toLocaleString("ko-KR")} · 남음 ${balance.remaining.toLocaleString("ko-KR")}`);
    const fresh = paidAt ? now - Date.parse(paidAt) <= 7 * 86_400_000 : false;
    if (fresh && balance.used === 0) { suggested = order.amount; suggestedWhy = "충전 7일 이내·미사용 — 전액"; }
    else if (balance.purchased > 0) {
      // 먼저 충전한 것부터 쓰므로 이 묶음의 남은 몫은 '남은 토큰'과 '이 묶음 크기' 중 작은 쪽(여러 묶음이면 근사)
      const pack = balance.packSize;
      const left = Math.min(pack, balance.remaining);
      suggested = Math.floor(order.amount * left / pack);
      suggestedWhy = `이 묶음 ${pack.toLocaleString("ko-KR")} 중 ${left.toLocaleString("ko-KR")} 남음(여러 번 충전했다면 근사)`;
    }
  } else if (product === "regen" && planId) {
    const quota = await resolveRegenQuota(planId);
    if (!quota.unavailable) {
      lines.push(`다시 생성: 받은 ${quota.allowed}회 · 쓴 ${quota.used}회 · 남음 ${quota.remaining}회`);
      const left = Math.min(REGEN_PACK_COUNT, quota.remaining);
      suggested = Math.floor(order.amount * left / REGEN_PACK_COUNT);
      suggestedWhy = `이 묶음 ${REGEN_PACK_COUNT}회 중 ${left}회 남음`;
    }
  }
  return { product, paidAt, lines, suggested, suggestedWhy };
}
