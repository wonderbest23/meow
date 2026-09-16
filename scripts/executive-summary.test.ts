import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import JSZip from "jszip";
import { buildExecutiveSummary, hasExecutiveSummaryContent } from "../lib/plan-builder/executive-summary";
import { DOCUMENT_SECTOR_FOCUS, documentEditorialPrompt, documentOperatingContext } from "../lib/plan-builder/document-editorial";
import { readCoach, COACH_KEY } from "../lib/plan-builder/coach";
import { OPERATING_KEY } from "../lib/plan-builder/operating-records";
import { renderDocx, renderPdf } from "../lib/delivery/document-renderer";
import { executiveFixture } from "./executive-summary-fixture";

async function main() {
  const font = await readFile("public/fonts/NanumGothic-Regular.ttf");
  const project = { title: "온결 스튜디오", sector: "기업 서비스", model: "사업계획서", customer: "지역 제조사", generatedAt: "2026-09-15T01:00:00.000Z", sample: true };
  const purposes = ["일반 사업계획서", "고객 제안서", "사업 운영·개선 계획서", "투자 검토 계획서", "정부지원 · PSST 사업계획서"];
  let count = 0;
  for (const sector of Object.keys(DOCUMENT_SECTOR_FOCUS)) for (const purpose of purposes) for (const stage of ["exploring", "startup", "operating"] as const) {
    const plan = executiveFixture(stage, sector, purpose), summary = buildExecutiveSummary(plan);
    assert.equal(summary.blocks.length, 6);
    assert.ok(summary.blocks[0].lines[0].value.includes("온결"));
    assert.ok(summary.blocks[1].lines.some(line => line.basis === "proposal"));
    assert.ok(summary.blocks[2].lines[0].value.includes("7,200,000원"));
    assert.ok(summary.blocks[2].lines[0].value.includes("4,000,000원"));
    assert.ok(documentEditorialPrompt({ business: readCoach(plan.answers)!.business, planType: purpose }).includes(DOCUMENT_SECTOR_FOCUS[sector as keyof typeof DOCUMENT_SECTOR_FOCUS]));
    if (stage === "operating") {
      assert.ok(summary.note.includes("기간 길이가 달라"));
      assert.ok(JSON.stringify(summary).includes("지출 미입력"));
      assert.ok(documentOperatingContext(plan.answers).includes("5,400,000원"));
      assert.ok(JSON.stringify(summary).includes("목표"));
    }
    const pdf = await renderPdf([{ id: "summary", title: summary.title, type: purpose, versionLabel: "요약", markdown: "", executiveSummary: summary }], project, font);
    assert.equal((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length, 1, `${sector}/${purpose}/${stage} must fit one PDF page`);
    count++;
  }
  const missing = executiveFixture();
  readCoach(missing.answers)!.fields = readCoach(missing.answers)!.fields.filter(field => field.key !== "cost");
  const noCost = buildExecutiveSummary(missing);
  assert.ok(JSON.stringify(noCost).includes("손익 계산 가능"));
  assert.equal(JSON.stringify(noCost).includes("영업손익"), false, "missing costs never become zero expenses");
  const staleAction = executiveFixture(); readCoach(staleAction.answers)!.directAction!.needsReview = true;
  assert.equal(buildExecutiveSummary(staleAction).blocks[4].lines[0].basis, "missing");
  const changed = executiveFixture(); const before = buildExecutiveSummary(changed);
  changed.updatedAt = "2026-09-15T02:00:00.000Z";
  assert.notEqual(buildExecutiveSummary(changed).sourceVersion, before.sourceVersion);
  const corrupt = executiveFixture(); corrupt.answers[OPERATING_KEY] = { invalid: true };
  assert.throws(() => buildExecutiveSummary(corrupt), /저장된 운영 기록/);
  const empty = executiveFixture(); empty.answers = {}; assert.doesNotThrow(() => buildExecutiveSummary(empty));
  assert.equal(hasExecutiveSummaryContent(buildExecutiveSummary(empty)), false, "an empty source must not become an exportable generic summary");
  assert.equal(hasExecutiveSummaryContent(before), true);
  const partialLegacy = executiveFixture(); partialLegacy.answers = { "financials/revenue": { unit_price: "10만원", monthly_volume: "10" }, "financials/expenses": { variable_per_unit: "1만원" }, "financials/staffing": { staff_monthly: "20만원" } };
  assert.equal(JSON.stringify(buildExecutiveSummary(partialLegacy)).includes("영업손익"), false, "legacy wages alone cannot stand in for missing fixed costs");

  await mkdir("artifacts/executive-summary", { recursive: true });
  for (const scenario of ["startup", "operating", "long"] as const) {
    const plan = executiveFixture(scenario === "operating" ? "operating" : "startup");
    if (scenario === "long") {
      plan.title = "제조업의 복잡한 제품 설명을 영업 현장에 전달하는 온결 스튜디오 사업계획";
      const coach = readCoach(plan.answers)!;
      for (const field of coach.fields) if (!["price", "cost", "unitCost", "volume"].includes(field.key)) field.value = `${field.value} 그리고 해당 제품의 상세한 설명과 조건을 확인합니다 `.repeat(15);
      coach.directAction!.action = "기존 거래처의 영업 담당자에게 제품 소개서 제작에 필요한 원본 자료와 검수 절차를 요청하고 적용 범위를 확인합니다 ".repeat(12);
      coach.directAction!.doneWhen = "적용할 제품 목록과 확인 담당자를 회신받고 수정 범위와 납품 조건을 함께 기록합니다 ".repeat(12);
      plan.answers[COACH_KEY] = { state: coach };
    }
    const summary = buildExecutiveSummary(plan);
    const document = { id: "summary", title: summary.title, type: plan.planType, versionLabel: "요약", markdown: "", executiveSummary: summary };
    const pdf = await renderPdf([document], project, font), docx = await renderDocx([document], project, font);
    assert.equal((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length, 1);
    const xml = await (await JSZip.loadAsync(docx)).file("word/document.xml")!.async("text");
    assert.ok(xml.includes("한 장 사업 요약")); assert.ok(xml.includes("180만원"));
    assert.equal(xml.includes('w:type="page"'), false, "summary has no cover or forced page break");
    await writeFile(`artifacts/executive-summary/${scenario}.pdf`, pdf);
    await writeFile(`artifacts/executive-summary/${scenario}.docx`, docx);
  }
  console.log(`executive summary: ${count} sector/purpose/stage PDFs, missing costs, provenance, period comparison, stale action/version and DOCX structure passed; no paid calls`);
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
