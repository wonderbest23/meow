import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../../lib/rate-limit";
import { findProjectIdByPlan } from "../../../../../lib/project-repository";
import { countLandingLeadsBetween, getLandingForProject } from "../../../../../lib/landing/repository";
import { loadOperatingRecords } from "../../../../../lib/plan-builder/operating-records-service";
import { OperatingError } from "../../../../../lib/plan-builder/operating-records";
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
    await loadOperatingRecords(identity.hash, planId.data); // 내 사업인지 확인
    const projectId = await findProjectIdByPlan(planId.data, identity.hash);
    const site = projectId ? await getLandingForProject(projectId, identity.hash) : null;
    if (!site) return json({ linked: false } satisfies HomepageInquiries);
    const inquiries = await countLandingLeadsBetween(site.id, range.from, range.to);
    return json({ linked: true, published: site.publishedVersion !== null, inquiries } satisfies HomepageInquiries);
  } catch (error) {
    if (error instanceof OperatingError) return json({ message: error.message }, error.status);
    return json({ message: "홈페이지 문의 수를 불러오지 못했어요." }, 503);
  }
}
