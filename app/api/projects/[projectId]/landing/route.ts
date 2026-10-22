import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import { createLandingDraft, landingDraftSchema } from "../../../../../lib/landing/domain";
import {
  getLandingForProject,
  saveLandingDraft,
} from "../../../../../lib/landing/repository";
import { getProject } from "../../../../../lib/project-repository";
import { checkLandingEditAccess, landingEditErrorResponse } from "../../../../../lib/landing/plan-entitlement";
import { LANDING_CONFLICT_MESSAGE } from "../../../../../lib/landing/save-contract";
import { publicErrorCode, publicErrorMessage } from "../../../../../lib/api-errors";

const saveRequestSchema = z.object({ draft: landingDraftSchema, expectedUpdatedAt: z.string().datetime({ offset: true }).nullable() });

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const project = await getProject(projectId, identity.hash);
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    const site = await getLandingForProject(projectId, identity.hash);
    // 문의(손님 개인정보)는 여기서 보내지 않는다 — '내 문의'가 /api/plan/inquiries 로 따로 읽는다
    const stage = project.stages[4];
    const artifact = stage?.artifacts.find((item) => item.id === stage.approvedArtifactId)
      ?? stage?.artifacts[0];
    const content = artifact?.content ?? {};
    const blocks = Array.isArray(content.blocks)
      ? content.blocks as Array<Record<string, unknown>>
      : [];
    const hero = blocks.find((block) => block.type === "hero");
    const suggestedDraft = createLandingDraft({
      title: String(project.opportunity.title ?? project.title),
      oneLiner: String(hero?.headline ?? project.opportunity.oneLiner ?? ""),
      customer: String(project.opportunity.customer ?? ""),
      model: String(project.opportunity.model ?? ""),
      sector: String(project.opportunity.sector ?? ""),
      legalNotice: String(content.legalNotice ?? ""),
    });
    if (hero?.subheadline) suggestedDraft.subheadline = String(hero.subheadline);
    if (hero?.cta) suggestedDraft.ctaLabel = String(hero.cta);
    if (Array.isArray(content.proofItems)) {
      suggestedDraft.proofItems = content.proofItems.filter((item): item is string => typeof item === "string");
    } else {
      const proof = blocks.find((block) => block.type === "proof");
      if (Array.isArray(proof?.items)) {
        suggestedDraft.proofItems = proof.items.filter((item): item is string => typeof item === "string");
      }
    }
    return NextResponse.json({ site, suggestedDraft }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "홈페이지를 불러오지 못했어요.";
    return NextResponse.json(
      { error: { code: publicErrorCode(error, "LANDING_LOAD_FAILED"), message: publicErrorMessage(error, "홈페이지를 불러오지 못했어요.") } },
      { status: message === "PROJECT_NOT_FOUND" ? 404 : 400 },
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    // 화면에서 버튼을 숨기는 것만으로는 API를 직접 부르면 뚫린다
    const reason = await checkLandingEditAccess(projectId, identity.hash, identity.userId, identity.email);
    if (reason !== "ok") {
      const { status, body } = landingEditErrorResponse(reason);
      return NextResponse.json(body, { status });
    }
    const body = await request.json();
    if (!body || !Object.hasOwn(body, "expectedUpdatedAt")) {
      return NextResponse.json({ error: { code: "LANDING_VERSION_REQUIRED", message: "저장 기준 정보가 없어요. 새로고침한 뒤 다시 고쳐 주세요." } }, { status: 428 });
    }
    const { draft, expectedUpdatedAt } = saveRequestSchema.parse(body);
    const site = await saveLandingDraft(projectId, identity.hash, draft, { expectedUpdatedAt });
    return NextResponse.json({ site });
  } catch (error) {
    const message = error instanceof Error ? error.message : "홈페이지를 저장하지 못했어요.";
    if (message === "LANDING_DRAFT_CONFLICT") {
      return NextResponse.json({ error: { code: message, message: LANDING_CONFLICT_MESSAGE } }, { status: 409 });
    }
    /*
     * 주소(무료 주소 끝부분) 문제는 따로 알린다 — 화면이 그 칸 바로 아래에 이유를 보여 준다.
     * 예전엔 'ab' 를 넣으면 이유 없이 '랜딩페이지를 저장하지 못했습니다.'만 맨 위에 떴다.
     */
    if (error instanceof ZodError) {
      const slugIssue = error.issues.find(issue => ["draft.slug", "slug"].includes(issue.path.join(".")));
      if (slugIssue) return NextResponse.json({ error: { code: "LANDING_SLUG_INVALID", field: "slug", message: slugIssue.message } }, { status: 400 });
    }
    if (message === "SLUG_TAKEN") {
      return NextResponse.json({ error: { code: message, field: "slug", message: "이 주소는 다른 홈페이지가 쓰고 있어요. 다른 주소를 적어 주세요." } }, { status: 400 });
    }
    return NextResponse.json(
      {
        error: {
          code: "LANDING_DRAFT_INVALID",
          message: publicErrorMessage(error, "홈페이지를 저장하지 못했어요. 적은 내용을 확인하고 다시 저장해 주세요."),
        },
      },
      { status: message === "PROJECT_NOT_FOUND" ? 404 : 400 },
    );
  }
}
