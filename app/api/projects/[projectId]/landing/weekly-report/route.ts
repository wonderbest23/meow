import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedIdentity } from "../../../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../../../lib/rate-limit";
import { getProject } from "../../../../../../lib/project-repository";
import { getWeeklyReportEnabled, landingSiteSummaryForProject, setWeeklyReportEnabled } from "../../../../../../lib/landing/repository";
import { landingEmailConfiguration } from "../../../../../../lib/landing/lead-email";

const headers = { "Cache-Control": "private, no-store" };

/* 주간 리포트 받기 켜기·끄기 — 홈페이지 주인만. enabled 가 null 이면 아직 준비 전(마이그레이션 0038) */
async function siteFor(projectId: string) {
  const identity = await requireAuthenticatedIdentity();
  if (!(await getProject(projectId, identity.hash))) return null;
  return landingSiteSummaryForProject(projectId);
}
function failure(error: unknown) {
  const login = error instanceof Error && error.message === "ACCOUNT_LOGIN_REQUIRED";
  return NextResponse.json({ error: { code: login ? "ACCOUNT_LOGIN_REQUIRED" : "WEEKLY_REPORT_UNAVAILABLE", message: login ? "로그인 후 이용해주세요." : "주간 리포트 설정을 불러오지 못했습니다." } }, { status: login ? 401 : 503, headers });
}

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const site = await siteFor((await context.params).projectId);
    if (!site) return NextResponse.json({ error: { code: "LANDING_NOT_FOUND", message: "홈페이지를 찾을 수 없습니다." } }, { status: 404, headers });
    return NextResponse.json({ enabled: await getWeeklyReportEnabled(site.id), published: site.published, emailReady: landingEmailConfiguration() !== null }, { headers });
  } catch (error) { return failure(error); }
}

export async function PUT(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const limited = await enforceRateLimit("weekly-report-setting", request, { limit: 20, windowMs: 10 * 60_000, message: "잠시 후 다시 시도해주세요." });
  if (limited) return limited;
  const parsed = z.object({ enabled: z.boolean() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "요청을 확인해 주세요." } }, { status: 400, headers });
  try {
    const site = await siteFor((await context.params).projectId);
    if (!site) return NextResponse.json({ error: { code: "LANDING_NOT_FOUND", message: "홈페이지를 찾을 수 없습니다." } }, { status: 404, headers });
    if (!(await setWeeklyReportEnabled(site.id, parsed.data.enabled))) return failure(new Error("WEEKLY_REPORT_UNAVAILABLE"));
    return NextResponse.json({ enabled: parsed.data.enabled, published: site.published, emailReady: landingEmailConfiguration() !== null }, { headers });
  } catch (error) { return failure(error); }
}
