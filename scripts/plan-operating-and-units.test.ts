import assert from "node:assert/strict";
import { checkCoachFeasibility } from "../lib/plan-builder/coach-feasibility";
import { buildCashflowScenarios } from "../lib/plan-builder/cashflow-scenarios";
import { revenueFromFounderWords } from "../lib/plan-builder/intake-core";
import { essentialGroup, essentialsForChapter } from "../lib/plan-builder/industry-essentials";
import { intakeDataOnly, onePlaceNotes, sectionPromptV3Rules } from "../lib/plan-builder/section-prompt-v3";
import type { CoachField } from "../lib/plan-builder/coach";

/**
 * 계획서 0원 점검(2026-11-25, 22개 사업 지시문)에서 나온 1·2번 묶음.
 * 1) 이미 영업 중인 가게를 창업처럼 다루던 것  2) 대표 답을 잘못 읽어 결론이 뒤집히던 것
 */
const field = (key: CoachField["key"], value: string): CoachField => ({ key, value, basis: "user" } as CoachField);

// 1-a. 운영 중 가게의 예산은 '새로 해 볼 일에 쓸 돈' — '시작 규모를 작게'로 판단하지 않는다
const fields = [field("budget", "5000000"), field("cost", "6000000"), field("price", "4500"), field("unitCost", "1800")];
const startup = checkCoachFeasibility(fields).find(check => check.code === "startup-budget")!;
const operating = checkCoachFeasibility(fields, { operating: true }).find(check => check.code === "startup-budget")!;
assert.match(startup.detail, /시작 규모를 작게/);
assert.doesNotMatch(operating.detail, /시작 규모|개월분/, "운영 중이면 창업 준비 예산으로 판단하지 않는다");
assert.match(operating.detail, /개선에 쓸 예산/);

// 1-b. 운영 중이면 창업 전 일(관심 조사 · 신고 전 판매 · 관할 기관 문의)을 장에 맡기지 않는다
const chapters = ["overview/summary", "strategy/price", "financials/expenses", "summary/roadmap", "summary/executive"].map(key => ({ key }));
const labels = (op: boolean) => onePlaceNotes({ chapters, financialOwner: "financials/expenses", executionChapter: true, operating: op }).map(note => note.label);
assert.ok(labels(false).includes("신고 전에 팔면 안 되는 이유"));
for (const label of ["신고 전에 팔면 안 되는 이유", "관심 조사 방법과 목표 응답 수", "관할 기관 문의 안내"]) assert.ok(!labels(true).includes(label), `운영 중: ${label} 없음`);

// 1-c. 운영 중 규칙 · 장 역할: 신고 전 판매 · 개업 첫 주 · 초기 지출 한도가 없고, 목차에 없는 '유통 전략' 장을 가리키지 않는다
const rules = (op: boolean) => sectionPromptV3Rules({ operating: op, sectorFocus: "", financialOwner: "financials/expenses", executionChapter: true, chapters: [
  { key: "strategy/price", title: "가격 전략", summary: "" }, { key: "strategy/promotion", title: "홍보 전략", summary: "" }, { key: "financials/expenses", title: "돈", summary: "" }] });
assert.match(rules(false), /신고 전에 팔면 법을 어길 수 있고/);
assert.doesNotMatch(rules(true), /신고 전에 팔면 법을 어길 수 있고|문 연 첫 주|돈을 받지 않는 관심 조사\(관심 등록/);
assert.match(rules(true), /이미 영업 중인 가게입니다/);
assert.doesNotMatch(rules(true), /남은 상품 처리는 .*이 정한다/, "목차에 없는 장을 가리키지 않는다");

// 1-d. 운영 중이면 업종 필수 항목에서 창업 전 항목(시작 비용 · 임대 · 계약 전 서류)을 넘기지 않는다
const group = essentialGroup({ documentSector: "cafe_food", description: "주택가에서 3년째 운영 중인 김밥집" });
const present = new Set(chapters.map(chapter => chapter.key));
const all = (op: boolean) => chapters.flatMap(chapter => essentialsForChapter(chapter.key, group, present, { operating: op })).join("\n");
assert.match(all(false), /보증금|권리금|인테리어/);
assert.doesNotMatch(all(true), /보증금|권리금|인테리어|등기부/);

// 1-e. 운영 중이면 계획서 자료에서 창업 준비 단계(공사 · 신고 · 개업 순서, 시작 자금 계획)를 뺀다
const intake = JSON.stringify({ structure: { capitalPlan: { form: "매장 필요" }, licenseChecklist: ["영업 신고"], rules: [] }, industryGuide: { name: "김밥집", steps: ["영업 신고", "개업"], pitfalls: ["재료 손실"] }, businessType: { id: "store", name: "매장", roadmap: ["공사", "개업"], assumptions: ["수요"] } });
const stripped = intakeDataOnly(intake, undefined, { operating: true });
assert.doesNotMatch(stripped, /capitalPlan|licenseChecklist|"공사"|"개업"/);
assert.match(stripped, /재료 손실/, "조심할 점은 남긴다");
assert.match(intakeDataOnly(intake), /capitalPlan/, "창업이면 그대로");

// 2-a. 대표가 말한 결제 방식이 업종 기본값보다 앞선다
const answer = (value: string) => ({ status: "answered" as const, value, messageId: "m", at: "" });
assert.equal(revenueFromFounderWords("subscription", { offer: answer("1:1 회화 60분") }), "per_unit", "과외 회당 가격은 월 이용료가 아니다");
assert.equal(revenueFromFounderWords("subscription", { offer: answer("주 2회 수업, 월 16만원") }), "subscription");
assert.equal(revenueFromFounderWords("project", { offer: answer("월 12회 게시물 제작·업로드") }), "subscription", "월 계약 대행은 정기 결제");
assert.equal(revenueFromFounderWords("per_unit", { offer: answer("아메리카노 한 잔") }), "per_unit");
assert.equal(revenueFromFounderWords("commission", { offer: answer("월 정기 매칭") }), "commission", "플랫폼 청구 방식은 건드리지 않는다");

// 2-b. 반려동물 간식은 사람 음식 규정(식품위생법) 묶음이 아니다
assert.notEqual(essentialGroup({ documentSector: "commerce", description: "반려견 수제간식을 만들어 온라인으로 판매" }).split("/")[0], "food");
assert.equal(essentialGroup({ documentSector: "cafe_food", description: "아파트 상가 아침 빵집" }).split("/")[0], "food");

// 2-c. 줄여 적은 처리량('주 40개')이 상한이 되고, 이용률 · 흑자 목표도 '목표 경우'가 생긴다
const base = { unitPrice: 25000, unitVariableCost: 9000, monthlyFixedCost: 600000, budget: "1500000" };
const candle = buildCashflowScenarios({ ...base, capacity: "대표자 혼자 / 주 40개", goal: "6개월 안에 월 200개 판매" } as never)!;
assert.ok(candle.capacity && candle.capacity.volume === 172, "주 40개 = 월 172개");
assert.ok(Math.max(...candle.scenarios.find(s => s.key === "goal")!.volumes) <= 172, "목표 경우도 처리량을 넘지 않는다");
const pension = buildCashflowScenarios({ unitPrice: 250000, unitVariableCost: 40000, monthlyFixedCost: 3000000, capacity: "대표자 부부 / 월 50박", goal: "1년 안에 예약률 60%" } as never)!;
assert.equal(Math.max(...pension.scenarios.find(s => s.key === "goal")!.volumes), 30, "월 50박 × 60% = 30박");
const laundry = buildCashflowScenarios({ unitPrice: 3000, unitVariableCost: 1500, monthlyFixedCost: 1000000, capacity: "하루 300벌", goal: "3개월 안에 흑자" } as never)!;
assert.ok(laundry.scenarios.some(s => s.key === "goal"), "'흑자' 목표도 목표 경우가 있다");
assert.equal(buildCashflowScenarios({ ...base, capacity: "하루 10개", goal: "6개월 안에 재구매율 30%" } as never)!.scenarios.some(s => s.key === "goal"), false, "판매량과 이어지지 않는 비율은 만들지 않는다");
import("../lib/plan-builder/cashflow-scenarios").then(({ parseVolumeGoal }) => {
  assert.equal(parseVolumeGoal("3개월 안에 정기 학생 10명", 26, { cycle: "visits", visitWeeks: 1 })?.volume, 44, "회당 수업 정기 학생 10명은 매주 → 월 44회");
  assert.equal(parseVolumeGoal("6개월 안에 재방문 고객 100명", 26, { cycle: "visits" })?.volume, 109, "미용·네일은 4주에 1번 그대로");
  console.log("plan-operating-and-units: ok");
});
