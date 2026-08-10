import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import { createLandingDraft, landingDraftSchema } from "../../../../../lib/landing/domain";
import {
  getLandingForProject,
  listLandingLeads,
  saveLandingDraft,
} from "../../../../../lib/landing/repository";
import { getProject } from "../../../../../lib/project-repository";

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
    const leads = site ? await listLandingLeads(projectId, identity.hash) : [];
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
    return NextResponse.json({ site, leads, suggestedDraft });
  } catch (error) {
    const message = error instanceof Error ? error.message : "랜딩페이지를 불러오지 못했습니다.";
    return NextResponse.json(
      { error: { code: message, message } },
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
    const draft = landingDraftSchema.parse(await request.json());
    const site = await saveLandingDraft(projectId, identity.hash, draft);
    return NextResponse.json({ site });
  } catch (error) {
    const message = error instanceof Error ? error.message : "랜딩페이지를 저장하지 못했습니다.";
    const code = message === "SLUG_TAKEN" ? message : "LANDING_DRAFT_INVALID";
    return NextResponse.json(
      {
        error: {
          code,
          message: message === "SLUG_TAKEN" ? "이미 사용 중인 공개 주소입니다." : message,
        },
      },
      { status: message === "PROJECT_NOT_FOUND" ? 404 : 400 },
    );
  }
}
