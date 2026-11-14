import assert from "node:assert/strict";
import { SAMPLE_DOCS } from "../lib/plan-builder/samples";
import { sampleLaunchAnswers } from "../lib/plan-builder/sample-launch";
import { launchStatus, launchSteps, readLaunch } from "../lib/plan-builder/business-launch";
import { sampleOperatingState } from "../lib/plan-builder/sample-operations";
import type { Plan } from "../lib/plan-builder/plan-store";

// 예시(퇴근길 반찬가게 둘)는 '결제한 사람이 두 달 쓴 모습' — 개업 준비는 끝난 단계와 남은 단계가 섞여 있고, 유지보수는 두 달 기록과 리포트 하나
for (const id of ["sample_banchan_easy", "sample_banchan_expert"]) {
  const doc = SAMPLE_DOCS.find(sample => sample.id === id)!;
  const plan = { id, title: doc.title, planType: doc.planType, createdAt: "", updatedAt: "", sections: {}, answers: sampleLaunchAnswers(id, doc.answers) } as unknown as Plan;
  const state = readLaunch(plan), statuses = Object.fromEntries(launchSteps(plan, state).map(step => [step.id, launchStatus(state, step)]));
  assert.equal(state.configured, true);
  for (const step of ["offer", "operations", "license", "workplace", "website"]) assert.equal(statuses[step], "done", `${id} ${step}: 기록의 signature 가 launchSteps 와 같아야 끝남으로 보인다`);
  for (const step of ["tax", "payment", "marketing", "review"]) assert.equal(statuses[step], "pending", `${id} ${step}`);
  const operations = sampleOperatingState(id);
  assert.equal(operations.periods.length, 2); assert.equal(operations.reports.length, 1);
  // 나간 돈이 들어온 돈보다 적다(두 달째) — 예시 숫자가 계획서 값(값 · 한 묶음 비용 · 고정비)에서 계산된 것
  assert.ok(operations.periods.every(period => (period.metrics.revenue ?? 0) > (period.metrics.expenses ?? 0)));
}
// 다른 예시는 그대로 — 개업 준비 기록을 넣지 않는다
assert.equal("__business_launch" in sampleLaunchAnswers("sample_pilates", {}), false);
console.log("sample finished: passed");
