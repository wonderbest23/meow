import { NextResponse } from "next/server";
import { requireAuthenticatedIdentity } from "../../../../../lib/api-auth";
import { getProject } from "../../../../../lib/project-repository";
import { previewArtifactUpdate } from "../../../../../lib/plan-builder/artifact-update-service";

export async function GET(request: Request) {
  try {
    const identity = await requireAuthenticatedIdentity();
    const projectId = new URL(request.url).searchParams.get("projectId");
    if (!projectId) return NextResponse.json({ error: { code: "PROJECT_REQUIRED", message: "홈페이지를 선택해주세요." } }, { status: 400 });
    const project = await getProject(projectId, identity.hash);
    const planId = project?.opportunity?.planId;
    if (!project || typeof planId !== "string" || project.opportunity.source !== "plan-builder") {
      return NextResponse.json({ error: { code: "PROJECT_NOT_FOUND", message: "연결된 사업을 찾을 수 없습니다." } }, { status: 404 });
    }
    const preview = await previewArtifactUpdate(identity.hash, planId);
    return NextResponse.json({ planId, preview }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const login = error instanceof Error && error.message === "ACCOUNT_LOGIN_REQUIRED";
    return NextResponse.json({ error: { code: login ? "LOGIN_REQUIRED" : "LANDING_SOURCE_UNAVAILABLE", message: login ? "로그인 후 다시 확인해주세요." : "최신 사업정보를 불러오지 못했습니다. 다시 시도해주세요." } }, { status: login ? 401 : 503 });
  }
}
