import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { getOpenAIRuntimeConfig } from "../../../../lib/openai/session-config";
import { proposeIdeas } from "../../../../lib/discovery/idea-proposer";
import type { FounderProfile } from "../../../../lib/assessment";
import type { ManualPreferences } from "../../../../lib/idea-generator";

const preferencesSchema = z.object({
  budget: z.enum(["제한 없음", "100만원 이하", "100~1,000만원", "1,000만원 이상"]),
  time: z.enum(["제한 없음", "주말·저녁", "부업", "전업"]),
  channel: z.enum(["제한 없음", "온라인", "오프라인", "혼합"]),
  customer: z.enum(["제한 없음", "개인", "기업", "공공·지역"]),
});

const profileSchema = z
  .object({
    riasec: z.record(z.string(), z.number()),
    founder: z.record(z.string(), z.number()),
    topRiasec: z.array(z.enum(["R", "I", "A", "S", "E", "C"])).default([]),
    topFounder: z
      .array(z.enum(["opportunity", "customer", "creation", "execution", "uncertainty", "scale"]))
      .default([]),
    confidence: z.number().default(0),
    answered: z.number().default(0),
  })
  .passthrough();

const bodySchema = z.object({
  profile: profileSchema,
  preferences: preferencesSchema.optional(),
});

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export async function POST(request: Request) {
  try {
    const identity = await requireGuestIdentity();
    const { profile, preferences } = bodySchema.parse(await request.json());
    const pool = await proposeIdeas(
      profile as unknown as FounderProfile,
      preferences as ManualPreferences | undefined,
      getOpenAIRuntimeConfig(identity.hash),
    );
    return privateJson({ pool, source: pool.length > 0 ? "ai" : "library" });
  } catch (error) {
    // 실패해도 클라이언트는 라이브러리 풀로 폴백하므로 조용히 빈 풀을 반환한다.
    return privateJson(
      {
        pool: [],
        source: "library",
        error: {
          code: "DISCOVER_FAILED",
          message: error instanceof Error ? error.message : "추천 아이디어를 생성하지 못했습니다.",
        },
      },
      { status: 200 },
    );
  }
}
