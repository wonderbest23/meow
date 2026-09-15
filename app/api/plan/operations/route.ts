import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { OperatingError, operatingCommandSchema, reportMarkdown } from "../../../../lib/plan-builder/operating-records";
import { loadOperatingRecords, saveOperatingRecords } from "../../../../lib/plan-builder/operating-records-service";
import { analysisRuntime } from "../../../../lib/plan-builder/operating-analysis-service";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
function failure(error: unknown) {
  if (error instanceof OperatingError) return json({ message: error.message, code: error.code }, error.status);
  if (error instanceof Error && error.message === "PLAN_OWNER_CHANGED") return json({ message: "로그인 상태가 바뀌었어요. 새로고침한 뒤 다시 저장해 주세요." }, 409);
  return json({ message: "운영 기록을 처리하지 못했어요. 입력 내용은 유지되니 연결을 확인한 뒤 다시 시도해 주세요." }, 503);
}
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const id = z.string().min(1).max(60).safeParse(query.get("planId"));
    if (!id.success) return json({ message: "사업을 선택해 주세요." }, 400);
    const identity = await requireGuestIdentity();
    const data = await loadOperatingRecords(identity.hash, id.data);
    const reportId = query.get("reportId");
    if (!reportId) return json({ ...data, analysisTarget: analysisRuntime(identity.hash)?.target ?? null });
    const report = data.records.reports.find(r => r.id === reportId);
    if (!report) return json({ message: "리포트를 찾을 수 없어요." }, 404);
    return new Response(reportMarkdown(report), { headers: { ...headers, "Content-Type": "text/markdown; charset=utf-8", "X-Content-Type-Options": "nosniff", "Content-Disposition": `attachment; filename="operating-report-${report.period.start}-${report.id.slice(0, 8)}.md"` } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const limited = await enforceRateLimit("operating-records", request, { limit: 60, windowMs: 60000 });
  if (limited) return limited;
  const parsed = z.object({ planId: z.string().min(1).max(60), command: operatingCommandSchema }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: parsed.error.issues[0]?.message ?? "입력 내용을 확인해 주세요." }, 400);
  try {
    const identity = await requireGuestIdentity();
    return json(await saveOperatingRecords(identity.hash, parsed.data.planId, parsed.data.command));
  } catch (error) { return failure(error); }
}
