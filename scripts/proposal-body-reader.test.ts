import assert from "node:assert/strict";
import { readBoundedJson, RequestBodyError } from "../lib/http/bounded-json";

const bytes = (text: string) => new TextEncoder().encode(text);
function streamed(chunks: Uint8Array[], headers?: HeadersInit, signal?: AbortSignal) {
  let index = 0, cancelled = false;
  const body = new ReadableStream<Uint8Array>({ pull(controller) { if (index < chunks.length) controller.enqueue(chunks[index++]); else controller.close(); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  return { request: new Request("http://127.0.0.1/body", { method: "POST", body, headers, signal, duplex: "half" } as RequestInit), pulls: () => index, cancelled: () => cancelled };
}
const is = (code: RequestBodyError["code"], status: number) => (error: unknown) => error instanceof RequestBodyError && error.code === code && error.status === status;
async function main() {
  const value = { title: "한글 경계 확인", note: "emoji 😀" }, payload = bytes(JSON.stringify(value));
  assert.deepEqual(await readBoundedJson(streamed([...payload].map(byte => Uint8Array.of(byte))).request, payload.length), value, "Split UTF-8 code points and exact byte limit");
  const over = streamed([payload.subarray(0, 5), payload.subarray(5)], { "content-length": "1" });
  await assert.rejects(readBoundedJson(over.request, payload.length - 1), is("body_too_large", 413)); assert(over.cancelled());
  const declared = streamed([payload], { "content-length": "999999999999999999999999" });
  await assert.rejects(readBoundedJson(declared.request, 100), is("body_too_large", 413)); assert.equal(declared.pulls(), 0); assert(declared.cancelled());
  assert.deepEqual(await readBoundedJson(streamed([payload], { "content-length": "garbage" }).request, payload.length), value, "Invalid Content-Length is never trusted as a bound");
  const many = streamed(Array.from({ length: 1000 }, () => bytes("0123456789")));
  await assert.rejects(readBoundedJson(many.request, 25), is("body_too_large", 413)); assert.equal(many.pulls(), 3); assert(many.cancelled(), "Stop consuming immediately after crossing the byte limit");
  await assert.rejects(readBoundedJson(streamed([Uint8Array.of(0xc3), Uint8Array.of(0x28)]).request, 10), is("invalid_body", 400));
  await assert.rejects(readBoundedJson(streamed([bytes('{"secret":"PRIVATE",')]).request, 100), error => is("invalid_body", 400)(error) && !String(error).includes("PRIVATE"));
  await assert.rejects(readBoundedJson(new Request("http://127.0.0.1/body", { method: "POST" }), 100), is("invalid_body", 400));
  const broken = new ReadableStream({ start(controller) { controller.error(new Error("PRIVATE TRANSPORT ERROR")); } });
  await assert.rejects(readBoundedJson(new Request("http://127.0.0.1/body", { method: "POST", body: broken, duplex: "half" } as RequestInit), 100), error => is("body_unreadable", 400)(error) && !String(error).includes("PRIVATE"));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(readBoundedJson(streamed([payload], undefined, controller.signal).request, 100), is("body_unreadable", 400));
  const pendingController = new AbortController(); let cancelled = false;
  const pendingBody = new ReadableStream({ cancel() { cancelled = true; } });
  const pending = readBoundedJson(new Request("http://127.0.0.1/body", { method: "POST", body: pendingBody, signal: pendingController.signal, duplex: "half" } as RequestInit), 100);
  pendingController.abort(); await assert.rejects(pending, is("body_unreadable", 400)); assert(cancelled);
  console.log("proposal bounded body: actual bytes, exact limit, split Unicode, early Content-Length rejection, lying/missing length, cancellation, invalid UTF-8/JSON, abort and safe errors passed");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
