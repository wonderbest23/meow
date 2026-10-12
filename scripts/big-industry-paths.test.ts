import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BIG_INDUSTRIES, bigIndustryContext, bigIndustryFor } from "../lib/plan-builder/big-industry-paths";
import { INDUSTRY_PLAYBOOKS, playbookForKsic } from "../lib/plan-builder/industry-playbooks";

/*
 * 큰 사업 → 작게 들어가는 길(2026-10-12). 가이드에서 뺀 업종 223개는 모두 큰 사업 분류에 들어가고,
 * 가이드가 있는 업종은 하나도 큰 사업으로 잡지 않으며, 길은 모두 있는 가이드를 가리킨다.
 */
const assignments = JSON.parse(readFileSync("docs/업종-가이드-근거/업종-배정.json", "utf8")) as Array<{ code: string; regime?: string; excludedReason?: string }>;
const excluded = [...assignments.filter(item => item.excludedReason || item.regime === "excluded" || item.regime === "exclude").map(item => item.code), "01500", "64999", "85430", "61291"];
for (const code of excluded) assert.ok(bigIndustryFor({ ksic: code }), `excluded ${code} has a big-industry category`);
assert.equal(new Set(BIG_INDUSTRIES.flatMap(item => item.ksic)).size, BIG_INDUSTRIES.flatMap(item => item.ksic).length, "a code belongs to one category");
for (const code of ["56150", "33992", "10901", "35114", "49302", "85501", "47912"]) {
  assert.equal(bigIndustryFor({ ksic: code }), null, `${code} has a guide, not a big-industry category`);
  assert.ok(playbookForKsic(code), `${code} keeps its guide`);
}
const guides = new Set(INDUSTRY_PLAYBOOKS.map(item => item.id));
for (const item of BIG_INDUSTRIES) {
  assert.ok(item.paths.length >= 1 && item.why, item.id);
  for (const path of item.paths) assert.ok(!path.guide || guides.has(path.guide), `${item.id}: path guide ${path.guide} exists`);
}

// 사업 설명: 큰 꿈은 잡고, 같은 업종의 작은 형태는 잡지 않는다
const described: Array<[string, string | null]> = [
  ["인터넷 은행을 만들고 싶어요", "finance"], ["저가 항공사 창업", "transport"], ["방송국 설립", "broadcast"], ["골프장 건설 사업", "big-retail-leisure"],
  ["카지노 호텔", "big-retail-leisure"], ["자동차 회사 창업", "heavy-manufacturing"], ["대안 학교 설립", "school-hospital"], ["원양 어선 사업", "mining-ocean"],
  ["스크린골프장", null], ["태양광 발전소", null], ["동네 마트", null], ["은행나무 아래 작은 카페", null], ["수제 맥주 양조", null],
];
for (const [text, id] of described) assert.equal(bigIndustryFor({ text })?.id ?? null, id, `${text} → ${id}`);

// 설계·계획서 자료: 꿈은 장기 구상으로, 시작안은 작은 길에서
const context = bigIndustryContext(bigIndustryFor({ text: "인터넷 은행을 만들고 싶어요" })!, "description");
assert.match(context.rule, /장기 구상.*paths 가운데/);
assert.match(context.matchedBy ?? "", /사업 설명으로 찾았습니다/);
assert.ok(context.paths.some(path => path.startsWith("보험대리점")));
console.log(`big-industry-paths: ${BIG_INDUSTRIES.length} categories, ${excluded.length} excluded codes covered, ${described.length} descriptions passed`);
