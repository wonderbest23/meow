import { renderPdf, renderDocx, type BusinessDocument, type DocumentProjectMeta } from "../../../../lib/delivery/document-renderer";

export const runtime = "nodejs";

// 플랜 문서 내보내기 — 생성된 섹션들을 표지·목차와 함께 하나의 문서로 조립해 PDF/DOCX로 렌더.
// 기존 lib/delivery 렌더러(한글 폰트 서브셋 임베드)를 그대로 재사용.

type SectionInput = { chapterTitle?: string; sectionTitle?: string; markdown?: string };

/**
 * 섹션 본문의 헤딩을 두 단계 낮춘다.
 * 문서 구조를 챕터(##) > 섹션(###) > 본문 소제목(####~)으로 맞추기 위함.
 */
function demoteHeadings(markdown: string): string {
  return markdown.replace(/^(#{1,4})\s+/gm, (_m, hashes: string) => `${"#".repeat(Math.min(hashes.length + 2, 6))} `);
}

/** 챕터 순서를 유지하며 그룹화 */
function groupByChapter(sections: SectionInput[]) {
  const order: string[] = [];
  const map = new Map<string, SectionInput[]>();
  for (const s of sections) {
    const chapter = s.chapterTitle || "본문";
    if (!map.has(chapter)) {
      map.set(chapter, []);
      order.push(chapter);
    }
    map.get(chapter)!.push(s);
  }
  return order.map((chapter) => ({ chapter, items: map.get(chapter)! }));
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    format?: "pdf" | "docx";
    sections?: SectionInput[];
    planType?: string;
    business?: { name?: string; description?: string; industry?: string; region?: string; stage?: string };
  };

  const title = (body.title || "사업계획서").slice(0, 80);
  const format = body.format === "docx" ? "docx" : "pdf";
  const sections = Array.isArray(body.sections) ? body.sections.filter((s) => s?.markdown) : [];

  if (sections.length === 0) {
    return new Response(JSON.stringify({ error: "no sections" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const grouped = groupByChapter(sections);

  // ── 목차 ──
  const tocLines: string[] = ["## 목차", ""];
  grouped.forEach(({ chapter, items }, ci) => {
    tocLines.push(`**${ci + 1}. ${chapter}**`, "");
    items.forEach((s, si) => {
      tocLines.push(`- ${ci + 1}.${si + 1} ${s.sectionTitle || "섹션"}`);
    });
    tocLines.push("");
  });

  // ── 본문: 챕터(##) > 섹션(###) > 내용(####~) ──
  const bodyLines: string[] = [];
  grouped.forEach(({ chapter, items }, ci) => {
    bodyLines.push(`## ${ci + 1}. ${chapter}`, "");
    items.forEach((s, si) => {
      bodyLines.push(`### ${ci + 1}.${si + 1} ${s.sectionTitle || "섹션"}`, "");
      bodyLines.push(demoteHeadings((s.markdown || "").trim()), "");
    });
  });

  // 첫 h1은 PDF 렌더러가 표지 중복으로 건너뛰므로 문서 제목을 배치한다(DOCX에서는 제목으로 표시).
  const assembled = [`# ${title}`, "", ...tocLines, ...bodyLines].join("\n");

  const document: BusinessDocument = {
    id: "plan",
    title,
    type: body.planType || "사업계획서",
    versionLabel: "초안",
    markdown: assembled,
  };

  const biz = body.business ?? {};
  const coverFields = [
    { label: "사업명", value: biz.name || title },
    biz.industry ? { label: "업종", value: biz.industry } : null,
    biz.region ? { label: "지역", value: biz.region } : null,
    biz.stage ? { label: "진행 단계", value: biz.stage } : null,
    { label: "구성", value: `${grouped.length}개 챕터 · ${sections.length}개 섹션` },
  ].filter((f): f is { label: string; value: string } => f !== null);

  const project: DocumentProjectMeta = {
    title: biz.name || title,
    sector: biz.industry || "사업계획",
    model: body.planType || "오늘창업 플랜 빌더",
    customer: biz.description || "-",
    generatedAt: new Date().toISOString(),
    sample: false,
    coverFields,
  };

  /*
   * 폰트는 정적 자산에서 HTTP로 가져와 넘긴다.
   * 렌더러의 기본 경로는 readFileSync인데 Cloudflare Workers에는 파일시스템이
   * 없어서, 이 인자를 빼먹으면 로컬에서는 되고 운영에서만 500이 난다.
   * (기존 delivery 라우트와 같은 방식)
   */
  const fontResponse = await fetch(new URL("/fonts/NanumGothic-Regular.ttf", req.url));
  if (!fontResponse.ok) {
    return new Response(JSON.stringify({ error: "font unavailable" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  const fontData = new Uint8Array(await fontResponse.arrayBuffer());
  const buffer = format === "docx"
    ? await renderDocx([document], project, fontData)
    : await renderPdf([document], project, fontData);
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
