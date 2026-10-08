import { getServerSupabase } from "../persistence";
import { cloudflareSaasConfigured, deleteLandingDomainConnection } from "../landing/custom-domain";
import { BUNDLE_PRODUCT_NAME, DOMAIN_PRODUCT_NAME, DOMAIN_PURCHASE_PRODUCT_NAME, REGEN_INCLUDED, REGEN_PACK_NAME, TOKEN_PACK_NAME } from "./domain";
import { HOMEPAGE_PRODUCT_NAME, summarizeDomainOrders, type PlanProduct } from "./plan-orders";
import type { PaymentOrder } from "./domain";
import { setAutoRenew } from "../landing/domain-registrar";
import { registrarConfig, registrarSupports } from "../landing/registrar-config";
import { readDomainRequest } from "../landing/domain-purchase";

/*
 * 환불한 상품을 실제로 닫는다.
 *
 * 주문 상태만 바꾸면 '결제 여부'를 묻는 화면은 닫히지만, 이미 만들어진 것들은 그대로 남았다.
 * 다시 생성 묶음은 별도 표(plan_regen_packs)에서 세어 계속 쓸 수 있었고, 공개 홈페이지·연결한 도메인·
 * 주간 리포트도 이어졌다 — 약관은 "환불하면 연결과 호스팅이 종료됩니다"라고 약속한다.
 *
 * 여기서 실패해도 돈은 이미 돌아갔으므로 예외를 던지지 않고, 관리자가 볼 경고 문구만 돌려준다.
 */

export function orderProduct(order: Pick<PaymentOrder, "orderName" | "opportunity">): PlanProduct {
  const product = (order.opportunity as { product?: string } | null)?.product;
  if (product) return product as PlanProduct;
  switch (order.orderName) {
    case HOMEPAGE_PRODUCT_NAME: return "homepage";
    case BUNDLE_PRODUCT_NAME: return "bundle";
    case REGEN_PACK_NAME: return "regen";
    case DOMAIN_PRODUCT_NAME: return "domain";
    case DOMAIN_PURCHASE_PRODUCT_NAME: return "domain-purchase";
    case TOKEN_PACK_NAME: return "tokens";
    default: return "plan";
  }
}

/** 그 사업의 홈페이지(사이트 행) — 계획서에서 만든 프로젝트는 opportunity.planId 로 이어진다 */
async function siteForPlan(ownerId: string, planId: string) {
  const supabase = getServerSupabase()!;
  const projects = await supabase.from("projects").select("id").eq("owner_id", ownerId).eq("opportunity->>planId", planId).limit(2);
  if (projects.error) throw projects.error;
  const projectId = projects.data?.[0]?.id as string | undefined;
  if (!projectId) return null;
  const site = await supabase.from("landing_sites").select("id, status, custom_domain").eq("project_id", projectId).maybeSingle();
  if (site.error) throw site.error;
  return site.data as { id: string; status: string; custom_domain: string | null } | null;
}

async function disconnectDomain(site: { id: string; custom_domain: string | null }) {
  if (!site.custom_domain) return;
  if (cloudflareSaasConfigured()) await deleteLandingDomainConnection(site.custom_domain);
  const { error } = await getServerSupabase()!.from("landing_sites").update({ custom_domain: null }).eq("id", site.id);
  if (error) throw error;
}

/** 같은 사업에 아직 유효한(환불 안 한) 도메인 주문이 남아 있는지 — 갱신분이 남았으면 연결을 끊지 않는다 */
async function otherDomainOrderActive(ownerId: string, planId: string, orderId: string) {
  const { data, error } = await getServerSupabase()!
    .from("payment_orders")
    .select("order_id, order_name, opportunity, confirmed_at, created_at")
    .eq("owner_id", ownerId)
    .in("order_name", [DOMAIN_PRODUCT_NAME, DOMAIN_PURCHASE_PRODUCT_NAME])
    .eq("status", "done")
    .limit(50);
  if (error) throw error;
  // '남아 있다'가 아니라 '지금 유효하다'로 — 지난해 만료된 1년차 주문이 갱신분 환불 뒤에도 연결을 붙잡지 않게
  return summarizeDomainOrders((data ?? []).filter(row => row.order_id !== orderId), planId).active;
}

/**
 * homepageOnly — 묶음 상품을 일부만 환불해 홈페이지만 닫을 때(계획서는 남긴다).
 * 돌려주는 값은 관리자 메모에 덧붙일 경고(없으면 빈 문자열).
 */
export async function closeRefundedProduct(order: PaymentOrder, options: { homepageOnly?: boolean } = {}): Promise<string> {
  const supabase = getServerSupabase();
  if (!supabase) return "";
  const product = orderProduct(order);
  const planId = String((order.opportunity as { planId?: string } | null)?.planId ?? "");
  const warnings: string[] = [];
  const attempt = async (label: string, work: () => Promise<void>) => {
    try { await work(); } catch (error) {
      console.error(`[refund-effects] ${label} failed`, order.orderId, error);
      warnings.push(`${label} 실패 — 직접 확인 필요`);
    }
  };

  /*
   * 다시 생성 묶음 — 줄을 통째로 지우면 그 묶음에서 이미 쓴 횟수는 '쓴 횟수'에 그대로 남아 다른 묶음이 깎였다.
   * 기본 횟수 → 산 순서대로 썼다고 보고, 이 묶음에서 이미 쓴 만큼만 남긴다(granted = 쓴 몫).
   */
  if (product === "regen") {
    await attempt("다시 생성 추가분 회수", async () => {
      const planId = String((order.opportunity as { planId?: string } | null)?.planId ?? "");
      const [packs, used] = await Promise.all([
        supabase.from("plan_regen_packs").select("order_id, granted, created_at").eq("plan_id", planId).order("created_at", { ascending: true }),
        supabase.from("plan_regenerations").select("id", { count: "exact", head: true }).eq("plan_id", planId).eq("ok", true),
      ]);
      if (packs.error || used.error) throw packs.error ?? used.error;
      // 쓴 횟수를 모르면 0번으로 보고 돌려주지 않는다
      if (used.count === null) throw new Error("REGEN_USAGE_UNKNOWN");
      let left = Math.max(0, (used.count ?? 0) - REGEN_INCLUDED);
      let keep = 0;
      for (const pack of packs.data ?? []) {
        const usedHere = Math.min(left, Number(pack.granted) || 0);
        left -= usedHere;
        if (pack.order_id === order.orderId) { keep = usedHere; break; }
      }
      const { error } = keep > 0
        ? await supabase.from("plan_regen_packs").update({ granted: keep }).eq("order_id", order.orderId)
        : await supabase.from("plan_regen_packs").delete().eq("order_id", order.orderId);
      if (error) throw error;
    });
  }

  if (!planId || !order.ownerId) return warnings.join(", ");

  // 홈페이지(묶음 포함) — 공개를 내리고 연결한 도메인도 끊는다. 주간 리포트·문의 접수는 공개 사이트에만 붙어 함께 멈춘다
  if (product === "homepage" || product === "bundle" || options.homepageOnly) {
    await attempt("홈페이지 비공개 전환", async () => {
      const site = await siteForPlan(order.ownerId!, planId);
      if (!site) return;
      await disconnectDomain(site);
      if (site.status === "published") {
        const { error } = await supabase.from("landing_sites").update({ status: "unpublished" }).eq("id", site.id);
        if (error) throw error;
      }
    });
  }

  // 자동 등록한 .com — 환불하면 Cloudflare 자동 갱신을 끈다(안 끄면 내년에 우리 결제수단으로 갱신된다). 도메인은 사장님 명의로 남는다
  if (product === "domain-purchase") {
    const domain = readDomainRequest((order.opportunity as { domainRequest?: unknown } | null)?.domainRequest)?.domain ?? "";
    const config = registrarConfig();
    if (config && registrarSupports(domain)) {
      await attempt("도메인 자동 갱신 끄기", async () => {
        if (!(await setAutoRenew(config, domain, false))) throw new Error("AUTO_RENEW_OFF_FAILED");
      });
    }
  }

  // 도메인 연결·호스팅 — 같은 사업에 남은 도메인 주문(갱신분)이 없을 때만 연결을 끊는다
  if (product === "domain" || product === "domain-purchase") {
    await attempt("도메인 연결 종료", async () => {
      if (await otherDomainOrderActive(order.ownerId!, planId, order.orderId)) return;
      const site = await siteForPlan(order.ownerId!, planId);
      if (site) await disconnectDomain(site);
    });
  }

  return warnings.join(", ");
}
