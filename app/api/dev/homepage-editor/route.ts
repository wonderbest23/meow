import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { createProject, findProjectIdByPlan } from "../../../../lib/project-repository";
import { getLandingForProject, saveLandingDraft } from "../../../../lib/landing/repository";
import { landingDraftFromPlan } from "../../../../lib/landing/from-plan";

export async function POST() {
  if (process.env.NODE_ENV !== "development" || process.env.PERSISTENCE_MODE !== "demo-memory" || process.env.HOMEPAGE_EDITOR_LAB !== "true" || process.env.SUPABASE_URL) return new Response(null, { status: 404 });
  const identity = await requireGuestIdentity();
  let projectId = await findProjectIdByPlan("homepage-editor-lab", identity.hash);
  if (!projectId) {
    const project = await createProject({ opportunity: { title: "로컬 홈페이지 검증", planId: "homepage-editor-lab", source: "local-fixture" }, founderProfile: {}, paymentStatus: "paid", packagePrice: 0 }, identity.hash);
    projectId = project.id;
  }
  let site = await getLandingForProject(projectId, identity.hash);
  if (!site) {
    const draft = landingDraftFromPlan({ planTitle: "새벽커피", business: { industry: "카페" }, answers: { "market/products": { main_offer: "드립커피" }, "market/segments": { first_target: "동네 직장인" } } });
    site = await saveLandingDraft(projectId, identity.hash, draft, { expectedUpdatedAt: null });
  }
  return NextResponse.json({ site }, { headers: { "Cache-Control": "no-store" } });
}
