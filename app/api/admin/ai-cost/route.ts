import { getServerSupabase } from "../../../../lib/persistence";
import { hasAdminSession } from "../../../../lib/support-chat/admin-auth";
import { summarizeUsage, type UsageRow } from "../../../../lib/llm/cost";

/*
 * AI 비용 — llm_usage 기록을 모델 요금으로 계산한다(lib/llm/cost.ts).
 *   ?range=today|7d|30d|90d  (기본 7d, 한국 시간 기준)  또는 ?from=ISO&to=ISO
 *   ?planId=…  한 사업(계획서)만
 * 실제 청구액은 제공업체 콘솔이 기준이다 — 이 화면은 기록된 토큰으로 계산한 값.
 */
export const dynamic = "force-dynamic";

const PAGE = 1000;
const MAX_ROWS = 50_000;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

function rangeStart(range: string): string | null {
  const now = Date.now();
  if (range === "today") {
    // 한국 시간 오늘 0시
    const kst = new Date(now + 9 * 60 * 60_000);
    kst.setUTCHours(0, 0, 0, 0);
    return new Date(kst.getTime() - 9 * 60 * 60_000).toISOString();
  }
  const days = { "7d": 7, "30d": 30, "90d": 90 }[range];
  return days ? new Date(now - days * 24 * 60 * 60_000).toISOString() : null;
}

export async function GET(request: Request) {
  if (!(await hasAdminSession("support"))) return json({ error: { code: "ADMIN_AUTH_REQUIRED", message: "관리자 로그인이 필요합니다." } }, 401);
  const db = getServerSupabase();
  if (!db) return json({ message: "DB가 연결되어 있지 않습니다." }, 503);
  const url = new URL(request.url);
  const range = url.searchParams.get("range") ?? "7d";
  const fromParam = url.searchParams.get("from"), toParam = url.searchParams.get("to");
  const from = fromParam && Number.isFinite(Date.parse(fromParam)) ? new Date(fromParam).toISOString() : rangeStart(range);
  const to = toParam && Number.isFinite(Date.parse(toParam)) ? new Date(toParam).toISOString() : null;
  const planId = url.searchParams.get("planId")?.trim().slice(0, 80) || null;

  // 마이그레이션이 덜 된 DB(캐시·plan_id 칸 없음)에서도 읽히게 — 칸을 줄여 다시 시도한다
  const selections = [
    "kind,model,ok,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,plan_id,created_at",
    "kind,model,ok,input_tokens,output_tokens,plan_id,created_at",
    "kind,model,ok,input_tokens,output_tokens,created_at",
  ];
  let rows: UsageRow[] = [];
  let truncated = false;
  for (const columns of selections) {
    rows = [];
    let failed = false;
    for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
      let query = db.from("llm_usage").select(columns).order("created_at", { ascending: false }).range(offset, offset + PAGE - 1);
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lt("created_at", to);
      if (planId && columns.includes("plan_id")) query = query.eq("plan_id", planId);
      const { data, error } = await query;
      if (error) { failed = true; break; }
      rows.push(...((data ?? []) as unknown as UsageRow[]));
      if (!data || data.length < PAGE) break;
      if (offset + PAGE >= MAX_ROWS) truncated = true;
    }
    if (!failed) {
      if (planId && !columns.includes("plan_id")) rows = [];
      return json({ summary: summarizeUsage(rows), rows: rows.length, truncated, from, to, planId, checkedAt: new Date().toISOString(), cacheColumns: columns.includes("cache_read_tokens") });
    }
  }
  return json({ message: "AI 사용 기록을 읽지 못했습니다. llm_usage 마이그레이션(0020·0023·0029·0037)을 확인해 주세요." }, 503);
}
