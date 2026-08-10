import assert from "node:assert/strict";

/*
 * 서버가 본문을 만들어 저장하는 부분을 직접 돌린다.
 * 사람이 고친 글을 덮지 않는지, 답변이 없으면 건너뛰는지가 핵심이다.
 */
async function main() {
  process.env.SUPABASE_URL = "";           // 인메모리 폴백으로 돌린다
  process.env.ANTHROPIC_API_KEY = "test-key";

  const store = await import("../lib/plan-builder/plan-server-store");

  // 실제 AI를 부르지 않는다 — 앤트로픽 응답만 흉내 낸다
  let generated = 0;
  const realFetch = globalThis.fetch;
  (globalThis as Record<string, unknown>).fetch = async (url: string, init?: RequestInit) => {
    if (String(url).includes("anthropic.com")) {
      generated += 1;
      return new Response(
        JSON.stringify({ content: [{ type: "text", text: `# 생성본 ${generated}\n\n내용입니다.` }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return realFetch(url, init);
  };

  const { generateAndSaveSection } = await import("../lib/plan-builder/section-service");
  const ownerHash = "owner-1";

  await store.savePlanState(ownerHash, store.normalizeState({
    business: { name: "새벽커피", description: "", role: "", industry: "", region: "", stage: "" },
    activePlanId: "plan_1",
    plans: [{
      id: "plan_1",
      title: "새벽커피",
      planType: "창업 초기 · 사업계획서",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      sections: {},
      answers: { "overview/problem": { problems: ["출근길 커피"], solutions: ["역 앞 매장"] } },
    }],
  }));

  // 1) 답변이 있는 섹션은 만들어 저장한다
  const made = await generateAndSaveSection({ ownerHash, planId: "plan_1", chapterId: "overview", sectionId: "problem" });
  assert.equal(made.ok, true);
  const after = await store.loadPlanState(ownerHash);
  assert.ok(after.plans[0].sections["overview/problem"], "본문이 저장되어야 한다");
  assert.ok(after.plans[0].sections["overview/problem"].html, "HTML까지 렌더되어야 한다");

  // 2) 답변이 없는 섹션은 건너뛴다 — 빈 답변으로 엉뚱한 글을 만들면 안 된다
  const skipped = await generateAndSaveSection({ ownerHash, planId: "plan_1", chapterId: "overview", sectionId: "mission" });
  assert.equal(skipped.skipped, "NO_ANSWERS");

  // 3) 사용자가 직접 고친 섹션은 덮지 않는다
  const edited = await store.loadPlanState(ownerHash);
  edited.plans[0].sections["overview/problem"] = {
    markdown: "# 내가 직접 쓴 글",
    html: "<h1>내가 직접 쓴 글</h1>",
    generatedAt: new Date().toISOString(),
    edited: true,
  };
  await store.savePlanState(ownerHash, edited);
  const kept = await generateAndSaveSection({ ownerHash, planId: "plan_1", chapterId: "overview", sectionId: "problem" });
  assert.equal(kept.skipped, "USER_EDITED", "사람이 쓴 글은 건드리면 안 된다");
  const final = await store.loadPlanState(ownerHash);
  assert.equal(final.plans[0].sections["overview/problem"].markdown, "# 내가 직접 쓴 글");

  // 4) 남의 플랜은 만들어 주지 않는다
  const other = await generateAndSaveSection({ ownerHash: "someone-else", planId: "plan_1", chapterId: "overview", sectionId: "problem" });
  assert.equal(other.ok, false);
  assert.equal(other.skipped, "PLAN_NOT_FOUND");

  console.log("plan-section-service: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
