import { renderPdf, renderDocx, type BusinessDocument, type DocumentProjectMeta } from "../../../../lib/delivery/document-renderer";

export const runtime = "nodejs";

// 플랜 문서 내보내기 — 생성된 섹션들을 하나의 문서로 조립해 PDF/DOCX로 렌더.
// 기존 lib/delivery 렌더러(한글 폰트 서브셋 임베드)를 그대로 재사용.

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    format?: "pdf" | "docx";
    sections?: Array<{ chapterTitle?: string; sectionTitle?: string; markdown?: string }>;
  };

  const title = (body.title || "사업계획서").slice(0, 80);
  const format = body.format === "docx" ? "docx" : "pdf";
  const sections = Array.isArray(body.sections) ? body.sections.filter((s) => s?.markdown) : [];

  if (sections.length === 0) {
    return new Response(JSON.stringify({ error: "no sections" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  // 조립: 각 섹션을 h1(섹션명) + 본문으로.
  const assembled = sections
    .map((s) => `# ${s.sectionTitle || "섹션"}\n\n${(s.markdown || "").trim()}`)
    .join("\n\n");

  const document: BusinessDocument = {
    id: "plan",
    title,
    type: "사업계획서",
    versionLabel: "초안",
    markdown: assembled,
  };

  const project: DocumentProjectMeta = {
    title,
    sector: "사업계획",
    model: "오늘창업 플랜 빌더",
    customer: "-",
    generatedAt: new Date().toISOString(),
    sample: false,
  };

  const buffer = format === "docx" ? await renderDocx([document], project) : await renderPdf([document], project);
  const safe = title.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-").slice(0, 60);
  // 헤더는 Latin-1만 허용 → ASCII 폴백 + RFC 5987(UTF-8)로 한글 파일명 전달
  const ascii = safe.replace(/[^\x20-\x7E]/g, "") || "plan";
  const disposition = `attachment; filename="${ascii}.${format}"; filename*=UTF-8''${encodeURIComponent(safe)}.${format}`;

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf",
      "Content-Disposition": disposition,
      "Cache-Control": "no-store",
    },
  });
}
