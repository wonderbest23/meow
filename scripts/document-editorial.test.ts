import assert from "node:assert/strict";
import { checkDocumentQuality } from "../lib/plan-builder/document-quality";
import { PLAN_BLUEPRINT } from "../lib/plan-builder/blueprint";
import { generateSection, streamSection, buildUserPrompt, validateSectionDraft, type SectionGenInput } from "../lib/plan-builder/section-generator";
import { documentOperatingContext } from "../lib/plan-builder/document-editorial";
import { executiveFixture } from "./executive-summary-fixture";
import { planTypeGuidanceBlock } from "../lib/plan-builder/plan-type-guidance";
import { withoutRepeatedSectionHeading } from "../lib/delivery/document-section";

const body = "## 거래 범위를 먼저 합의합니다\n\n제품 소개서를 납품할 때 원본 파일의 범위와 수정 조건을 정합니다. 제공된 고객 요구를 근거로 거래처와 납품 범위를 확인하고 이후 작업 일정을 조정합니다.";
const chapter = PLAN_BLUEPRINT[0], section = chapter.sections[0];
const input: SectionGenInput = { chapter, section, answers: { price: "180만원" }, business: { name: "온결 스튜디오", description: "지역 제조사 제품 소개서 제작", industry: "b2b_service" } };

async function main() {
  assert.equal(withoutRepeatedSectionHeading("## 상품·서비스\n\n본문", "상품·서비스"), "본문");
  assert.equal(withoutRepeatedSectionHeading("상품·서비스\n---\n\n본문", "상품·서비스"), "본문");
  assert.equal(withoutRepeatedSectionHeading("## 제품 원본을 함께 제공합니다\n\n본문", "상품·서비스"), "## 제품 원본을 함께 제공합니다\n\n본문");
  assert.equal(withoutRepeatedSectionHeading("```md\n## 상품·서비스\n```", "상품·서비스"), "```md\n## 상품·서비스\n```");
  assert.ok(checkDocumentQuality(body, "").ok);
  assert.equal(checkDocumentQuality("## 제목만 있음", "").ok, false);
  assert.ok(checkDocumentQuality(`${body}\n\n### 비어 있는 항목`, "").issues.some(i => i.code === "empty_heading"));
  assert.ok(checkDocumentQuality(`## 사업 개요\n\n#${body}`, "").ok, "parent headings can contain child sections with content");
  assert.ok(checkDocumentQuality(`사업 개요\n========\n\n${body}`, "").ok, "setext parent headings use the same hierarchy");
  assert.ok(checkDocumentQuality(`## 비어 있는 항목\n\n${body}`, "").issues.some(i => i.code === "empty_heading"), "a sibling section cannot fill an empty heading");
  assert.ok(checkDocumentQuality(`## 부모\n\n### 빈 자식\n\n#${body}`, "").issues.some(i => i.code === "empty_heading"), "a populated parent cannot hide an empty child");
  assert.ok(checkDocumentQuality(`${body}\n\n\`\`\`text\n## 코드 안의 제목\n\`\`\``, "").ok, "headings inside fenced code are not document sections");
  assert.ok(checkDocumentQuality(`${body}\n\n비어 있는 항목\n----------------\n`, "").issues.some(i => i.code === "empty_heading"), "empty setext sections are rejected");
  assert.ok(checkDocumentQuality(`${body}\n\n${body.split("\n\n")[1]}`, "").issues.some(i => i.code === "duplicate_paragraph"));
  assert.ok(checkDocumentQuality(body, "", [body]).issues.some(i => i.code === "duplicate_paragraph"));
  assert.ok(checkDocumentQuality(`${body}\n\n| 상품 | 가격 |\n| --- | --- |\n| 소개서 | |`, "").issues.some(i => i.code === "empty_table_cell"));
  assert.ok(checkDocumentQuality(`${body}\n\n판매가는 1,800,000원입니다.`, "가격 180만원").ok, "equivalent money units accepted");
  assert.ok(checkDocumentQuality(`${body}\n\n필요 자금은 150,000,000원입니다.`, "필요 자금 1억5천만원").ok);
  assert.equal(checkDocumentQuality(`${body}\n\n필요 자금은 5천만원입니다.`, "필요 자금 1억5천만원").ok, false);
  assert.equal(checkDocumentQuality(`${body}\n\n판매가는 2,800,000원입니다.`, "가격 180만원").ok, false);
  assert.equal(checkDocumentQuality(`${body}\n\n이익률은 35%입니다.`, "매출 목표 180만원").ok, false);
  assert.equal(checkDocumentQuality(`${body}\n\n비율은 10.4%입니다.`, "비율 10.1%").ok, false, "decimal percentages must not round to the same integer");
  assert.ok(checkDocumentQuality(`${body}\n\n비율은 10.10퍼센트입니다.`, "비율 10.1%").ok);
  assert.equal(checkDocumentQuality(`${body}\n\n비율은 -10.1%입니다.`, "비율 10.1%").ok, false);
  assert.equal(checkDocumentQuality(`${body}\n\n건당 단가는 1.4원입니다.`, "건당 단가 1.1원").ok, false);
  assert.ok(checkDocumentQuality(`${body}\n\n월 고정비는 0원으로 입력했습니다.`, "월 고정비 0원").ok);
  assert.equal(checkDocumentQuality(`${body}\n\n공식 확인 [원문](https://invented.invalid)`, "").ok, false);
  assert.equal(validateSectionDraft(`${body}\n\n매출은 800만원입니다.`, input), false);
  const operatingContext = documentOperatingContext(executiveFixture("operating").answers);
  assert.ok(buildUserPrompt({ ...input, operatingContext }).includes("지출: 현재 미입력"));
  assert.ok(buildUserPrompt({ ...input, operatingContext }).includes("기간 길이가 달라"));
  for (const purpose of ["사업소개서", "고객 제안서", "사업 운영·개선 계획서", "투자 검토 계획서", "정부지원 · PSST 사업계획서"]) assert.ok(planTypeGuidanceBlock(purpose).includes("읽는 사람:"));

  const originalFetch = globalThis.fetch;
  let responseText = `${body}\n\n납품 가격은 280만원입니다.`;
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(String(url)).hostname, "api.anthropic.com", "only intercepted fixture traffic is allowed");
    const payload = JSON.parse(String(init?.body));
    if (payload.stream) {
      const event = `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: responseText } })}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n`;
      return new Response(event, { headers: { "Content-Type": "text/event-stream" } });
    }
    return Response.json({ content: [{ type: "text", text: responseText }], usage: { input_tokens: 0, output_tokens: 0 } });
  };
  try {
    const config = { provider: "anthropic" as const, apiKey: "test-only-not-real", model: "local-editorial-test" };
    assert.equal((await generateSection(config, input)).source, "failed", "mechanical numeric rejection is an actual generation failure");
    assert.equal((await streamSection(config, input, () => {})).source, "failed", "streaming cannot bypass the quality gate");
    responseText = body;
    assert.equal((await generateSection(config, input)).source, "ai");
    assert.equal((await streamSection(config, input, () => {})).source, "ai");
  } finally { globalThis.fetch = originalFetch; }
  console.log("document editorial: deterministic numeric/duplicate/missing/source checks, operating context, generation and streaming failures passed (mock LLM, no paid calls)");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
