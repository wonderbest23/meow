import assert from "node:assert/strict";
import { reviewCoachSection, type CoachReviewEvent } from "../lib/plan-builder/coach-review";

async function main() {
  process.env.PERSISTENCE_MODE = "demo-memory";
  process.env.SUPABASE_URL = ""; process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  process.env.ANTHROPIC_API_KEY = "fixture-only";
  const config = { provider: "openai" as const, model: "fixture-only", apiKey: "fixture-only" };
  const original = globalThis.fetch;
  let truncated = false; let invalid = false; let unavailable = false; let calls = 0;
  try {
    globalThis.fetch = async (url, init) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      if (String(url).includes("openai.com")) {
        assert.equal(body.text.format.type, "json_schema");
        return Response.json({ error: { code: "insufficient_quota" } }, { status: 429 });
      }
      assert.ok(body.max_tokens >= 8000);
      assert.equal(body.output_config.format.type, "json_schema");
      assert.deepEqual(body.output_config.format.schema.required, ["issues"]);
      assert.ok(body.system.includes("출력 스키마"));
      assert.ok(body.system.includes("본문이나 수정본을 다시 출력하지"));
      if (unavailable) return Response.json({ error: { message: "Fixture provider outage" } }, { status: 524 });
      return Response.json({ stop_reason: truncated ? "max_tokens" : "end_turn", content: [{ type: "text", text: invalid ? JSON.stringify({ draft: "wrong shape" }) : JSON.stringify({ issues: [] }) }], usage: { input_tokens: 40, output_tokens: truncated ? 8000 : 10 } });
    };
    assert.equal(await reviewCoachSection(config, "Synthetic", "Proposed service"), "Proposed service");
    assert.equal(calls, 2);
    const events: CoachReviewEvent[] = [];
    truncated = true;
    assert.equal(await reviewCoachSection(config, "Synthetic", "Proposed service", "markdown", event => { events.push(event); }), null);
    assert.ok(events.includes("review_output_limit"), "Truncated review must not approve a document");
    truncated = false; invalid = true;
    assert.equal(await reviewCoachSection(config, "Synthetic", "Proposed service"), null);
    unavailable = true;
    assert.equal(await reviewCoachSection(config, "Synthetic", "Proposed service", "markdown", event => { events.push(event); }), null);
    assert.ok(events.includes("provider_unavailable"));
    console.log("coach review: quota fallback, compact schema, truncation and invalid review rejection passed");
  } finally { globalThis.fetch = original; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
