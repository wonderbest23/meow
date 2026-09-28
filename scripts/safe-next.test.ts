import assert from "node:assert/strict";
import { safeNextPath } from "../lib/http/safe-next";
import { isSameOriginRequest } from "../lib/http/same-origin";

// 로그인 뒤 이동 경로: 내부 경로만 통과, 외부로 나가는 형태는 모두 버린다.
for (const ok of ["/plan", "/plan/chat?new=1", "/account#top", "/plan/workspace?id=a%2Fb"]) assert.equal(safeNextPath(ok), ok, ok);
for (const bad of ["//evil.com", "/\\evil.com", "/\\/evil.com", "https://evil.com", "evil.com", "", null, undefined, "javascript:alert(1)", "/%5Cevil.com\\x"]) assert.equal(safeNextPath(bad as string | null | undefined), null, String(bad));
// 로그인 API: 다른 사이트에서 온 요청은 거절, 같은 출처·헤더 없는 서버 간 호출은 통과
const req = (headers: Record<string, string>) => new Request("https://oneulstart.com/api/auth/session", { method: "POST", headers });
assert.equal(isSameOriginRequest(req({ origin: "https://oneulstart.com" })), true);
assert.equal(isSameOriginRequest(req({ origin: "https://evil.example" })), false);
assert.equal(isSameOriginRequest(req({ origin: "null" })), false, "sandboxed/opaque origins are rejected");
assert.equal(isSameOriginRequest(req({ referer: "https://oneulstart.com/account" })), true);
assert.equal(isSameOriginRequest(req({ referer: "https://evil.example/x" })), false);
assert.equal(isSameOriginRequest(req({})), true, "no browser headers: server-to-server call");
console.log("same-origin: cross-site login posts rejected; ");
console.log("safe-next: internal paths pass, protocol-relative, backslash, absolute and script URLs are rejected");
