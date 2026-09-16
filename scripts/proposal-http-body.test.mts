import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { cp, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import JSZip from "jszip";
import { proposalFixture } from "./proposal-fixtures";
import { upgradeProposalV3 } from "../lib/plan-builder/proposal-revision";

const root = fileURLToPath(new URL("..", import.meta.url)), temp = await mkdtemp("/private/tmp/oneul-proposal-http-");
for (const entry of ["app", "components", "lib", "data", "public", "package.json", "tsconfig.json", "next-env.d.ts"]) await cp(join(root, entry), join(temp, entry), { recursive: true, mode: constants.COPYFILE_FICLONE, filter: path => !/^\.env(?:\.|$)|^\.dev\.vars|^\.git$/.test(basename(path)) });
await cp(join(root, "scripts/prelaunch-next.config.ts"), join(temp, "next.config.ts"));
await symlink(join(root, "node_modules"), join(temp, "node_modules"), "dir");
// These adapters exist only in the isolated fixture directory, never in the application checkout.
await writeFile(join(temp, "lib/api-auth.ts"), `import { headers } from "next/headers";
export async function requireGuestIdentity() { const h = await headers(); return { hash: h.get("x-qa-owner") ?? "qa-owner", token: "qa", userId: "qa-user", email: null }; }
export const requireAuthenticatedIdentity = requireGuestIdentity;
`);
await writeFile(join(temp, "lib/plan-builder/access.ts"), `import { headers } from "next/headers";
export async function resolvePlanAccess() { const mode = (await headers()).get("x-qa-access"); return { authenticated: mode !== "guest", paid: mode !== "unpaid" }; }
`);
await mkdir(join(temp, "app/api/qa/seed"), { recursive: true });
await writeFile(join(temp, "app/api/qa/seed/route.ts"), `import { normalizeState, savePlanState } from "../../../../lib/plan-builder/plan-server-store";
export async function POST(request: Request) { if (process.env.QA_PROPOSAL_HTTP !== "local-fixture") return new Response(null, { status: 404 }); await savePlanState("qa-owner", normalizeState(await request.json())); return Response.json({ ok: true }); }
`);
const reserve = createServer(); await new Promise<void>(resolve => reserve.listen(0, "127.0.0.1", resolve));
const address = reserve.address(); assert(address && typeof address !== "string"); const port = address.port;
await new Promise<void>((resolve, reject) => reserve.close(error => error ? reject(error) : resolve()));
const origin = `http://127.0.0.1:${port}`, endpoint = `${origin}/api/plan/proposal`, maxBytes = 10_000_000;
const server = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: temp, env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", PERSISTENCE_MODE: "demo-memory", RATE_LIMIT_BACKEND: "memory", QA_PROPOSAL_HTTP: "local-fixture", APP_ENV: "staging", PAYMENTS_ENABLED: "false", OPERATING_AI_ENABLED: "false", PROPOSAL_AI_ENABLED: "false", NEXT_PUBLIC_PPT_GENERATION_VERIFIED: "false" }, stdio: ["ignore", "pipe", "pipe"] });
const exited = new Promise<void>(resolve => server.once("exit", () => resolve())); let logs = "";
server.stdout.on("data", data => { logs += data; }); server.stderr.on("data", data => { logs += data; });
const checks: string[] = [], errors: string[] = [];
const request = (path: string, init: RequestInit = {}) => fetch(`${origin}${path}`, { ...init, signal: AbortSignal.timeout(30000) });
function chunked(chunks: Buffer[], headers: Record<string, string> = {}, headerOnly = false): Promise<{ status: number; headers: import("node:http").IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    let responded = false;
    const req = httpRequest(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Connection: "close", ...headers } }, res => {
      responded = true; const parts: Buffer[] = []; res.on("data", chunk => parts.push(chunk)); res.on("error", reject);
      res.on("end", () => { req.destroy(); resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(parts).toString("utf8") }); });
    });
    req.setTimeout(30000, () => req.destroy(new Error("HTTP fixture timeout")));
    req.on("error", error => { if (!responded) reject(error); });
    if (headerOnly) req.flushHeaders(); else { for (const chunk of chunks) req.write(chunk); req.end(); }
  });
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error("Fixture server exited");
    try { ready = (await fetch(`${endpoint}?planId=missing`, { signal: AbortSignal.timeout(1000) })).status === 404; } catch {}
    if (ready) break; await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert(ready, "Fixture server did not become ready");
  const fixture = proposalFixture(), document = upgradeProposalV3({ revision: 1, ...fixture, edits: {} });
  const at = new Date().toISOString(), planId = "http-qa";
  const seed = { business: { name: fixture.source.businessName, description: fixture.source.businessDescription }, plans: [{ id: planId, title: fixture.source.businessName, createdAt: at, updatedAt: at, planType: "", sections: {}, answers: { __proposal_editor: { version: 1, revision: 1, savedAt: at, generationToken: "qa", fingerprint: "qa", document, history: [], receipts: [] } } }] };
  assert.equal((await request("/api/qa/seed", { method: "POST", body: JSON.stringify(seed) })).status, 200);
  const post = (command: unknown, headers: HeadersInit = {}) => request("/api/plan/proposal", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ planId, command }) });
  const command = { type: "save", expectedRevision: 1, requestId: randomUUID(), edits: {} };
  assert.equal((await post(command, { "x-qa-owner": "different-owner" })).status, 404);
  assert.equal((await post(command, { "x-qa-access": "guest" })).status, 401);
  assert.equal((await post(command, { "x-qa-access": "unpaid" })).status, 402);
  checks.push("Unchanged route ownership/authentication/payment decisions: 404/401/402");

  const bitmap = await sharp(randomBytes(600 * 400 * 3), { raw: { width: 600, height: 400, channels: 3 } }).png().toBuffer();
  const image = { id: "qa-image", data: `data:image/png;base64,${bitmap.toString("base64")}`, alt: "로컬 합성 이미지", width: 600, height: 400, fit: "contain" };
  const imageCommand = { ...command, requestId: randomUUID(), edits: { "proposal-cover": { content: { image } } } };
  const encoded = Buffer.from(JSON.stringify({ planId, command: imageCommand })); assert(encoded.length > 100000 && encoded.length < 2_000_000);
  const response = await post(imageCommand); assert.equal(response.status, 200, await response.clone().text());
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const saved = await response.json(); assert.equal(saved.saved.revision, 2); assert.equal(saved.saved.document.edits["proposal-cover"].content.image.data, image.data);
  const download = await request(`/api/plan/proposal?planId=${planId}&download=1&revision=2`); assert.equal(download.status, 200, await download.clone().text());
  const pptx = Buffer.from(await download.arrayBuffer()); assert((await JSZip.loadAsync(pptx)).file(/^ppt\/media\//).length > 0); await writeFile(join(temp, "http-image.pptx"), pptx);
  checks.push(`Real HTTP save and native PPTX download of a valid ${encoded.length}-byte image command (>100KB)`);

  const unicodeCommand = { ...imageCommand, expectedRevision: 2, requestId: randomUUID(), edits: { "proposal-cover": { ...imageCommand.edits["proposal-cover"], text: { title: "한글 문안 유지", note: "한글 경계 테스트" } } } };
  const unicode = Buffer.from(JSON.stringify({ planId, command: unicodeCommand })), first = unicode.indexOf(Buffer.from("한")); assert(first > 0);
  const streamed = await chunked([unicode.subarray(0, first + 1), unicode.subarray(first + 1, first + 2), unicode.subarray(first + 2)], { "Transfer-Encoding": "chunked" });
  assert.equal(streamed.status, 200, streamed.body); assert.equal(JSON.parse(streamed.body).saved.document.edits["proposal-cover"].text.title, "한글 문안 유지");
  checks.push("Real chunked transfer without Content-Length preserves a UTF-8 character split between chunks");

  const exact = Buffer.concat([Buffer.from("{}"), Buffer.alloc(maxBytes - 2, 32)]);
  const exactResponse = await chunked([exact], { "Transfer-Encoding": "chunked" }); assert.equal(exactResponse.status, 400); assert(JSON.parse(exactResponse.body).message.includes("수정 값"));
  const oversizedHeader = await chunked([], { "Content-Length": String(maxBytes + 1) }, true); assert.equal(oversizedHeader.status, 413); assert.equal(JSON.parse(oversizedHeader.body).code, "body_too_large");
  const largeUnicode = Buffer.from(JSON.stringify({ note: "한".repeat(Math.floor(maxBytes / 3) + 1) })); assert(largeUnicode.length > maxBytes && largeUnicode.toString().length < maxBytes);
  const largeChunks = []; for (let offset = 0; offset < largeUnicode.length; offset += 65536) largeChunks.push(largeUnicode.subarray(offset, offset + 65536));
  const oversizedStream = await chunked(largeChunks, { "Transfer-Encoding": "chunked" }); assert.equal(oversizedStream.status, 413); assert.equal(JSON.parse(oversizedStream.body).code, "body_too_large");
  const invalid = await chunked([Buffer.from('{"x":"'), Buffer.from([0xc3]), Buffer.from([0x28]), Buffer.from('"}')]); assert.equal(invalid.status, 400); assert.equal(JSON.parse(invalid.body).code, "invalid_body");
  checks.push("Real HTTP exact 10MB boundary, early oversized Content-Length, oversized chunked Unicode by bytes, invalid UTF-8");

  const overflow = { type: "save", requestId: randomUUID(), expectedRevision: 3, edits: { "proposal-cover": { text: { title: "넘치는 내용을 저장한 상태로 유지해요" }, layout: { title: { x: 1, y: 1, w: .25, h: .2 } } } } };
  assert.equal((await post(overflow)).status, 200);
  const layout = await request(`/api/plan/proposal?planId=${planId}&download=1&revision=4`); assert.equal(layout.status, 422);
  const layoutError = await layout.json(); assert.equal(layoutError.code, "proposal_layout_review_required"); assert(layoutError.message.includes("저장된 편집본은 그대로"));
  const reloaded = await (await request(`/api/plan/proposal?planId=${planId}`)).json(); assert.equal(reloaded.saved.revision, 4); assert.equal(reloaded.saved.document.edits["proposal-cover"].text.title, overflow.edits["proposal-cover"].text.title);
  checks.push("Useful 422 layout-review response from the genuine renderer, preserving the saved draft");
  for (let index = 0; index < 60; index++) assert.equal((await request("/api/plan/proposal", { method: "POST", headers: { "cf-connecting-ip": "save-rate-fixture" }, body: "{}" })).status, 400);
  const limited = await chunked([], { "cf-connecting-ip": "save-rate-fixture", "Content-Length": String(maxBytes + 1) }, true); assert.equal(limited.status, 429); assert(limited.headers["retry-after"]);
  for (let index = 0; index < 12; index++) assert.equal((await request(`/api/plan/proposal?planId=${planId}&download=1&revision=4`, { headers: { "cf-connecting-ip": "download-rate-fixture" } })).status, 422);
  assert.equal((await request(`/api/plan/proposal?planId=${planId}&download=1&revision=4`, { headers: { "cf-connecting-ip": "download-rate-fixture" } })).status, 429);
  checks.push("Unmodified real save 60/min and download 12/10min rate limits, with rate rejection before body consumption");
} catch (error) { errors.push(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; }
finally {
  server.kill("SIGTERM"); const timer = setTimeout(() => server.kill("SIGKILL"), 5000); await exited; clearTimeout(timer);
  await writeFile(join(temp, "server.log"), logs);
  const report = { passed: errors.length === 0, checks, errors, output: temp, realHttp: true, realRouteBodyReaderEditorRateLimiterAndRenderer: true, authInputsStubbedInIsolatedCopy: true, memoryPersistence: true, paidCalls: 0, serverStopped: true };
  await writeFile(join(temp, "report.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
}
