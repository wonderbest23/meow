import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedIdentity } from "../../../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../../../lib/rate-limit";
import { getProject } from "../../../../../../lib/project-repository";
import { getLandingAlertPhone, getWeeklyReportEnabled, landingSiteSummaryForProject, setLandingAlertPhone, setWeeklyReportEnabled } from "../../../../../../lib/landing/repository";
import { landingEmailConfiguration } from "../../../../../../lib/landing/lead-email";
import { customerSmsConfig, normalizeAlertPhone } from "../../../../../../lib/notify/customer-sms";

const headers = { "Cache-Control": "private, no-store" };

/*
 * 사장님 알림 설정 — 문자 받을 휴대폰과 주간 리포트 받기. 홈페이지 주인만.
 * phone 이 undefined 면 아직 준비 전(마이그레이션 0039), weeklyEnabled 가 null 이면 0038 전.
 */
async function siteFor(projectId: string) {
  const identity = await requireAuthenticatedIdentity();
  if (!(await getProject(projectId, identity.hash))) return null;
  return landingSiteSummaryForProject(projectId);
}
async function state(site: { id: string; published: boolean }) {
  const [phone, weeklyEnabled] = await Promise.all([getLandingAlertPhone(site.id), getWeeklyReportEnabled(site.id)]);
  return { phone: phone === undefined ? null : phone, phoneReady: phone !== undefined, weeklyEnabled, published: site.published, smsReady: customerSmsConfig() !== null, emailReady: landingEmailConfiguration() !== null };
}
function failure(error: unknown) {
  const login = error instanceof Error && error.message === "ACCOUNT_LOGIN_REQUIRED";
  return NextResponse.json({ error: { code: login ? "ACCOUNT_LOGIN_REQUIRED" : "ALERT_SETTINGS_UNAVAILABLE", message: login ? "로그인 후 이용해주세요." : "알림 설정을 불러오지 못했습니다." } }, { status: login ? 401 : 503, headers });
}
const notFound = () => NextResponse.json({ error: { code: "LANDING_NOT_FOUND", message: "홈페이지를 찾을 수 없습니다." } }, { status: 404, headers });

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const site = await siteFor((await context.params).projectId);
    return site ? NextResponse.json(await state(site), { headers }) : notFound();
  } catch (error) { return failure(error); }
}

const bodySchema = z.object({
  // 빈 글이면 번호를 지운다. 번호를 넣을 때는 문자 수신 동의가 함께 와야 한다
  phone: z.string().max(20).optional(),
  agreed: z.boolean().optional(),
  weeklyEnabled: z.boolean().optional(),
}).strict();

export async function PUT(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const limited = await enforceRateLimit("landing-alert-settings", request, { limit: 20, windowMs: 10 * 60_000, message: "잠시 후 다시 시도해주세요." });
  if (limited) return limited;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "요청을 확인해 주세요." } }, { status: 400, headers });
  const { phone, agreed, weeklyEnabled } = parsed.data;
  const normalized = phone === undefined || phone.trim() === "" ? null : normalizeAlertPhone(phone);
  if (phone !== undefined && phone.trim() !== "" && !normalized) return NextResponse.json({ error: { code: "PHONE_INVALID", message: "010으로 시작하는 휴대폰 번호를 넣어 주세요." } }, { status: 400, headers });
  if (normalized && agreed !== true) return NextResponse.json({ error: { code: "CONSENT_REQUIRED", message: "문자 알림 수신에 동의해 주세요." } }, { status: 400, headers });
  try {
    const site = await siteFor((await context.params).projectId);
    if (!site) return notFound();
    if (phone !== undefined && !(await setLandingAlertPhone(site.id, normalized))) return failure(new Error("ALERT_PHONE_SAVE_FAILED"));
    if (weeklyEnabled !== undefined && !(await setWeeklyReportEnabled(site.id, weeklyEnabled))) return failure(new Error("WEEKLY_SAVE_FAILED"));
    return NextResponse.json(await state(site), { headers });
  } catch (error) { return failure(error); }
}
