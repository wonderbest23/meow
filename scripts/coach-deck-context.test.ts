import assert from "node:assert/strict";
import { buildDeckPlan } from "../lib/plan-builder/deck-plan";

async function main() {
  process.env.PERSISTENCE_MODE = "demo-memory";
  process.env.SUPABASE_URL = "";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  const originalFetch = globalThis.fetch;
  const input = {
    businessName: "Menu photo service",
    planType: "일반 사업계획서",
    sections: [{ chapterTitle: "Business", sectionTitle: "Offer", markdown: "Proposed price: 60,000 KRW. No existing sales." }],
    allAnswers: {},
    businessContext: JSON.stringify({ budget: "1,000,000 KRW", hoursPerWeek: 5, price: { value: "60,000 KRW", basis: "proposal" }, sales: "none" }),
  };
  const config = { provider: "openai" as const, apiKey: "fixture-only", model: "fixture-model" };
  let source = "Business · Offer";
  let reviews = 0;
  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const system = String(body.input[0].content);
      const user = String(body.input[1].content);
      assert.ok(user.includes("1,000,000 KRW"), "Latest business context reaches both generation and review");
      const reviewing = system.includes("검토 대상");
      if (reviewing) reviews++;
      const output = reviewing ? { issues: [] } : {
        brandName: input.businessName,
        slogan: "A small test offer",
        slides: Array.from({ length: 8 }, (_, i) => ({
          title: `Section ${i + 1}`,
          eyebrow: "Proposal",
          lead: "Proposed price: 60,000 KRW. No existing sales.",
          sourceSections: [source],
        })),
      };
      return Response.json({ status: "completed", output_text: JSON.stringify(output) });
    };
    const plan = await buildDeckPlan(config, input);
    assert.equal(plan?.slides.length, 8);
    assert.equal(reviews, 1, "Business-context decks must pass the review pipeline");
    source = "Invented · Evidence";
    assert.equal(await buildDeckPlan(config, input), null, "Reject slide references absent from the saved document");
    assert.equal(await buildDeckPlan(null, input), null, "Do not substitute a fake deck when AI is unavailable");
    console.log("coach deck: shared context, review, source validation and missing AI passed (mock AI)");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
