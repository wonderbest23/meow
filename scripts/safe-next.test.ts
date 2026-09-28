import assert from "node:assert/strict";
import { safeNextPath } from "../lib/http/safe-next";

// 로그인 뒤 이동 경로: 내부 경로만 통과, 외부로 나가는 형태는 모두 버린다.
for (const ok of ["/plan", "/plan/chat?new=1", "/account#top", "/plan/workspace?id=a%2Fb"]) assert.equal(safeNextPath(ok), ok, ok);
for (const bad of ["//evil.com", "/\\evil.com", "/\\/evil.com", "https://evil.com", "evil.com", "", null, undefined, "javascript:alert(1)", "/%5Cevil.com\\x"]) assert.equal(safeNextPath(bad as string | null | undefined), null, String(bad));
console.log("safe-next: internal paths pass, protocol-relative, backslash, absolute and script URLs are rejected");
