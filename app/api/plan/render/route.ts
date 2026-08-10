import { NextResponse } from "next/server";
import { renderPlanMarkdown } from "../../../../lib/plan-builder/markdown";
import { enforceRateLimit } from "../../../../lib/rate-limit";

export const runtime = "nodejs";

// 사용자가 직접 수정한 마크다운을 HTML로 렌더 (섹션 편집 저장용)

export async function POST(req: Request) {
  // AI·렌더 비용이 드는 호출 — 화면 제어와 별개로 서버에서 빈도를 제한한다
  const limited = await enforceRateLimit("plan-render", req, { limit: 120, windowMs: 10 * 60_000, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." });
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as { markdown?: string };
  const markdown = (body.markdown ?? "").slice(0, 100_000);
  if (!markdown.trim()) {
    return NextResponse.json({ error: "empty markdown" }, { status: 400 });
  }
  let html = "";
  try {
    html = await renderPlanMarkdown(markdown);
  } catch {
    html = markdown.replace(/\n/g, "<br>");
  }
  return NextResponse.json({ html });
}
