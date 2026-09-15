import assert from "node:assert/strict";
import { createProposalBlueprint, inferProposalSector, PROPOSAL_SECTORS, PROPOSAL_PURPOSES, PROPOSAL_STAGES, PROPOSAL_EVIDENCE, SECTOR_PROFILES, type EvidenceAvailability } from "../lib/plan-builder/proposal-blueprint";
import { blueprintForDeckInput } from "../lib/plan-builder/deck-plan";

let cases = 0;
for (const sector of PROPOSAL_SECTORS) for (const purpose of PROPOSAL_PURPOSES) for (const stage of PROPOSAL_STAGES) for (let mask = 0; mask < 64; mask++) {
  const evidence = Object.fromEntries(PROPOSAL_EVIDENCE.map((key, index) => [key, Boolean(mask & (1 << index))])) as EvidenceAvailability;
  const input = { businessName: "Synthetic", options: { sector, purpose, stage, evidence } };
  const blueprint = createProposalBlueprint(input);
  assert.deepEqual(blueprint, createProposalBlueprint(input), "Same inputs must always select the same storyboard");
  assert.equal(blueprint.slots[0].role, "cover");
  assert.equal(blueprint.slots.at(-1)?.role, "close");
  assert.equal(new Set(blueprint.slots.map(slot => slot.id)).size, blueprint.slots.length);
  assert.ok(blueprint.slots.length >= 10 && blueprint.slots.length <= 13);
  assert.equal(blueprint.slots.some(slot => slot.role === "ask"), purpose === "investment" || purpose === "grant");
  for (const slot of blueprint.slots) {
    assert.deepEqual(slot.missingEvidence, slot.requiredEvidence.filter(key => !evidence[key]));
    assert.equal(slot.treatment === "verification_plan", slot.missingEvidence.length > 0);
    assert.ok(slot.focus.length > 10 && slot.fallback.length > 10);
  }
  const proof = blueprint.slots.find(slot => slot.role === "evidence")!;
  assert.equal(proof.treatment, evidence[stage === "operating" || stage === "expanding" ? "actuals" : "references"] ? "source_only" : "verification_plan");
  assert.equal(blueprint.slots.find(slot => slot.role === "roadmap")?.treatment, evidence.schedule ? "source_only" : "verification_plan");
  cases++;
}
assert.equal(cases, 14_080);
assert.equal(inferProposalSector("카페 주문 관리 SaaS"), "software");
assert.equal(inferProposalSector("식당 메뉴 사진 제작"), "content_media");
assert.equal(inferProposalSector("제조사 영업자료 컨설팅", "문서 제작 대행"), "b2b_service");
assert.equal(inferProposalSector("새로운 구상"), "general");
assert.equal(createProposalBlueprint({ businessName: "카페 관리 앱", options: { sector: "b2b_service" } }).sector, "b2b_service");
assert.equal(new Set(PROPOSAL_SECTORS.map(sector => SECTOR_PROFILES[sector].offering)).size, PROPOSAL_SECTORS.length);
const input = { businessName: "Synthetic", sections: [], allAnswers: {}, businessContext: JSON.stringify({ stage: "operating", fields: [{ key: "sales", value: "월 목표 100만원", basis: "proposal" }] }) };
assert.equal(blueprintForDeckInput(input).evidence.actuals, false, "A proposal must not become actual performance");
assert.equal(blueprintForDeckInput({ ...input, businessContext: "null" }).sector, "general");
console.log(`proposal blueprint: ${cases} rule combinations passed (11 sectors x 5 purposes x 4 stages x 64 evidence states); no AI calls`);
