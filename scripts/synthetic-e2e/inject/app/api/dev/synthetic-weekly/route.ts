// 안전 미리보기 복사본 전용 — Cloudflare 예약 작업(cron) 대신 주간 리포트 발송기를 한 번 돌린다
import { runWeeklyReportsNow } from "../../../../lib/landing/weekly-report-runner";
export async function POST() {
  if (process.env.SYNTHETIC_AUTH !== "1" || process.env.PERSISTENCE_MODE !== "demo-memory") return new Response(null, { status: 404 });
  try { return Response.json({ result: await runWeeklyReportsNow(20) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
