import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../../../lib/api-auth";
import { getProject } from "../../../../../../lib/project-repository";
import { fetchNearbyStores } from "../../../../../../lib/market/sbiz-connector";
import { signMarketEvidence } from "../../../../../../lib/market/evidence-attestation";
import type { MarketEvidence } from "../../../../../../lib/market/domain";

const requestSchema = z.object({
  longitude: z.number().min(124).max(132),
  latitude: z.number().min(33).max(39),
  radiusMeters: z.number().int().min(50).max(2000).default(500),
  industryLargeCode: z.string().trim().max(10).optional(),
  industryMiddleCode: z.string().trim().max(10).optional(),
  industrySmallCode: z.string().trim().max(10).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const project = await getProject(projectId, identity.hash);
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    const input = requestSchema.parse(await request.json());
    const result = await fetchNearbyStores(input);
    let evidence: MarketEvidence | null = null;
    if (result.status === "ok" && result.totalCount !== null) {
      const unsigned = {
        id: crypto.randomUUID(),
        sourceType: "official_api" as const,
        title: `${project.businessSetup?.region || "선택 좌표"} 주변 상가업소 현황`,
        metric: `반경 ${input.radiusMeters}m 전체 상가업소 수`,
        value: String(result.totalCount),
        numericValue: result.totalCount,
        unit: "곳",
        region: project.businessSetup?.region ?? "",
        sourceName: result.sourceName,
        sourceUrl: result.sourceUrl,
        observedAt: result.observedAt,
        note: "업종코드 필터를 지정하지 않았다면 전체 업소 수이며, 목표 업종 경쟁점 수로 해석하면 안 됩니다.",
        verification: "verified" as const,
        verificationMethod: "official_api" as const,
        sourceExcerpt: result.sourceExcerpt,
        retrievedAt: result.retrievedAt,
        contentHash: result.contentHash,
        attestation: "",
        isDemo: false,
      };
      evidence = { ...unsigned, attestation: signMarketEvidence(unsigned) };
    }
    return NextResponse.json({ result, evidence });
  } catch (error) {
    const message = error instanceof Error ? error.message : "주변 상가를 조회하지 못했습니다.";
    return NextResponse.json(
      { error: { code: message === "PROJECT_NOT_FOUND" ? message : "NEARBY_LOOKUP_INVALID", message } },
      { status: message === "PROJECT_NOT_FOUND" ? 404 : 400 },
    );
  }
}
