import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminSession } from "../../../../lib/support-chat/admin-auth";
import { getServerSupabase } from "../../../../lib/persistence";
import { adminJobSchema } from "../../../../lib/llm/admin-jobs";

export const runtime = "nodejs";
const query = z.object({ offset: z.coerce.number().int().min(0).max(10000).default(0), status: z.enum(["all", "failed", "running", "complete"]).default("all") });
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
export async function GET(request: Request) {
  if (!await hasAdminSession("support")) return json({ message: "관리자 로그인이 필요합니다" }, 401);
  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return json({ message: "조회 범위를 확인해 주세요" }, 400);
  try {
    const db = getServerSupabase();
    if (!db) return json({ message: "영구 DB가 연결되지 않았습니다" }, 503);
    const { offset, status } = parsed.data;
    const result = await db.rpc("admin_generation_jobs", { p_offset: offset, p_limit: 21, p_status: status });
    if (result.error) throw new Error("jobs_unavailable");
    const jobs = z.array(adminJobSchema).parse(result.data);
    const usage = await db.from("llm_usage").select("id,kind,provider,ok,model,elapsed_ms,failure_code,input_tokens,output_tokens,created_at").order("created_at", { ascending: false }).limit(25);
    return json({ jobs: jobs.slice(0, 20), nextOffset: jobs.length > 20 ? offset + 20 : null, usage: usage.error ? null : usage.data, checkedAt: new Date().toISOString() });
  } catch { return json({ message: "생성 작업을 조회하지 못했습니다. DB 연결과 운영 관측 마이그레이션 0029를 확인해 주세요" }, 503); }
}
