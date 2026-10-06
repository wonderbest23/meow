import { NextResponse } from "next/server";
import { checkLandingEditAccess, landingEditErrorResponse } from "../../../../../../lib/landing/plan-entitlement";
import { requireGuestIdentity } from "../../../../../../lib/api-auth";
import { publishLanding } from "../../../../../../lib/landing/repository";
import { z } from "zod";
import { LANDING_CONFLICT_MESSAGE } from "../../../../../../lib/landing/save-contract";
import { publicErrorCode, publicErrorMessage } from "../../../../../../lib/api-errors";

const schema = z.object({ expectedUpdatedAt: z.string().datetime({ offset: true }) });

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const reason = await checkLandingEditAccess(projectId, identity.hash, identity.userId, identity.email);
    if (reason !== "ok") {
      const { status, body } = landingEditErrorResponse(reason);
      return NextResponse.json(body, { status });
    }
    const body = await request.json().catch(() => ({}));
    if (!body || !Object.hasOwn(body, "expectedUpdatedAt")) return NextResponse.json({ error: { code: "LANDING_VERSION_REQUIRED", message: "공개할 저장 버전을 확인해주세요. 새로고침 후 다시 시도해주세요." } }, { status: 428 });
    const { expectedUpdatedAt } = schema.parse(body);
    const site = await publishLanding(projectId, identity.hash, expectedUpdatedAt);
    return NextResponse.json({ site, publicPath: `/launch/${site.publishedSlug ?? site.slug}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "랜딩페이지를 공개하지 못했습니다.";
    if (message === "LANDING_DRAFT_CONFLICT") return NextResponse.json({ error: { code: message, message: LANDING_CONFLICT_MESSAGE } }, { status: 409 });
    // 'LANDING_COMPLIANCE_BLOCKED:항목 / 항목' — 코드 문자열이 화면에 그대로 보이지 않게 한국어 안내로
    if (message.startsWith("LANDING_COMPLIANCE_BLOCKED:")) {
      const items = message.slice("LANDING_COMPLIANCE_BLOCKED:".length).trim();
      return NextResponse.json({ error: { code: "LANDING_COMPLIANCE_BLOCKED", message: `공개 전에 이것부터 채워 주세요: ${items}`, items: items.split(" / ").filter(Boolean) } }, { status: 400 });
    }
    if (message === "SLUG_TAKEN") return NextResponse.json({ error: { code: message, message: "이 공개 주소는 다른 홈페이지가 쓰고 있어요. 주소를 바꿔 다시 공개해 주세요." } }, { status: 409 });
    return NextResponse.json(
      { error: { code: publicErrorCode(error, "LANDING_PUBLISH_FAILED"), message: publicErrorMessage(error, "랜딩페이지를 공개하지 못했습니다.", { LANDING_NOT_FOUND: "홈페이지를 찾을 수 없습니다." }) } },
      { status: message === "PROJECT_NOT_FOUND" || message === "LANDING_NOT_FOUND" ? 404 : 400 },
    );
  }
}
