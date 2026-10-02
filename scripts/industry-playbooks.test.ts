import assert from "node:assert/strict";
import { INDUSTRY_PLAYBOOKS, playbookChecklist, playbookForKsic } from "../lib/plan-builder/industry-playbooks";
import { ksicByCode } from "../lib/plan-builder/ksic";
import { launchSteps, launchSchema } from "../lib/plan-builder/business-launch";
import type { Plan } from "../lib/plan-builder/plan-store";
import { INTAKE_VERSION } from "../lib/plan-builder/intake-types";

/*
 * 업종 가이드: 맞는 업종에만 붙고(더 구체적인 코드 우선), 다른 법을 따르는 비슷한 업종에는 붙지 않으며,
 * 순서에는 개정되기 쉬운 숫자(면적·시간·수수료)를 넣지 않고, 마지막 단계는 가게를 온라인에 여는 것이다.
 */
const expect: Array<[string, string | null]> = [
  ["56150", "bakery"], ["56221", "cafe"], ["56111", "restaurant"], ["56191", "snack"], ["47223", "side-dish"],
  ["96112", "beauty"], ["85501", "academy"], ["85632", "academy"], ["47912", "online-store"], ["91132", "gym"], ["55104", "lodging"],
  // 다른 법을 따르거나 운영 형태가 다른 업종에는 붙이지 않는다
  ["96111", null], ["85661", null], ["85503", null], ["47911", null], ["55101", null], ["85611", null], [null as unknown as string, null],
];
for (const [code, id] of expect) assert.equal(playbookForKsic(code)?.id ?? null, id, `${code} → ${id}`);

for (const playbook of INDUSTRY_PLAYBOOKS) {
  for (const prefix of playbook.ksic) assert.ok(ksicByCode(prefix), `${playbook.id}: KSIC ${prefix} exists`);
  assert.ok(playbook.needs.length >= 3 && playbook.steps.length >= 4 && playbook.pitfalls.length >= 2, playbook.id);
  for (const step of playbook.steps) assert.ok(!/\d/.test(`${step.title}${step.detail}`), `${playbook.id}: no amendable numbers in steps — ${step.title}`);
  assert.ok(playbook.steps.at(-1)!.where.includes("오늘창업 홈페이지"), `${playbook.id}: ends at opening the business online`);
  assert.ok(playbook.steps.some(step => step.title.includes("사업자등록")), `${playbook.id}: includes business registration`);
  for (const link of playbook.links) assert.ok(link.url.startsWith("https://"), link.url);
  const checklist = playbookChecklist(playbook);
  assert.ok(checklist.includes("관할 기관 확인 필요") && checklist.includes("- [ ]"), playbook.id);
}

// 사업 관리: 업종 가이드가 있는 업종은 인허가 단계가 체크리스트로 바뀐다
const plan = {
  id: "p1", title: "동네빵집", planType: "일반 사업계획서", createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z", sections: {},
  answers: { __business_intake: { state: { version: 1, ksic: "56150", sector: "food_beverage", answers: {}, notes: [], candidates: [] } } },
} as unknown as Plan;
(plan.answers.__business_intake as { state: { version: number } }).state.version = INTAKE_VERSION;
const steps = launchSteps(plan, launchSchema.parse({ purpose: "launch" }));
const license = steps.find(step => step.id === "license");
assert.ok(license?.title.startsWith("빵집(제과점) 시작 준비"), String(license?.title));
assert.ok(license?.material.includes("식품위생교육") && license.material.includes("제과점 영업 신고"), String(license?.material));
assert.ok(steps.findIndex(step => step.id === "license") < steps.findIndex(step => step.id === "website"), "license comes before the website step");
console.log(`industry-playbooks: ${INDUSTRY_PLAYBOOKS.length} guides, ${expect.length} code mappings, launch checklist passed`);
