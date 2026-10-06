import { NextResponse } from "next/server";
import { requireAuthenticatedIdentity } from "../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { ownedPlan } from "../../../../lib/services/request-store";
import { checkBusiness, normalizeBusinessNumber, publicDataConfigured } from "../../../../lib/public-data/business-check";
import { loadBusinessCheck, saveBusinessCheck } from "../../../../lib/public-data/business-check-store";

export const runtime = "nodejs";

/*
 * 내 사업자 확인 — 사업자등록번호를 넣으면 국세청(등록·휴폐업)과 공정위(통신판매업 신고)를 함께 조회한다.
 * '다음 단계'에서 등록·신고가 이미 끝난 일은 '완료'로 보이게 하려는 것. 신청 자체는 API 가 없어 사장님이 직접 한다.
 * GET ?planId= 마지막 결과 / POST {planId, businessNumber} 지금 조회. 로그인 + 내 사업만.
 */

const headers = { "Cache-Control": "private, no-store, max-age=0" };
const fail = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status, headers });

function failure(error: unknown) {
  if (error instanceof Error && error.message === "ACCOUNT_LOGIN_REQUIRED") return fail(401, "ACCOUNT_LOGIN_REQUIRED", "로그인 후 확인할 수 있어요.");
  console.error("[plan/business-check] failed", error);
  return fail(500, "BUSINESS_CHECK_FAILED", "확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
}

export async function GET(request: Request) {
  const planId = new URL(request.url).searchParams.get("planId")?.trim();
  if (!planId) return fail(400, "INVALID_REQUEST", "사업을 골라 주세요.");
  try {
    const identity = await requireAuthenticatedIdentity();
    if (!(await ownedPlan(identity.hash, planId))) return fail(404, "PLAN_NOT_FOUND", "사업을 찾을 수 없어요.");
    return NextResponse.json({ check: await loadBusinessCheck(identity.userId, planId), available: publicDataConfigured() }, { headers });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit("plan-business-check", request, { limit: 20, windowMs: 60 * 60_000, message: "확인을 너무 많이 했어요. 잠시 후 다시 해 주세요." });
  if (limited) return limited;
  const body = await request.json().catch(() => null) as { planId?: unknown; businessNumber?: unknown } | null;
  const planId = typeof body?.planId === "string" ? body.planId.trim() : "";
  const businessNumber = normalizeBusinessNumber(body?.businessNumber);
  if (!planId) return fail(400, "INVALID_REQUEST", "사업을 골라 주세요.");
  if (!businessNumber) return fail(400, "INVALID_BUSINESS_NUMBER", "사업자등록번호 10자리를 확인해 주세요.");
  if (!publicDataConfigured()) return fail(503, "PUBLIC_DATA_UNAVAILABLE", "지금은 자동 확인을 할 수 없어요. 잠시 후 다시 해 주세요.");
  try {
    const identity = await requireAuthenticatedIdentity();
    if (!(await ownedPlan(identity.hash, planId))) return fail(404, "PLAN_NOT_FOUND", "사업을 찾을 수 없어요.");
    const check = await checkBusiness(businessNumber);
    if (!check.business && !check.mailOrder) return fail(502, "PUBLIC_DATA_FAILED", "국세청·공정위 확인이 잠시 안 돼요. 조금 뒤 다시 해 주세요.");
    await saveBusinessCheck(identity.userId, planId, check);
    return NextResponse.json({ check }, { headers });
  } catch (error) { return failure(error); }
}
