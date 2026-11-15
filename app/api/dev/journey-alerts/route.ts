// 합성 미리보기 전용 — 진행 단계 안내를 실제로 보내지 않고 한 번 돌려, 보낼 문구와 가린 번호만 돌려준다. 운영에서는 404.
//   POST /api/dev/journey-alerts?at=2026-11-16T10:00:00+09:00   (at 을 주면 그 시각인 것처럼 — 밤 시간 미루기 확인용)
import { runJourneyAlerts } from "../../../../lib/notify/journey-alerts";
import { syntheticPreviewEnabled, syntheticPreviewNotFound } from "../../../../lib/synthetic-preview";

export async function POST(request: Request) {
  if (!syntheticPreviewEnabled()) return syntheticPreviewNotFound();
  const at = new URL(request.url).searchParams.get("at");
  const now = at ? Date.parse(at) : Date.now();
  if (!Number.isFinite(now)) return Response.json({ error: "INVALID_TIME" }, { status: 400 });
  return Response.json(await runJourneyAlerts({ now, sms: null, dryRun: true }));
}
