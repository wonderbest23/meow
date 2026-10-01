import { NextResponse } from "next/server";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { normalizePurchaseDomain } from "../../../../lib/landing/domain-purchase";
import { checkDomainAvailability } from "../../../../lib/landing/domain-availability";

export const runtime = "nodejs";

/* 도메인 구매 대행 전에 주소가 비어 있는지 — 등록소(RDAP) 답을 그대로 옮긴다 */
export async function GET(request: Request) {
  const limited = await enforceRateLimit("domain-check", request, { limit: 20, windowMs: 60_000, message: "조회가 너무 많아요. 잠시 후 다시 확인해 주세요." });
  if (limited) return limited;
  const domain = normalizePurchaseDomain(new URL(request.url).searchParams.get("domain") ?? "");
  if (!domain) return NextResponse.json({ error: { code: "DOMAIN_INVALID", message: "영문·숫자로 된 .com, .kr, .co.kr 주소만 대신 사 드릴 수 있어요. 예: mybrand.co.kr" } }, { status: 400 });
  const availability = await checkDomainAvailability(domain);
  return NextResponse.json({ domain, availability }, { headers: { "Cache-Control": "private, no-store" } });
}
