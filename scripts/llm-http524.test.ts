import assert from "node:assert/strict";
import { completeJson, type LLMFailure, type LLMProvider } from "../lib/llm/complete";

async function main() {
  const original = globalThis.fetch;
  process.env.SUPABASE_URL = "";
  const cases: Array<[string, () => Response, LLMFailure["code"], boolean]> = [
    ["message-only", () => Response.json({ error: { message: "Fixture provider outage" } }, { status: 524 }), "unavailable", false],
    ["html", () => new Response("<html>Gateway timeout</html>", { status: 524 }), "unavailable", false],
    ["empty", () => new Response(null, { status: 524 }), "unavailable", false],
    ["server", () => Response.json({ error: { type: "server_error" } }, { status: 524 }), "unavailable", true],
    ["auth", () => Response.json({ error: { type: "authentication_error" } }, { status: 524 }), "authentication", false],
    ["quota", () => Response.json({ error: { code: "insufficient_quota" } }, { status: 524 }), "quota_exhausted", false],
    ["invalid", () => Response.json({ error: { type: "invalid_request_error" } }, { status: 524 }), "invalid_request", false],
    ["refusal", () => Response.json({ error: { code: "content_filter" } }, { status: 524 }), "refusal", false],
    ["unknown-code", () => Response.json({ error: { code: "unknown_gateway_fault" } }, { status: 524 }), "unavailable", false],
  ];
  let groups = 0;
  try {
    for (const provider of ["openai", "anthropic"] as const) for (const [label, response, code, retryable] of cases) {
      let calls = 0; const failures: LLMFailure[] = [];
      const other: LLMProvider = provider === "openai" ? "anthropic" : "openai";
      globalThis.fetch = async () => { calls++; return calls === 1 ? response() : other === "openai" ? Response.json({ status: "completed", output_text: "{\"ok\":true}" }) : Response.json({ stop_reason: "end_turn", content: [{ type: "text", text: "{\"ok\":true}" }] }); };
      const result = await completeJson({ provider, model: "fixture", apiKey: "fixture" }, {
        system: "synthetic", user: "synthetic", maxOutputTokens: 30,
        failover: { alternate: { provider: other, model: "fixture", apiKey: "fixture" }, allowedErrors: ["unavailable"], totalTimeoutMs: 1000, attemptTimeoutMs: 500, minRemainingMs: 1, compatible: true, reserve: async () => ({ id: "fixture", begin: async () => true, cancel: async () => {}, settle: async () => {} }) },
        onFailure: failure => failures.push(failure),
      });
      assert.equal(failures[0]?.code, code, `${provider}/${label} display`);
      assert.equal(failures[0]?.retryable, retryable, `${provider}/${label} retry`);
      assert.equal(calls, retryable ? 2 : 1, `${provider}/${label} call count`);
      assert.equal(result !== null, retryable); groups++;
    }
    let calls = 0; globalThis.fetch = async () => { calls++; throw Error("must not call"); };
    await completeJson({ provider: "openai", model: "fixture", apiKey: "fixture" }, { system: "", user: "", maxOutputTokens: 10, signal: AbortSignal.abort() });
    assert.equal(calls, 0); groups++;
  } finally { globalThis.fetch = original; }
  console.log(`HTTP 524 classification: ${groups} groups passed; synthetic calls only`);
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
