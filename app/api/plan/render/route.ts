import { NextResponse } from "next/server";
import { marked } from "marked";

export const runtime = "nodejs";

// 사용자가 직접 수정한 마크다운을 HTML로 렌더 (섹션 편집 저장용)

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { markdown?: string };
  const markdown = (body.markdown ?? "").slice(0, 100_000);
  if (!markdown.trim()) {
    return NextResponse.json({ error: "empty markdown" }, { status: 400 });
  }
  let html = "";
  try {
    html = await marked.parse(markdown, { async: true });
  } catch {
    html = markdown.replace(/\n/g, "<br>");
  }
  return NextResponse.json({ html });
}
