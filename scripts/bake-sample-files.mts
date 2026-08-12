/*
 * 샘플 문서의 PDF·Word 파일을 미리 구워 public/samples 에 둔다.
 *
 * 샘플은 결제 대상이 아니라서 /api/plan/document 가 막는다(resolvePlanAccess 에
 * 샘플 예외가 없다). 그렇다고 서버 검사에 구멍을 내면 그 구멍으로 실제 문서도
 * 새어 나간다. 파일을 미리 만들어 두고 그냥 내려주면 검사에 손댈 일이 없다.
 *
 * 조립 방식(목차 → 챕터 → 섹션, 헤딩 두 단계 낮추기)은 app/api/plan/document 의
 * 라우트와 같아야 한다. 샘플 본문이 바뀌면 이 스크립트를 다시 돌린다.
 *   npx tsx scripts/bake-sample-files.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { renderPdf, renderDocx, type BusinessDocument, type DocumentProjectMeta } from "../lib/delivery/document-renderer";
import { chaptersForType } from "../lib/plan-builder/blueprint";
import { SAMPLE_DOCS } from "../lib/plan-builder/samples";

/** 라우트와 같은 규칙 — 챕터(##) > 섹션(###) > 본문 소제목(####~) */
function demoteHeadings(markdown: string): string {
  return markdown.replace(/^(#{1,4})\s+/gm, (_m, hashes: string) => `${"#".repeat(Math.min(hashes.length + 2, 6))} `);
}

const OUT = "public/samples";
mkdirSync(OUT, { recursive: true });

for (const doc of SAMPLE_DOCS) {
  const chapters = chaptersForType(doc.planType);
  const grouped = chapters
    .map((ch) => ({
      chapter: ch.title,
      items: ch.sections
        .map((sec) => ({ sectionTitle: sec.title, markdown: doc.sections?.[`${ch.id}/${sec.id}`]?.markdown ?? "" }))
        .filter((s) => s.markdown.trim()),
    }))
    .filter((g) => g.items.length);

  const sectionCount = grouped.reduce((sum, g) => sum + g.items.length, 0);
  if (!sectionCount) {
    console.log(`건너뜀 ${doc.id} — 본문이 없다`);
    continue;
  }

  const title = doc.title.replace(/^샘플\s*·\s*/, "").trim() || doc.title;

  const tocLines: string[] = ["## 목차", ""];
  grouped.forEach(({ chapter, items }, ci) => {
    tocLines.push(`**${ci + 1}. ${chapter}**`, "");
    items.forEach((s, si) => tocLines.push(`- ${ci + 1}.${si + 1} ${s.sectionTitle}`));
    tocLines.push("");
  });

  const bodyLines: string[] = [];
  grouped.forEach(({ chapter, items }, ci) => {
    bodyLines.push(`## ${ci + 1}. ${chapter}`, "");
    items.forEach((s, si) => {
      bodyLines.push(`### ${ci + 1}.${si + 1} ${s.sectionTitle}`, "");
      bodyLines.push(demoteHeadings(s.markdown.trim()), "");
    });
  });

  const document: BusinessDocument = {
    id: "plan",
    title,
    type: doc.planType,
    versionLabel: "초안",
    markdown: [`# ${title}`, "", ...tocLines, ...bodyLines].join("\n"),
  };

  const project: DocumentProjectMeta = {
    title,
    sector: doc.industry || "사업계획",
    model: doc.planType,
    customer: "-",
    /* 고정값 — 돌릴 때마다 파일이 달라지면 무엇이 바뀐 건지 알 수 없다 */
    generatedAt: "2026-08-12T00:00:00.000Z",
    sample: true,
    coverFields: [
      { label: "사업명", value: title },
      ...(doc.industry ? [{ label: "업종", value: doc.industry }] : []),
      { label: "구성", value: `${grouped.length}개 챕터 · ${sectionCount}개 섹션` },
    ],
  };

  const pdf = await renderPdf([document], project);
  const docx = await renderDocx([document], project);
  writeFileSync(`${OUT}/${doc.id}.pdf`, pdf);
  writeFileSync(`${OUT}/${doc.id}.docx`, docx);
  console.log(`${doc.id} — pdf ${Math.round(pdf.length / 1024)}KB · docx ${Math.round(docx.length / 1024)}KB · ${sectionCount}섹션`);
}
