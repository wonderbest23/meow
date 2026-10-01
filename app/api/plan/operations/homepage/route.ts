import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../../lib/rate-limit";
import { findProjectIdByPlan } from "../../../../../lib/project-repository";
import { countLandingLeadsBetween, landingSiteSummaryForProject } from "../../../../../lib/landing/repository";
import { kstPeriodRange, type HomepageInquiries } from "../../../../../lib/plan-builder/operating-homepage";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

/* 운영 기록 기간의 홈페이지 문의 수 — 이 사업(계획서)의 주인만 */
export async function GET(request: Request) {
  const limited = await enforceRateLimit("operating-homepage", request, { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const query = new URL(request.url).searchParams;
  const planId = z.string().min(1).max(60).safeParse(query.get("planId"));
  const range = kstPeriodRange(query.get("start") ?? "", query.get("end") ?? "");
  if (!planId.success || !range) return json({ message: "기간을 확인해 주세요." }, 400);
  try {
    const identity = await requireGuestIdentity();
    // 주인 해시로 찾으므로 남의 사업이면 프로젝트가 없다 — 계획서 전체·홈페이지 버전 본문은 읽지 않는다(운영에서 6~7초 걸렸다)
    const projectId = await findProjectIdByPlan(planId.data, identity.hash);
    const site = projectId ? await landingSiteSummaryForProject(projectId) : null;
    if (!site) return json({ linked: false } satisfies HomepageInquiries);
    const inquiries = await countLandingLeadsBetween(site.id, range.from, range.to);
    return json({ linked: true, published: site.published, inquiries } satisfies HomepageInquiries);
  } catch {
    return json({ message: "홈페이지 문의 수를 불러오지 못했어요." }, 503);
  }
}
