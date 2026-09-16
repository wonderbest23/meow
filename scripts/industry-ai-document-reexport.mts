import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderPdf, renderDocx } from "../lib/delivery/document-renderer";
import { withoutRepeatedSectionHeading } from "../lib/delivery/document-section";
import { chaptersForType } from "../lib/plan-builder/blueprint";
import { INDUSTRY_AI_FIXTURES } from "./industry-ai-fixtures";

globalThis.fetch = async () => { throw new Error("OFFLINE_DOCUMENT_FORMATTING_ONLY"); };
const root = fileURLToPath(new URL("..", import.meta.url)), directory = join(root, "artifacts/industry-ai-20260915/b2b_service");
const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const ledgerPath = join(root, "artifacts/synthetic-ai-launch/budget.json"), ledger = await readFile(ledgerPath);
const checkpoint = JSON.parse(await readFile(join(directory, "checkpoint.json"), "utf8"));
const resultText = await readFile(join(directory, "result.json"), "utf8"), result = JSON.parse(resultText);
assert.equal(result.status, "actual-ai-chain-complete-not-release-approved"); assert.equal(checkpoint.status, "complete");
const audit = join(directory, `document-formatting-${Date.now()}`); await mkdir(audit, { mode: 0o700 });
for (const name of ["document.pdf", "document.docx"]) {
  const bytes = await readFile(join(directory, name)); assert.equal(hash(bytes), result.outputs[name]);
  await writeFile(join(audit, name), bytes, { mode: 0o444, flag: "wx" });
}
await writeFile(join(audit, "result.json"), resultText, { mode: 0o444, flag: "wx" });
const plan = checkpoint.state.plans[0], fixture = INDUSTRY_AI_FIXTURES[0];
const sections = chaptersForType("일반 사업계획서").flatMap(chapter => chapter.sections.map(section => ({ key: `${chapter.id}/${section.id}`, title: section.title })));
const keys = ["overview/summary", "market/products", "strategy/price"];
const document = { id: plan.id, title: `${fixture.name} 검증용 요약 계획서`, type: "실제 AI 생성 3항목", versionLabel: "가상 검증", markdown: keys.map(key => { const title = sections.find(section => section.key === key)!.title; return `## ${title}\n\n${withoutRepeatedSectionHeading(plan.sections[key].markdown, title)}`; }).join("\n\n") };
const project = { title: fixture.name, sector: fixture.sector, model: "가상 검증", customer: fixture.customer, generatedAt: new Date().toISOString(), sample: true };
const font = await readFile(join(root, "public/fonts/NanumGothic-Regular.ttf"));
const pdf = await renderPdf([document], project, font), docx = await renderDocx([document], project, font);
for (const [name, bytes] of [["document.pdf", pdf], ["document.docx", docx]] as const) { await writeFile(join(directory, name), bytes, { mode: 0o600 }); result.outputs[name] = hash(bytes); }
assert.equal(hash(await readFile(ledgerPath)), hash(ledger));
result.formatting = "Duplicate section headings removed; short PDF tables kept on one page; original AI content unchanged";
checkpoint.outputHashes = result.outputs;
await writeFile(join(directory, "result.json"), JSON.stringify(result, null, 2));
await writeFile(join(directory, "checkpoint.json"), JSON.stringify(checkpoint, null, 2));
await writeFile(join(audit, "receipt.json"), JSON.stringify({ originalResultSha256: hash(resultText), ledgerSha256: hash(ledger), paidCalls: 0, outputs: result.outputs }, null, 2), { mode: 0o444, flag: "wx" });
console.log(JSON.stringify({ documentSections: 3, formattingOnly: true, paidCalls: 0, outputs: result.outputs }));
