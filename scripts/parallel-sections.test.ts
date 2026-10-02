import assert from "node:assert/strict";

/*
 * 섹션 동시 생성(lib/plan-builder/section-workflow.ts):
 * 묶음 순서, 문서 설계도 검증, 설계도가 섹션 지시문에 들어가는지, 동시에 저장해도 섹션이 사라지지 않는지.
 */
async function main() {
  process.env.SUPABASE_URL = "";
  process.env.ANTHROPIC_API_KEY = "test-key";

  const { sectionWaves, SECTION_CONCURRENCY } = await import("../lib/plan-builder/section-waves");
  const keys = ["overview/summary", "overview/problem", "market/products", "market/personas", "summary/executive", "strategy/price", "strategy/distribution"];
  const waves = sectionWaves(keys, SECTION_CONCURRENCY);
  assert.deepEqual(waves, [["overview/summary", "overview/problem", "market/products", "market/personas"], ["strategy/price", "strategy/distribution"], ["summary/executive"]], "summary goes last, others in groups of 4");
  assert.deepEqual(sectionWaves(keys, 1).map(w => w.length), [1, 1, 1, 1, 1, 1, 1], "no outline → one at a time");
  assert.deepEqual(sectionWaves(keys, 1).flat(), [...keys.filter(k => k !== "summary/executive"), "summary/executive"]);

  let reply = "";
  let calls = 0;
  let delayMs = 0;
  const realFetch = globalThis.fetch;
  (globalThis as Record<string, unknown>).fetch = async (url: string, init?: RequestInit) => {
    if (String(url).includes("anthropic.com")) {
      calls += 1;
      const body = JSON.parse(String(init?.body));
      if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
      const system = Array.isArray(body.system) ? body.system.map((part: { text: string }) => part.text).join("\n") : String(body.system ?? "");
      const text = system.includes("편집장") ? reply : `## 본문 ${calls}\n\n출근길 직장인을 대상으로 하는 테이크아웃 커피 매장의 문제와 해결을 정리한 본문입니다. 실제 모델이 쓴 글이라고 가정합니다. 섹션 번호 ${calls}.`;
      return new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 10 } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return realFetch(url, init);
  };

  try {
    const { buildSectionOutline } = await import("../lib/plan-builder/section-outline");
    const config = { provider: "anthropic" as const, model: "fixture-only", apiKey: "fixture-only" };
    const four = ["overview/problem", "market/products", "market/personas", "strategy/price"];
    reply = four.map(key => `- ${key}: 이 섹션의 핵심 / 다른 섹션에 맡길 것`).join("\n");
    const outline = await buildSectionOutline(config, { planTitle: "새벽커피", keys: four });
    assert.ok(outline?.includes("market/products"), "outline covering the sections is used");
    reply = "- overview/problem: 하나만 다룸";
    assert.equal(await buildSectionOutline(config, { planTitle: "새벽커피", keys: four }), null, "an outline that skips most sections is rejected (sequential fallback)");
    reply = "";
    assert.equal(await buildSectionOutline(config, { planTitle: "새벽커피", keys: four }), null, "empty outline → sequential fallback");

    const { sectionSystemPrompt } = await import("../lib/plan-builder/section-generator");
    const { PLAN_BLUEPRINT } = await import("../lib/plan-builder/blueprint");
    const chapter = PLAN_BLUEPRINT.find(c => c.id === "overview")!;
    const base = { chapter, section: chapter.sections.find(s => s.id === "problem")!, answers: {}, planTitle: "새벽커피" };
    assert.ok(sectionSystemPrompt({ ...base, outline: "- overview/problem: 문제 정의" }).includes("[문서 설계도"));
    assert.ok(!sectionSystemPrompt(base).includes("[문서 설계도"), "no outline → prompt unchanged");

    // 확인 목록은 마지막 섹션(핵심 요약)에만 — 다른 섹션은 '참고 사항' 목록을 만들지 않는다
    const { buildUserPrompt } = await import("../lib/plan-builder/section-generator");
    const summaryChapter = PLAN_BLUEPRINT.find(c => c.id === "summary")!;
    const executive = { chapter: summaryChapter, section: summaryChapter.sections.find(s => s.id === "executive")!, answers: {}, planTitle: "새벽커피" };
    assert.ok(buildUserPrompt(executive).includes("실행 전 확인 목록"), "the last section collects the checklist");
    assert.ok(!buildUserPrompt(base).includes("## 실행 전 확인 목록"), "other sections do not");
    assert.ok(sectionSystemPrompt(base).includes("섹션마다 '참고 사항'"), "system prompt forbids per-section note lists");
    assert.ok(!/섹션 끝에 '추가 정의 필요 항목' 목록 하나로 모으세요/.test(sectionSystemPrompt(base)), "old per-section rule removed");

    // 4개 섹션을 동시에 저장해도 하나도 사라지지 않는다(저장 충돌은 다시 불러와 저장만 다시 한다)
    const store = await import("../lib/plan-builder/plan-server-store");
    const { generateAndSaveSection, generatePlanOutline } = await import("../lib/plan-builder/section-service");
    const ownerHash = "owner-parallel";
    await store.savePlanState(ownerHash, store.normalizeState({
      business: { name: "새벽커피", description: "", role: "", industry: "", region: "", stage: "" },
      activePlanId: "plan_p",
      plans: [{
        id: "plan_p", title: "새벽커피", planType: "창업 초기 · 사업계획서",
        createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", sections: {},
        answers: Object.fromEntries(four.map(key => [key, { note: `${key} 답변` }])),
      }],
    }));
    reply = four.map(key => `- ${key}: 맡을 범위`).join("\n");
    const planned = await generatePlanOutline({ ownerHash, planId: "plan_p", sections: four.map(key => ({ chapterId: key.split("/")[0], sectionId: key.split("/")[1] })) });
    assert.equal(planned.ok, true);
    assert.ok(planned.outline?.includes("strategy/price"));
    delayMs = 20;
    const results = await Promise.all(four.map(key => generateAndSaveSection({ ownerHash, planId: "plan_p", chapterId: key.split("/")[0], sectionId: key.split("/")[1], outline: planned.outline })));
    assert.ok(results.every(result => result.ok), JSON.stringify(results));
    const saved = await store.loadPlanState(ownerHash);
    assert.deepEqual(Object.keys(saved.plans[0].sections).sort(), [...four].sort(), "every concurrently generated section is kept");
    console.log("parallel-sections: waves, outline validation, prompt block, concurrent save passed");
  } finally {
    (globalThis as Record<string, unknown>).fetch = realFetch;
  }
}

main().catch(error => { console.error(error); process.exit(1); });
