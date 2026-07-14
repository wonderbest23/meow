import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import { getProject } from "../../../../../lib/project-repository";
import { analyzeRegionalCoverage } from "../../../../../lib/regional-data/engine";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const project = await getProject(projectId, identity.hash);
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    const evidence = project.marketWorkspace?.evidence ?? [];
    const region =
      project.businessSetup?.region
      ?? evidence.find((item) => item.region)?.region
      ?? "";
    const report = analyzeRegionalCoverage({
      region,
      setup: project.businessSetup,
      evidence,
    });
    return NextResponse.json({ report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "지역 데이터 커버리지를 계산하지 못했습니다.";
    return NextResponse.json(
      { error: { code: message, message } },
      { status: message === "PROJECT_NOT_FOUND" ? 404 : 400 },
    );
  }
}
