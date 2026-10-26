import type { PlanProduct } from "./plan-orders";
import { readDomainRequest } from "../landing/domain-purchase";

/*
 * 입금 기한이 지난 계좌이체 주문을 다시 주문할 곳(대표 결정 r41).
 * 주문에 사업(planId)·사업 종류(planType)·상품(product)이 모두 남아 있으면 같은 사업·같은 상품의 결제 화면으로,
 * 하나라도 모르면(예전 진단 흐름 주문 등) 내 사업(/plan)으로 보낸다.
 */
export type ReorderTarget = { planId: string; planType: string; product: PlanProduct; domain?: string };

const PRODUCTS: ReadonlySet<string> = new Set<PlanProduct>(["plan", "homepage", "bundle", "regen", "domain", "domain-purchase", "tokens"]);
const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null);

export function reorderTarget(opportunity: Record<string, unknown> | null | undefined): ReorderTarget | null {
  const planId = text(opportunity?.planId, 200);
  const planType = text(opportunity?.planType, 200);
  const product = text(opportunity?.product, 40);
  if (!planId || !planType || !product || !PRODUCTS.has(product)) return null;
  // 도메인 구입은 고른 주소도 같이(없으면 결제 화면이 주소부터 고르게 한다)
  const domain = product === "domain-purchase" ? readDomainRequest(opportunity?.domainRequest)?.domain : undefined;
  return { planId, planType, product: product as PlanProduct, ...(domain ? { domain } : {}) };
}

export function reorderHref(target: ReorderTarget | null | undefined): string {
  if (!target) return "/plan";
  return `/plan/pay?${new URLSearchParams({ planId: target.planId, planType: target.planType, product: target.product, ...(target.domain ? { domain: target.domain } : {}) }).toString()}`;
}
