import { NextResponse } from "next/server";
import { getProject } from "../../../../../../lib/project-repository";
import { domainEntitlement } from "../../../../../../lib/payments/plan-orders";
import { DOMAIN_PRODUCT_AMOUNT } from "../../../../../../lib/payments/domain";
import { checkLandingEditAccess, landingEditErrorResponse } from "../../../../../../lib/landing/plan-entitlement";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../../../lib/api-auth";
import {
  cloudflareSaasConfigured,
  createLandingDomainConnection,
  deleteLandingDomainConnection,
  getLandingDomainConnection,
  normalizeLandingHostname,
} from "../../../../../../lib/landing/custom-domain";
import {
  getLandingForProject,
  setLandingCustomDomain,
} from "../../../../../../lib/landing/repository";

const requestSchema = z.object({ hostname: z.string().trim().min(4).max(253) });

const messages: Record<string, string> = {
  ACCOUNT_LOGIN_REQUIRED: "로그인 후 도메인을 연결할 수 있습니다.",
  PROJECT_NOT_FOUND: "사업 프로젝트를 찾을 수 없습니다.",
  LANDING_NOT_FOUND: "홈페이지를 먼저 공개해주세요.",
  LANDING_NOT_PUBLISHED: "홈페이지를 먼저 공개한 뒤 도메인을 연결해주세요.",
  CUSTOM_DOMAIN_INVALID: "올바른 도메인 주소를 입력해주세요.",
  CUSTOM_DOMAIN_WWW_REQUIRED: "구매한 도메인의 www 주소를 입력해주세요. 예: www.mybrand.com",
  CUSTOM_DOMAIN_TAKEN: "이미 다른 홈페이지에 연결된 도메인입니다.",
  DOMAIN_SERVICE_NOT_CONFIGURED: "도메인 자동 연결을 준비하고 있습니다. 잠시 후 다시 시도해주세요.",
  DOMAIN_PAYMENT_REQUIRED: "도메인 연결은 '내 도메인 연결 + 호스팅 1년' 결제 후 쓸 수 있습니다.",
};

/* 플랜에서 만든 홈페이지면 도메인 상품 결제가 있어야 연결·변경할 수 있다 */
async function domainPlanOf(projectId: string, guestHash: string): Promise<string> {
  const project = await getProject(projectId, guestHash);
  const opp = (project?.opportunity ?? {}) as { source?: string; planId?: string };
  return opp.source === "plan-builder" ? String(opp.planId ?? "") : "";
}

function errorResponse(error: unknown) {
  const raw = error instanceof Error ? error.message : "CUSTOM_DOMAIN_FAILED";
  const code = raw.split(":", 1)[0];
  const cloudflareDetail = raw.startsWith("CLOUDFLARE_DOMAIN_ERROR:")
    ? raw.slice("CLOUDFLARE_DOMAIN_ERROR:".length)
    : "";
  return NextResponse.json(
    {
      error: {
        code,
        message: messages[code] ?? (cloudflareDetail || "도메인을 연결하지 못했습니다. 잠시 후 다시 시도해주세요."),
      },
    },
    { status: code === "PROJECT_NOT_FOUND" || code === "LANDING_NOT_FOUND" ? 404 : code === "DOMAIN_SERVICE_NOT_CONFIGURED" ? 503 : code === "DOMAIN_PAYMENT_REQUIRED" ? 402 : 400 },
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const reason = await checkLandingEditAccess(projectId, identity.hash, identity.userId);
    if (reason !== "ok") {
      const { status, body } = landingEditErrorResponse(reason);
      return NextResponse.json(body, { status });
    }
    const site = await getLandingForProject(projectId, identity.hash);
    if (!site) throw new Error("LANDING_NOT_FOUND");
    const connection = site.customDomain
      ? await getLandingDomainConnection(site.customDomain)
      : {
          configured: cloudflareSaasConfigured(),
          hostname: "",
          hostnameStatus: "not_created",
          sslStatus: "not_created",
          ready: false,
          cnameTarget: process.env.CLOUDFLARE_SAAS_CNAME_TARGET?.trim() || "connect.oneulstart.com",
          verificationRecords: [],
          errors: [],
        };
    const planId = await domainPlanOf(projectId, identity.hash);
    const entitlement = planId
      ? { ...(await domainEntitlement(identity.userId, planId)), required: true, planId, price: DOMAIN_PRODUCT_AMOUNT }
      : { active: true, expiresAt: null, required: false, planId: "", price: DOMAIN_PRODUCT_AMOUNT };
    return NextResponse.json({ site, connection, entitlement });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const reason = await checkLandingEditAccess(projectId, identity.hash, identity.userId);
    if (reason !== "ok") {
      const { status, body } = landingEditErrorResponse(reason);
      return NextResponse.json(body, { status });
    }
    const planId = await domainPlanOf(projectId, identity.hash);
    if (planId && !(await domainEntitlement(identity.userId, planId)).active) throw new Error("DOMAIN_PAYMENT_REQUIRED");
    const { hostname: rawHostname } = requestSchema.parse(await request.json());
    const hostname = normalizeLandingHostname(rawHostname);
    const site = await getLandingForProject(projectId, identity.hash);
    if (!site) throw new Error("LANDING_NOT_FOUND");
    if (site.status !== "published") throw new Error("LANDING_NOT_PUBLISHED");
    if (!cloudflareSaasConfigured()) throw new Error("DOMAIN_SERVICE_NOT_CONFIGURED");

    if (site.customDomain && site.customDomain !== hostname) {
      await deleteLandingDomainConnection(site.customDomain);
    }
    const connection = await createLandingDomainConnection(hostname, {
      siteId: site.id,
      projectId,
      slug: site.slug,
    });
    try {
      const updatedSite = await setLandingCustomDomain(projectId, identity.hash, hostname);
      return NextResponse.json({ site: updatedSite, connection });
    } catch (error) {
      if (site.customDomain !== hostname) await deleteLandingDomainConnection(hostname).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const reason = await checkLandingEditAccess(projectId, identity.hash, identity.userId);
    if (reason !== "ok") {
      const { status, body } = landingEditErrorResponse(reason);
      return NextResponse.json(body, { status });
    }
    const site = await getLandingForProject(projectId, identity.hash);
    if (!site) throw new Error("LANDING_NOT_FOUND");
    if (site.customDomain && cloudflareSaasConfigured()) {
      await deleteLandingDomainConnection(site.customDomain);
    }
    const updatedSite = await setLandingCustomDomain(projectId, identity.hash, null);
    return NextResponse.json({ site: updatedSite });
  } catch (error) {
    return errorResponse(error);
  }
}
