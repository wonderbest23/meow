import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { studioRedirectHref } from "../lib/plan-builder/studio";

/*
 * 화면 전환 지킴이 — 2026-11-08 전수조사에서 나온 두 종류가 다시 생기지 않게.
 * 1) 새 화면을 만들고 로딩 모양을 안 정하면, 들어가는 동안 머리 없는 빈 화면(또는 예전 머리줄)이 잠깐 보인다.
 * 2) 예전 주소가 예전 화면을 그린 뒤에 작업실로 보내면, 예전 디자인이 잠깐 보인다 — 서버(middleware)가 먼저 보내야 한다.
 */

/* 1) app/plan 아래 모든 화면은 로딩 모양이 정해져 있어야 한다 */
const loading = readFileSync("app/plan/loading.tsx", "utf8");
const covered = new Set([...loading.matchAll(/"(\/plan[^"]*)"/g)].map(match => match[1].replace(/\/$/, "") || "/plan"));
/* 일부러 따로 정하지 않은 화면 — 이유를 함께 적는다 */
const EXEMPT: Record<string, string> = {
  "/plan/proposal": "앱 안에 들어오는 링크가 없다(주소를 직접 열 때만)",
};

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return pages(path);
    return name === "page.tsx" ? [path] : [];
  });
}

const missing: string[] = [];
for (const file of pages("app/plan")) {
  const dir = file.replace(/\/page\.tsx$/, "");
  const route = "/" + dir.replace(/^app\//, "");
  const source = readFileSync(file, "utf8");
  if (covered.has(route) || route in EXEMPT) continue;
  if (existsSync(join(dir, "loading.tsx"))) continue;
  if (source.includes("LegacyPlanRedirect")) continue; // 예전 흐름 주소 — 로딩만 보이고 바로 옮긴다
  if (covered.has("/plan/info") && route.startsWith("/plan/info/")) continue;
  missing.push(route);
}
assert.deepEqual(missing, [], `로딩 모양이 정해지지 않은 화면: ${missing.join(", ")} — app/plan/loading.tsx 에 진짜 화면과 같은 머리(제목·뒤로)를 추가하거나 EXEMPT 에 이유를 적으세요`);

/* 2) 예전 화면 주소는 서버에서 바로 작업실로 */
const middleware = readFileSync("middleware.ts", "utf8");
assert.match(middleware, /studioRedirectHref\(/, "middleware 가 예전 화면 주소를 작업실로 보내야 한다");
for (const old of ["/plan/chat?planId=p", "/plan/chat?new=1", "/plan/document?planId=p", "/plan/homepage?planId=p", "/plan/workspace?planId=p&tab=launch", "/plan/workspace?planId=p&tab=operations"]) {
  assert.match(studioRedirectHref(old) ?? "", /^\/plan\/studio/, `${old} 가 작업실로 가지 않는다`);
}

/* 3) 로그인한 사람의 첫 화면(/)도 서버에서 바로 내 사업으로 — 화면에서 보내면 소개 화면이 잠깐 보인다 */
assert.match(middleware, /pathname === "\/" && request\.cookies\.has\("venture_refresh"\)/, "로그인한 사람은 서버가 / → /plan 으로 보내야 한다");

console.log("route-loading: ok");
