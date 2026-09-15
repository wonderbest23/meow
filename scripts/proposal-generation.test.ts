import assert from "node:assert/strict";
import { buildDeckPlan, blueprintForDeckInput } from "../lib/plan-builder/deck-plan";

async function main() {
  process.env.PERSISTENCE_MODE = "demo-memory";
  process.env.SUPABASE_URL = "";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  const originalFetch = globalThis.fetch;
  const input = { businessName: "공장 주문 SaaS", sections: [{ chapterTitle: "사업", sectionTitle: "소개", markdown: "주문 관리 서비스 제안. 실적 없음." }], allAnswers: {} };
  const config = { provider: "openai" as const, model: "fixture-only", apiKey: "fixture-only" };
  const blueprint = blueprintForDeckInput(input);
  const good = () => ({ brandName: input.businessName, slogan: "주문 관리", slides: blueprint.slots.map(slot => ({ id: slot.id, title: slot.title, eyebrow: slot.title, lead: "주문 관리 서비스 제안", sourceSections: ["사업 · 소개"] })) });
  let output: unknown = good();
  let requests = 0;
  let reviews = 0;
  try {
    globalThis.fetch = async (_url, init) => {
      requests++;
      const body = JSON.parse(String(init?.body));
      const reviewing = String(body.input[0].content).includes("검토 대상");
      if (reviewing) reviews++;
      else {
        const prompt = String(body.input[1].content);
        assert.ok(prompt.includes("소프트웨어 · 플랫폼"));
        assert.ok(prompt.includes("proposal-offering"));
        assert.ok(prompt.includes("모든 업종") === false);
      }
      return Response.json({ status: "completed", output_text: JSON.stringify(reviewing ? { issues: [] } : output) });
    };
    const valid = await buildDeckPlan(config, input);
    assert.equal(valid?.blueprint?.version, 2);
    assert.equal(valid?.blueprint?.sector, "software");
    assert.equal(requests, 2);
    for (const mutate of [
      (draft: ReturnType<typeof good>) => { draft.slides[1].id = draft.slides[0].id; },
      (draft: ReturnType<typeof good>) => { draft.slides[1].title = "긴".repeat(80); },
      (draft: ReturnType<typeof good>) => { Object.assign(draft.slides[4], { table: { headers: ["항목", "내용"], rows: [["값"]] } }); },
      (draft: ReturnType<typeof good>) => { Object.assign(draft.slides[4], { table: { headers: ["항목", "내용"], rows: [["값", "긴".repeat(160)]] } }); },
      (draft: ReturnType<typeof good>) => { Object.assign(draft.slides[6], { imageId: "file:///etc/passwd" }); },
      (draft: ReturnType<typeof good>) => { draft.slides[3].lead = ""; },
    ]) {
      const draft = good(); mutate(draft); output = draft;
      const before: number = requests;
      const beforeReviews: number = reviews;
      assert.equal(await buildDeckPlan(config, input), null, "Invalid editorial content must fail, not silently fall back to the old renderer");
      assert.equal(requests - before, 2, "Malformed content has only one bounded retry");
      assert.equal(reviews, beforeReviews, "Invalid structure must not spend a review call");
    }
    const legacy = { brandName: "Saved", slogan: "v1", slides: Array.from({ length: 8 }, (_, index) => ({ title: `Saved ${index}`, eyebrow: "Saved", sourceSections: ["사업 · 소개"] })) };
    const before = requests;
    const resumed = await buildDeckPlan(config, input, undefined, { draft: legacy, saveDraft: async () => undefined });
    assert.equal(resumed?.slides.length, 8);
    assert.equal(resumed?.blueprint, undefined);
    assert.equal(requests - before, 1, "A legacy checkpoint still resumes without generation");
  } finally { globalThis.fetch = originalFetch; }
  console.log("proposal generation: exact storyboard, source review, oversized content, malformed tables, unapproved images, bounded retries and legacy resume passed (mock AI)");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
