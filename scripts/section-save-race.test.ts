import assert from "node:assert/strict";
import { COACH_KEY } from "../lib/plan-builder/coach";
import { emptyCoach } from "../lib/plan-builder/coach-job";
import { normalizeState, type ServerPlanState } from "../lib/plan-builder/plan-server-store";
import { generateAndSaveSection } from "../lib/plan-builder/section-service";

async function main() {
  Object.assign(process.env, { PERSISTENCE_MODE: "supabase", SUPABASE_URL: "https://section-race.invalid", SUPABASE_SERVICE_ROLE_KEY: "local-test-only", PLAN_ACCOUNT_LINKING_ENABLED: "false", OPENAI_API_KEY: "section-test-only", ANTHROPIC_API_KEY: "" });
  const at = "2026-01-01T00:00:00.000Z";
  const key = "overview/summary";
  const generated = "## 개선 계획\n\n운영 중인 사업에서 제공된 결과를 바탕으로 현재 상품을 유지하고 고객 반응을 기록하는 작은 실험을 제안합니다. 모르는 실적은 추정하지 않고 다음 확인 대상으로 남깁니다.";
  let stored: { data: ServerPlanState; updated_at: string } = { data: normalizeState({}), updated_at: at };
  let race: (() => void) | undefined;
  let aiCalls = 0, writes = 0, finalReads = 0, regenRecords = 0;
  let repeatRace = false;
  const original = globalThis.fetch;
  function seed() {
    const coach = { ...emptyCoach(), revision: 2, documentRevision: 2, stage: "operating" as const, ready: true, business: { ...emptyCoach().business, name: "운영 사업", stage: "운영 중" } };
    stored = { updated_at: at, data: normalizeState({ plans: [{ id: "race-plan", title: "운영 사업", planType: "사업 운영·개선 계획서", createdAt: at, updatedAt: at, answers: { [COACH_KEY]: { state: coach }, [key]: { planning_source: "coach" } }, sections: { [key]: { markdown: "기존 문서", html: "<p>기존 문서</p>", generatedAt: at, coachRevision: 1 } } }] }) };
    aiCalls = 0; writes = 0; finalReads = 0; regenRecords = 0; race = undefined; repeatRace = false;
  }
  function changed() {
    stored.updated_at = new Date(Date.parse(stored.updated_at) + 1).toISOString();
    stored.data.plans[0].updatedAt = stored.updated_at;
  }
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? "GET";
    if (url.hostname === "api.openai.com") {
      aiCalls++;
      const body = JSON.parse(String(init?.body));
      return Response.json({ status: "completed", output_text: body.text?.format?.name === "business_plan_review" ? JSON.stringify({ issues: [] }) : generated });
    }
    assert.equal(url.hostname, "section-race.invalid", "real external traffic is forbidden");
    const table = url.pathname.split("/").at(-1);
    if (table === "plan_regenerations") {
      if (method === "POST") regenRecords++;
      return method === "HEAD" ? new Response(null, { headers: { "content-range": "*/0" } }) : Response.json([]);
    }
    if (table === "plan_regen_packs") return Response.json([]);
    assert.equal(table, "plan_states");
    if (method === "GET") {
      const snapshot = structuredClone(stored);
      if (url.searchParams.get("select") === "data" && aiCalls > 0) {
        finalReads++;
        // Interleave after the service has obtained a snapshot, before its guarded save reads again.
        const mutation = race;
        if (!repeatRace) race = undefined;
        mutation?.();
      }
      return Response.json(snapshot);
    }
    assert.equal(method, "PATCH");
    if (url.searchParams.get("updated_at") !== `eq.${stored.updated_at}`) return Response.json([]);
    stored = JSON.parse(String(init?.body)); writes++;
    return Response.json([{ owner_hash: "race-owner" }]);
  };
  const job = { ownerHash: "race-owner", planId: "race-plan", chapterId: "overview", sectionId: "summary" };
  try {
    seed();
    race = () => { changed(); stored.data.plans[0].sections[key] = { ...stored.data.plans[0].sections[key], markdown: "다른 탭에서 직접 쓴 문서", html: "<p>직접 쓴 문서</p>", edited: true, generatedAt: stored.updated_at }; };
    assert.equal((await generateAndSaveSection(job)).skipped, "USER_EDITED");
    assert.equal(stored.data.plans[0].sections[key].markdown, "다른 탭에서 직접 쓴 문서");
    assert.equal(writes, 0); assert.equal(regenRecords, 0); assert.equal(aiCalls, 2);

    seed();
    race = () => { changed(); stored.data.plans[0].sections["overview/problem"] = { markdown: "다른 항목 수정", html: "<p>다른 항목 수정</p>", edited: true, generatedAt: stored.updated_at }; };
    assert.deepEqual(await generateAndSaveSection(job), { ok: true });
    assert.equal(stored.data.plans[0].sections[key].markdown, generated);
    assert.equal(stored.data.plans[0].sections[key].previous?.markdown, "기존 문서");
    assert.equal(stored.data.plans[0].sections["overview/problem"].markdown, "다른 항목 수정");
    assert.equal(finalReads, 2); assert.equal(aiCalls, 2, "commit retry must not repeat generation or review");
    assert.equal(writes, 1); assert.equal(regenRecords, 1);

    seed();
    race = () => { changed(); stored.data.plans[0].sections[key] = { ...stored.data.plans[0].sections[key], markdown: "다른 워커가 완성한 문서", coachRevision: 2, generatedAt: stored.updated_at }; };
    assert.equal((await generateAndSaveSection(job)).skipped, "ALREADY_GENERATED");
    assert.equal(stored.data.plans[0].sections[key].markdown, "다른 워커가 완성한 문서");
    assert.equal(writes, 0); assert.equal(regenRecords, 0);

    seed();
    race = () => { changed(); const coach = stored.data.plans[0].answers[COACH_KEY].state as { revision: number; documentRevision: number }; coach.revision++; coach.documentRevision++; };
    await assert.rejects(generateAndSaveSection(job), /BUSINESS_CONTEXT_CHANGED/);
    assert.equal(stored.data.plans[0].sections[key].markdown, "기존 문서");
    assert.equal(writes, 0); assert.equal(regenRecords, 0);

    seed(); repeatRace = true; race = changed;
    await assert.rejects(generateAndSaveSection(job), /PLAN_VERSION_CONFLICT/);
    assert.equal(finalReads, 4, "commit contention must stop after a bounded number of attempts");
    assert.equal(aiCalls, 2); assert.equal(regenRecords, 0);
    console.log("section save races: manual edit, independent edit, competing generation, business revision and bounded retries passed (mock AI/PostgREST)");
  } finally { globalThis.fetch = original; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
