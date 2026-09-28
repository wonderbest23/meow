import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { resolveLLMConfig } from "../../../../lib/llm/config";
import { proposeIdeas } from "../../../../lib/discovery/idea-proposer";
import type { FounderProfile } from "../../../../lib/assessment";
import type { ManualPreferences } from "../../../../lib/idea-generator";
import { enforceRateLimit } from "../../../../lib/rate-limit";

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
  // 로그인 없이 AI를 부르는 경로: 쿠키를 지워도 우회되지 않게 IP 기준으로 횟수를 제한한다.
  const limited = await enforceRateLimit("opportunity-discover", request, { limit: 8, windowMs: 10 * 60_000, message: "사업 후보 찾기 요청이 너무 잦습니다. 10분 뒤 다시 시도해주세요." });
  if (limited) return limited;
  try {
    const identity = await requireGuestIdentity();
    const { profile, preferences } = bodySchema.parse(await request.json());
    const pool = await proposeIdeas(
      profile as unknown as FounderProfile,
      preferences as ManualPreferences | undefined,
      resolveLLMConfig(identity.hash),
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
