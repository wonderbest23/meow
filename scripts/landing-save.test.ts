import assert from "node:assert/strict";
import { createLandingDraft } from "../lib/landing/domain";
import { landingDraftFingerprint } from "../lib/landing/save-contract";
import { persistLandingDraft, LandingSaveError } from "../lib/landing/save-client";

async function main() {
  process.env.PERSISTENCE_MODE = "demo-memory";
  process.env.SUPABASE_URL = ""; process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  const { createProject } = await import("../lib/project-repository");
  const { saveLandingDraft, getLandingForProject } = await import("../lib/landing/repository");
  const project = await createProject({ opportunity: { title: "save-test" }, founderProfile: {}, paymentStatus: "paid", packagePrice: 0 }, "owner");
  const draft = createLandingDraft({ title: "저장 검증", oneLiner: "사진 서비스", customer: "가게", model: "", sector: "" });
  const first = await saveLandingDraft(project.id, "owner", draft, { expectedUpdatedAt: null });
  await assert.rejects(saveLandingDraft(project.id, "owner", draft, { expectedUpdatedAt: null }), /LANDING_DRAFT_CONFLICT/);
  await assert.rejects(saveLandingDraft(project.id, "someone-else", draft, { expectedUpdatedAt: first.updatedAt }), /PROJECT_NOT_FOUND/);
  const results = await Promise.allSettled([
    saveLandingDraft(project.id, "owner", { ...draft, headline: "탭 A" }, { expectedUpdatedAt: first.updatedAt }),
    saveLandingDraft(project.id, "owner", { ...draft, headline: "탭 B" }, { expectedUpdatedAt: first.updatedAt }),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.filter(r => r.status === "rejected").length, 1);
  const saved = (await getLandingForProject(project.id, "owner"))!;
  assert.equal(saved.draft.headline, "탭 A");
  assert.notEqual(saved.updatedAt, first.updatedAt);
  const retry = await saveLandingDraft(project.id, "owner", saved.draft, { expectedUpdatedAt: first.updatedAt });
  assert.equal(retry.updatedAt, saved.updatedAt, "A lost response can be retried without a second write");
  assert.equal((await getLandingForProject(project.id, "owner"))!.draft.headline, "탭 A", "Reload returns persisted content");
  assert.equal(landingDraftFingerprint({ a: 1, b: { c: 2, d: 3 } }), landingDraftFingerprint({ b: { d: 3, c: 2 }, a: 1 }));

  const originalFetch = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = async (_url, init) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.expectedUpdatedAt, saved.updatedAt);
      assert.equal(body.draft.headline, "탭 A");
      return Response.json({ site: saved });
    };
    assert.equal((await persistLandingDraft(project.id, saved.draft, saved.updatedAt)).updatedAt, saved.updatedAt);
    assert.equal(calls, 1);
    globalThis.fetch = async () => Response.json({ error: { code: "LANDING_DRAFT_CONFLICT" } }, { status: 409 });
    await assert.rejects(persistLandingDraft(project.id, draft, saved.updatedAt), error => error instanceof LandingSaveError && error.code === "LANDING_DRAFT_CONFLICT");
    globalThis.fetch = async () => { throw new TypeError("offline"); };
    await assert.rejects(persistLandingDraft(project.id, draft, saved.updatedAt), /수정 내용은 유지/);
    globalThis.fetch = async () => Response.json({ site: { ...saved, projectId: "another" } });
    await assert.rejects(persistLandingDraft(project.id, draft, saved.updatedAt), /저장 결과를 확인하지 못/);
    globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      if (init?.signal?.aborted) reject(new Error("aborted"));
    });
    await assert.rejects(persistLandingDraft(project.id, draft, saved.updatedAt, { timeoutMs: 5 }), error => error instanceof LandingSaveError && error.code === "LANDING_SAVE_ABORTED");
    const controller = new AbortController();
    const pending = persistLandingDraft(project.id, draft, saved.updatedAt, { signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, error => error instanceof LandingSaveError && error.code === "LANDING_SAVE_ABORTED");
  } finally { globalThis.fetch = originalFetch; }
  console.log("landing-save: ownership, concurrent tabs, reload, idempotent retry, conflict, network failure, invalid response, timeout and cancellation passed");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
