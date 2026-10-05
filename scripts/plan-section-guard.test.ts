// 다시 생성 횟수는 서버에 저장된 본문이 있는지로 센다(app/api/plan/generate). 화면이 보낸 상태로 그 본문을 지워 우회하지 못하게.
import assert from "node:assert/strict";
import { savePlanState, loadPlanState } from "../lib/plan-builder/plan-server-store";

async function main() {
  const owner = "test-owner-" + Date.now();
  const at = "2026-10-05T00:00:00.000Z";
  const base = { business: {}, activePlanId: "p1", plans: [{ id: "p1", title: "t", planType: "x", createdAt: at, updatedAt: at, answers: {}, sections: { "a/b": { markdown: "본문", html: "<p>본문</p>", generatedAt: at } } }] };
  await savePlanState(owner, base as never);
  // 1) 빈 본문으로 덮기 시도
  await savePlanState(owner, { ...base, plans: [{ ...base.plans[0], updatedAt: "2027-01-01T00:00:00.000Z", sections: { "a/b": { markdown: "", html: "", generatedAt: "9999" } } }] } as never);
  assert.equal((await loadPlanState(owner)).plans[0].sections["a/b"].markdown, "본문");
  // 2) 섹션을 빼고 보내기
  await savePlanState(owner, { ...base, plans: [{ ...base.plans[0], updatedAt: "2027-02-01T00:00:00.000Z", sections: {} }] } as never);
  assert.equal((await loadPlanState(owner)).plans[0].sections["a/b"].markdown, "본문");
  // 3) 정상 수정은 반영
  await savePlanState(owner, { ...base, plans: [{ ...base.plans[0], updatedAt: "2027-03-01T00:00:00.000Z", sections: { "a/b": { markdown: "고친 본문", html: "", generatedAt: "2027-03-01" } } }] } as never);
  assert.equal((await loadPlanState(owner)).plans[0].sections["a/b"].markdown, "고친 본문");
  console.log("plan-section-guard: 빈 본문·빠진 섹션으로 서버 본문을 지울 수 없음(다시 생성 횟수 우회 차단), 정상 수정은 반영");
}

main().catch((error) => { console.error(error); process.exit(1); });
