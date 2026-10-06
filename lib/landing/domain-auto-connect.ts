import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "../persistence";
import { projectReadTable } from "../plan-builder/quarantine-tables";
import { DOMAIN_PURCHASE_PRODUCT_NAME } from "../payments/domain";
import { readDomainRequest } from "./domain-purchase";
import { cloudflareSaasConfigured, createLandingDomainConnection, deleteLandingDomainConnection } from "./custom-domain";
import { homepageManageUrl, landingEmailConfiguration, sendLandingLeadEmail } from "./lead-email";
import { customerSmsConfig, sendRelayV4, stableEventId, type CustomerSmsConfig } from "../notify/customer-sms";

/*
 * 관리자가 도메인 구매 대행 주문을 '등록 완료'로 바꾸면 사장님 대신 연결을 시작한다.
 * 예전에는 사장님이 홈페이지 화면에서 '연결 시작'을 직접 눌러야 했는데, 등록이 끝났다는 걸 알 길이 없었다.
 *   1) 그 사업의 홈페이지에 www.주소 로 Cloudflare 연결을 만들고(createLandingDomainConnection) 사이트에 적는다.
 *   2) 사장님께 문자(알림 휴대폰이 있으면, 중계 v4)와 메일로 "[오늘창업] 도메인 … 연결을 시작했어요".
 * 무엇이 안 돼도 관리자 처리(등록 완료 표시)는 그대로 성공한다 — 대신 관리자 화면에 보일 경고 한 줄을 돌려준다.
 * 같은 주문을 다시 눌러도 Cloudflare 는 있는 연결을 돌려주고, 문자·메일은 주문 번호로 한 번만 간다.
 */

export type DomainAutoConnectDependencies = {
  db: SupabaseClient | null;
  configured: boolean;
  connect: typeof createLandingDomainConnection;
  disconnect: typeof deleteLandingDomainConnection;
  sms: CustomerSmsConfig | null;
  email: ReturnType<typeof landingEmailConfiguration>;
  smsTransport?: typeof fetch;
  emailTransport?: typeof fetch;
};

export type DomainAutoConnectResult = { connected: boolean; hostname: string | null; warning: string | null; notified: string[] };

type SiteRow = { id: string; project_id: string; slug: string; status: string; custom_domain: string | null; alert_phone?: string | null };

export async function startRegisteredDomainConnection(orderId: string, dependencies?: DomainAutoConnectDependencies): Promise<DomainAutoConnectResult> {
  const deps: DomainAutoConnectDependencies = dependencies ?? {
    db: getServerSupabase(), configured: cloudflareSaasConfigured(), connect: createLandingDomainConnection, disconnect: deleteLandingDomainConnection,
    sms: customerSmsConfig(), email: landingEmailConfiguration(),
  };
  const result: DomainAutoConnectResult = { connected: false, hostname: null, warning: null, notified: [] };
  const warn = (text: string) => ({ ...result, warning: text });
  try {
    const { db } = deps;
    if (!db) return warn("저장소가 없어 자동 연결을 하지 않았어요.");
    const order = await db.from("payment_orders").select("owner_id, opportunity, customer_email").eq("order_id", orderId).eq("order_name", DOMAIN_PURCHASE_PRODUCT_NAME).eq("status", "done").maybeSingle();
    const opportunity = (order.data?.opportunity ?? null) as { planId?: unknown; domainRequest?: unknown } | null;
    const request = readDomainRequest(opportunity?.domainRequest);
    const planId = typeof opportunity?.planId === "string" ? opportunity.planId : "";
    const ownerId = order.data?.owner_id as string | undefined;
    if (order.error || !request || !planId || !ownerId) return warn("주문 정보를 읽지 못해 자동 연결을 하지 않았어요. 사장님 화면의 '연결 시작'으로 연결할 수 있어요.");
    const hostname = `www.${request.domain}`;
    result.hostname = hostname;

    const project = await db.from(projectReadTable()).select("id").eq("owner_id", ownerId).eq("opportunity->>planId", planId).limit(1);
    const projectId = (project.data?.[0] as { id?: string } | undefined)?.id;
    if (project.error || !projectId) return warn("이 사업의 홈페이지를 찾지 못해 자동 연결을 하지 않았어요.");
    const pick = (columns: string) => db.from("landing_sites").select(columns).eq("project_id", projectId).maybeSingle();
    // 알림 휴대폰 칸(0039)이 아직 없으면 번호 없이 — 메일만
    let site = await pick("id, project_id, slug, status, custom_domain, alert_phone");
    if (site.error) site = await pick("id, project_id, slug, status, custom_domain");
    const row = site.data as unknown as SiteRow | null;
    if (site.error || !row) return warn("이 사업의 홈페이지를 찾지 못해 자동 연결을 하지 않았어요.");
    if (row.status !== "published") return warn("홈페이지가 아직 공개 전이라 자동 연결을 미뤘어요. 공개한 뒤 사장님 화면의 '연결 시작'으로 연결돼요.");
    if (row.custom_domain && row.custom_domain !== hostname) return warn(`이미 다른 도메인(${row.custom_domain})이 연결돼 있어 바꾸지 않았어요.`);
    if (!deps.configured) return warn("Cloudflare 도메인 연결 설정이 없어 자동 연결을 하지 않았어요.");

    await deps.connect(hostname, { siteId: row.id, projectId, slug: row.slug });
    if (row.custom_domain !== hostname) {
      const saved = await db.from("landing_sites").update({ custom_domain: hostname }).eq("id", row.id);
      if (saved.error) {
        await deps.disconnect(hostname).catch(() => undefined);
        return warn(saved.error.code === "23505" ? `${hostname} 은(는) 이미 다른 홈페이지에 연결돼 있어요.` : "연결을 만들었지만 홈페이지에 저장하지 못해 되돌렸어요.");
      }
    }
    result.connected = true;

    // 사장님께 알림 — 실패는 경고로만
    const problems: string[] = [];
    const phone = row.alert_phone && /^010\d{8}$/.test(row.alert_phone) ? row.alert_phone : null;
    if (phone && deps.sms) {
      const sent = await sendRelayV4(deps.sms, { eventId: await stableEventId(`domain-connect:${orderId}`), eventType: "domain-connect-started", recipient: phone, params: { domain: hostname } }, deps.smsTransport);
      if (sent.status === "accepted" || sent.status === "test_accepted") result.notified.push("sms"); else problems.push(`문자 ${sent.code}`);
    }
    let to = (order.data?.customer_email as string | null | undefined)?.trim() || null;
    if (!to) {
      const owner = await db.auth.admin.getUserById(ownerId).catch(() => null);
      to = owner?.data?.user?.email_confirmed_at ? owner.data.user.email ?? null : null;
    }
    if (to && deps.email) {
      const sent = await sendLandingLeadEmail({
        from: deps.email.from, to,
        subject: `[오늘창업] 도메인 ${hostname} 연결을 시작했어요`,
        text: [
          `${request.domain} 등록을 마치고 홈페이지 연결을 시작했어요.`,
          "",
          `보안 인증서가 발급되면 ${hostname} 으로 홈페이지가 열려요. 보통 몇 분에서 하루 안에 끝나요.`,
          "따로 하실 일은 없어요. 진행 상황은 홈페이지 화면의 '회사 이름으로 된 주소 쓰기'에서 볼 수 있어요.",
          homepageManageUrl(planId),
        ].join("\n"),
      }, deps.email.key, `domain-connect/${orderId}`, deps.emailTransport);
      if (sent.ok) result.notified.push("email"); else problems.push(`메일 ${sent.code}`);
    }
    if (!result.notified.length && !problems.length) problems.push("알림 받을 휴대폰·메일(발송 설정) 없음");
    return problems.length ? { ...result, warning: `연결은 시작했어요. 다만 사장님 알림: ${problems.join(", ")}` } : result;
  } catch (error) {
    const detail = error instanceof Error ? error.message.replace(/^CLOUDFLARE_DOMAIN_ERROR:?/, "").slice(0, 160) : "";
    return warn(`자동 연결에 실패했어요${detail ? `(${detail})` : ""}. 사장님 화면의 '연결 시작'으로 다시 시도할 수 있어요.`);
  }
}
