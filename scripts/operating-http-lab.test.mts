import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { previousPeriod, referenceFor, type OperatingState, type PeriodInput } from "../lib/plan-builder/operating-records";

// No credentials or production URL: this suite only calls the guarded local memory fixture.
const base = "http://127.0.0.1:8095";
let cookie = "";
const request = (path: string, method = "GET", body?: unknown, owner = cookie) => fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", Cookie: owner }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const fixture = await request("/api/dev/business-journeys", "POST");
assert.equal(fixture.status, 200, "Start only the isolated BUSINESS_JOURNEY_LAB server");
cookie = fixture.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
assert.ok(cookie);
const href = new URL((await fixture.json()).href, base);
const planId = href.searchParams.get("planId")!;
const path = `/api/plan/operations?planId=${planId}`;
const post = (command: unknown, owner = cookie) => request("/api/plan/operations", "POST", { planId, command }, owner);
let response = await request(path);
assert.equal(response.status, 200);
assert.match(response.headers.get("cache-control")!, /no-store/);
assert.equal((await request(path, "GET", undefined, "")).status, 404);
const input: PeriodInput = { start: "2026-08-01", end: "2026-08-07", metrics: { inquiries: null, orders: 0, revenue: 100000, expenses: 50000 }, feedback: "HTTP 가상 고객 반응", keep: "상품 품질", change: "응대 시간", nextAction: "하루 안에 답변", successCriterion: "응답 시간 기록" };
const first = { action: "save", id: randomUUID(), expectedRevision: null, input };
assert.equal((await post({ ...first, input: { ...input, metrics: { ...input.metrics, orders: -1 } } })).status, 400);
assert.equal((await post(first, "")).status, 404);
response = await post(first); assert.equal(response.status, 200);
assert.equal((await post(first)).status, 200);
const second = { ...first, id: randomUUID(), input: { ...input, start: "2026-08-08", end: "2026-08-21", metrics: { ...input.metrics, orders: 3, revenue: 200000 } } };
assert.equal((await post(second)).status, 200);
assert.equal((await post({ ...first, id: randomUUID() })).status, 400);
const edits = await Promise.all([
  post({ ...second, expectedRevision: 1, input: { ...second.input, feedback: "탭 A 저장" } }),
  post({ ...second, expectedRevision: 1, input: { ...second.input, feedback: "탭 B 저장" } }),
]);
assert.deepEqual(edits.map(r => r.status).sort(), [200, 409]);
let records = (await (await request(path)).json()).records as OperatingState;
assert.equal(records.periods.length, 2);
const current = records.periods.find(p => p.id === second.id)!;
const archive = { action: "report", id: randomUUID(), reference: referenceFor(current, previousPeriod(records.periods, current)) };
assert.equal((await post({ ...archive, reference: { ...archive.reference, revision: 1 } })).status, 409);
assert.equal((await post(archive)).status, 200);
assert.equal((await post(archive)).status, 200);
assert.equal((await post({ ...second, expectedRevision: current.revision, input: { ...second.input, metrics: { ...second.input.metrics, revenue: 900000 } } })).status, 200);
records = (await (await request(path)).json()).records;
assert.equal(records.reports.length, 1);
assert.equal(records.reports[0].period.metrics.revenue, 200000);
assert.equal(records.periods.find(p => p.id === second.id)?.metrics.revenue, 900000);
response = await request(`${path}&reportId=${archive.id}`);
assert.equal(response.status, 200);
assert.match(response.headers.get("content-disposition")!, /^attachment;/);
assert.match(response.headers.get("content-type")!, /text\/markdown/);
const markdown = await response.text();
assert.match(markdown, /200,000원/);
assert.doesNotMatch(markdown, /900,000원/);
assert.match(markdown, /기간 길이가 달라/);
assert.equal((await request(`${path}&reportId=${archive.id}`, "GET", undefined, "")).status, 404);
assert.equal((await request(`${path}&reportId=${randomUUID()}`)).status, 404);
console.log("operating HTTP lab: ownership, validation, save/reload, overlapping periods, concurrent edit 409, report replay, immutable archive and authenticated download passed");
