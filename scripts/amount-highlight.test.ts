import assert from "node:assert/strict";
import { amountRanges } from "../lib/client/amount-highlight";
import { latestPeriod, recordSummary } from "../lib/plan-builder/operating-records";
import { sampleOperatingState } from "../lib/plan-builder/sample-operations";

const found = (text: string) => amountRanges(text).map(([start, end]) => text.slice(start, end));
assert.deepEqual(found("쿠키 한 봉지 6,000원, 세트 20,000원입니다. 한 개에 -3,000원이고"), ["6,000원", "20,000원", "-3,000원"]);
assert.deepEqual(found("준비 예산 2,000만 원과 주 60시간"), ["2,000만 원"]);
assert.deepEqual(found("1억 2천만 원 가운데 23.7%, 3만원"), ["1억 2천만 원", "23.7%", "3만원"]);
assert.deepEqual(found("비슷한 상품 10개와 주문 1건"), [], "개수 · 건수는 칠하지 않는다");

// 유지보수 첫 화면의 한 줄 요약 — 저장된 기록만으로 만든다
const periods = sampleOperatingState("sample_banchan_easy").periods;
assert.equal(latestPeriod(periods)?.end, [...periods].map(p => p.end).sort().at(-1));
const summary = recordSummary(periods);
assert.match(summary, /매출 7,050,000원\(이전 기간보다 \+23\.7%\)/);
assert.match(summary, /문의 41건/);
assert.equal(recordSummary([]), "");
console.log("amount-highlight ok");
