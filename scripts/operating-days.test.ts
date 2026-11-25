import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_DAYS_PER_MONTH, daysPerMonth, monthDaysFromFields, operatingDaysValue, parseOperatingDays } from "../lib/plan-builder/operating-days";
import { monthlyVolumeFromCapacity } from "../lib/plan-builder/coach-feasibility";
import { cashflowFromFields, cashflowMarkdown, cashflowReference, fixedCostAssumptionsFromFields, fixedCostAssumptionReference, parseVolumeGoal } from "../lib/plan-builder/cashflow-scenarios";

/*
 * 영업일은 사업 정보 표의 칸 하나에서 온다(2026-11-16). 칸이 없으면 예전과 똑같이 월 26일, 있으면 계산과 문구가 모두 그 날수를 쓴다.
 */
// 1) 주 며칠 → 한 달 며칠
assert.equal(DEFAULT_DAYS_PER_MONTH, 26);
assert.equal(daysPerMonth(6), 26, "주 6일이 예전 가정(월 26일)과 같다");
assert.deepEqual([1, 2, 3, 5, 7].map(daysPerMonth), [4, 9, 13, 22, 30]);
for (const bad of [null, undefined, 0, 8, Number.NaN]) assert.equal(daysPerMonth(bad as number), 26, `범위 밖(${bad})은 기본값`);
assert.equal(parseOperatingDays("주 2일"), 2); assert.equal(parseOperatingDays(5), 5); assert.equal(parseOperatingDays(operatingDaysValue(3)), 3);
for (const bad of ["", "주말에만", "주 12일", "8", null]) assert.equal(parseOperatingDays(bad), null, `읽을 수 없는 값(${bad})`);
assert.equal(monthDaysFromFields([{ key: "capacity", value: "하루 80건" }]), 26, "칸이 없으면 월 26일");
assert.equal(monthDaysFromFields([{ key: "operatingDays", value: "주 2일" }]), 9);
assert.equal(monthDaysFromFields([{ key: "operatingDays", value: "모름" }]), 26, "읽을 수 없는 칸 값은 기본값");

// 2) 한 달 환산 — 기본은 예전 문구 그대로
assert.deepEqual(monthlyVolumeFromCapacity("대표자 혼자 / 하루 80잔"), { volume: 2080, unit: "잔", count: 80, period: "하루", note: "하루 80잔 × 월 26일 영업 = 월 2,080잔" });
assert.deepEqual(monthlyVolumeFromCapacity("대표자 혼자 / 하루 80잔", 9), { volume: 720, unit: "잔", count: 80, period: "하루", note: "하루 80잔 × 월 9일 영업 = 월 720잔" });
assert.equal(monthlyVolumeFromCapacity("일주일 20명", 9)?.volume, 86, "주 단위 답은 영업일과 무관(월 4.3주)");
assert.equal(monthlyVolumeFromCapacity("한 달 100건", 9)?.volume, 100);
// 줄여 적은 기간도 읽는다(2026-11-25 0원 점검: '주 40개'·'월 40명'을 못 읽어 처리량 상한이 빠졌다)
assert.equal(monthlyVolumeFromCapacity("대표자 혼자 / 주 40개")?.volume, 172, "주 40개 × 4.3주");
assert.equal(monthlyVolumeFromCapacity("대표자 혼자 / 월 40명")?.volume, 40);
assert.equal(monthlyVolumeFromCapacity("대표자 부부 / 월 50박")?.unit, "박");
assert.equal(monthlyVolumeFromCapacity("대표자 혼자 / 매주 8건")?.volume, 34);
assert.equal(monthlyVolumeFromCapacity("주말에만 20건"), null, "'주말'의 '주'를 기간으로 읽지 않는다");
assert.equal(parseVolumeGoal("3개월 안에 하루 50잔")?.volume, 1300); assert.equal(parseVolumeGoal("3개월 안에 하루 50잔", 9)?.volume, 450);

// 3) 현금흐름 — 같은 사업, 영업일만 다르게
const base = [{ key: "price", value: "4500원" }, { key: "unitCost", value: "1500원" }, { key: "cost", value: "3000000원" }, { key: "capacity", value: "대표자 혼자 / 하루 80잔" }, { key: "budget", value: "3000000원" }];
const money = { unitPrice: 4500, unitVariableCost: 1500, monthlyFixedCost: 3_000_000 };
const everyDay = cashflowFromFields(base, money)!, weekend = cashflowFromFields([...base, { key: "operatingDays", value: "주 2일" }], money)!;
assert.ok(everyDay && weekend);
assert.equal(everyDay.days, 26); assert.equal(weekend.days, 9);
assert.equal(everyDay.capacity?.volume, 2080); assert.equal(weekend.capacity?.volume, 720, "주말만 열면 감당할 수 있는 양이 줄어든다");
assert.equal(everyDay.breakEven, weekend.breakEven, "본전 판매량(월)은 영업일과 무관하다");
const textOf = (flow: typeof everyDay) => `${cashflowMarkdown(flow)}\n${cashflowReference(flow)}`;
assert.match(textOf(everyDay), /월 26일 영업/); assert.doesNotMatch(textOf(everyDay), /월 9일/);
assert.match(textOf(weekend), /월 9일 영업/); assert.doesNotMatch(textOf(weekend), /월 26일/, "주말 사업의 계산표에 26일이 남지 않는다");
const perDayOf = (flow: typeof everyDay) => Number(cashflowReference(flow).match(/하루 환산\(월 \d+일 영업 가정\): 본전 하루 약 ([\d,]+)/)?.[1]?.replace(/,/g, ""));
assert.ok(perDayOf(weekend) > perDayOf(everyDay) * 2.5, `주말만 열면 하루에 팔아야 하는 양이 늘어난다(${perDayOf(everyDay)} → ${perDayOf(weekend)})`);

// 4) 고정비를 아직 모를 때의 가정표도 같은 날수
const noCost = base.filter(field => field.key !== "cost");
assert.equal(fixedCostAssumptionsFromFields(noCost)?.days, 26);
const assumed = fixedCostAssumptionsFromFields([...noCost, { key: "operatingDays", value: "주 2일" }])!;
assert.equal(assumed.days, 9); assert.ok(fixedCostAssumptionReference(assumed).length > 0);

// 5) 계산 코드에 26 이 다시 박히지 않게 — 곱하거나 나누는 26 은 operating-days.ts 의 기본값 한 곳에만 있다
for (const file of ["cashflow-scenarios.ts", "coach-feasibility.ts", "intake-core.ts", "executive-summary.ts", "section-service.ts", "intake-estimate.ts"]) {
  const source = readFileSync(new URL(`../lib/plan-builder/${file}`, import.meta.url), "utf8").split("\n").filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
  assert.doesNotMatch(source, /[*/]\s*26\b(?!\d)/, `${file}: 26 을 직접 곱하거나 나누지 않는다`);
  assert.doesNotMatch(source, /월 26일/, `${file}: '월 26일'을 글로 박아 두지 않는다`);
}
console.log("operating-days: 영업일 칸 → 한 달 환산 · 현금흐름 · 문구 통과");
