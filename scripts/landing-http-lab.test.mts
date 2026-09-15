import assert from "node:assert/strict";
import type { LandingSiteRecord } from "../lib/landing/domain";

// Deliberately fixed to the credential-free, memory-only fixture server.
const base = "http://127.0.0.1:8095";
let cookie = "";
async function request(path: string, method = "GET", body?: unknown, owner = cookie) {
  return fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", Cookie: owner }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const fixture = await request("/api/dev/homepage-editor", "POST");
assert.equal(fixture.status, 200, "Start only the isolated HOMEPAGE_EDITOR_LAB server");
cookie = fixture.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
assert.ok(cookie);
const initial = (await fixture.json()).site as LandingSiteRecord;
const path = `/api/projects/${initial.projectId}/landing`;
assert.equal((await request(path)).status, 200);
assert.equal((await request(path, "PUT", initial.draft)).status, 428, "Old clients cannot bypass version checks");
assert.equal((await request(path, "PUT", { draft: initial.draft, expectedUpdatedAt: initial.updatedAt }, "")).status, 404, "Another owner cannot save");
assert.equal((await request(path, "PUT", { draft: initial.draft, expectedUpdatedAt: "invalid" })).status, 400);
const draftA = { ...initial.draft, headline: "HTTP 탭 A" };
const results = await Promise.all([
  request(path, "PUT", { draft: draftA, expectedUpdatedAt: initial.updatedAt }),
  request(path, "PUT", { draft: { ...initial.draft, headline: "HTTP 탭 B" }, expectedUpdatedAt: initial.updatedAt }),
]);
assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
const winner = await results.find(result => result.status === 200)!.json() as { site: LandingSiteRecord };
const loser = await results.find(result => result.status === 409)!.json();
assert.equal(loser.error.code, "LANDING_DRAFT_CONFLICT");
const loaded = await (await request(path)).json();
assert.equal(loaded.site.draft.headline, winner.site.draft.headline);
const retry = await request(path, "PUT", { draft: winner.site.draft, expectedUpdatedAt: initial.updatedAt });
assert.equal(retry.status, 200);
assert.equal((await retry.json()).site.updatedAt, winner.site.updatedAt);
assert.equal((await request(path, "PUT", { draft: { ...winner.site.draft, headline: " " }, expectedUpdatedAt: winner.site.updatedAt })).status, 400);
console.log("landing HTTP lab: load, required version, owner isolation, invalid token, concurrent save, reload, retry and invalid draft passed");
