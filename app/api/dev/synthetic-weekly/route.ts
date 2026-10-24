// 합성 미리보기 전용(lib/synthetic-preview.ts) — Cloudflare 예약 작업(cron) 대신 주간 리포트 발송기를 한 번 돌린다. 운영에서는 404.
import { runWeeklyReportsNow } from "../../../../lib/landing/weekly-report-runner";
import { syntheticPreviewEnabled, syntheticPreviewNotFound } from "../../../../lib/synthetic-preview";

export async function POST() {
  if (!syntheticPreviewEnabled()) return syntheticPreviewNotFound();
  try { return Response.json({ result: await runWeeklyReportsNow(20) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
