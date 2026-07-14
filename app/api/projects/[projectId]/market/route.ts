import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import { analyzeLocations } from "../../../../../lib/market/location-engine";
import { marketWorkspaceSchema } from "../../../../../lib/market/domain";
import { normalizeAttestedMarketWorkspaceInput } from "../../../../../lib/market/evidence-attestation";
import { saveMarketWorkspace } from "../../../../../lib/project-repository";

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const workspace = marketWorkspaceSchema.parse(
      normalizeAttestedMarketWorkspaceInput(await request.json()),
    );
    const analysis = analyzeLocations(workspace);
    const identity = await requireGuestIdentity();
    const project = await saveMarketWorkspace(
      projectId,
      identity.hash,
      workspace,
      analysis,
    );
    return NextResponse.json({ project, analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "시장·입지 정보를 저장하지 못했습니다.";
    return NextResponse.json(
      {
        error: {
          code: message === "PROJECT_NOT_FOUND" ? message : "MARKET_WORKSPACE_INVALID",
          message,
          retryable: false,
        },
      },
      { status: message === "PROJECT_NOT_FOUND" ? 404 : 400 },
    );
  }
}
