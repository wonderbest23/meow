import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { landingDraftFromPlan } from "../lib/landing/from-plan";
import { landingCanonicalUrl, landingShareMetadata } from "../lib/landing/share-card";
import { closedForLaunch } from "../lib/launch-scope";
import { COACH_KEY, COACH_VERSION, type CoachState } from "../lib/plan-builder/coach";

/* 점검 r42-B(속도·용량·검색) — 화면 모양은 그대로, 받는 양·캐시·검색 정보만 */

// 1) 모든 화면이 바깥 글꼴 CSS(rsms.me)를 받을 때까지 그려지지 않던 @import 를 뺐다. Inter 는 편집기에서 쓸 때만 받는다.
const layout = readFileSync("app/layout.tsx", "utf8");
assert.ok(!layout.includes('"@puckeditor/core/puck.css"'), "puck.css 는 맨 위에 바깥 CSS @import 가 있다 — no-external 판을 쓴다");
assert.match(layout, /import "@puckeditor\/core\/no-external\.css";\nimport "\.\/puck-inter-font\.css";/);
const interCss = readFileSync("app/puck-inter-font.css", "utf8");
assert.ok(!/^\s*@import/m.test(interCss), "글꼴 선언 파일에는 @import 가 없다(그려지기 전에 받는 바깥 요청이 없다)");
assert.match(interCss, /font-family: InterVariable;[^}]*font-weight: 100 900;[^}]*font-display: swap;[^}]*InterVariable\.woff2/, "편집기 글꼴은 예전과 같은 파일");
assert.ok(!/^\s*@import/m.test(readFileSync("node_modules/@puckeditor/core/dist/no-external.css", "utf8")), "no-external.css 에는 @import 가 없다");

// 2) 공개 홈페이지 글꼴(Urbanist·Rubik)은 그 글꼴을 쓰는 화면에서만 받는다 — 첫 화면·로그인·내 사업·약관에서 미리 받지 않는다
const brainwave = readFileSync("components/brainwave-page.tsx", "utf8");
for (const name of ["urbanist-latin", "rubik-latin"]) assert.match(brainwave, new RegExp(`localFont\\(\\{ src: "\\./fonts/${name}\\.woff2"[^)]*preload: false`), `${name} 미리 받기 끔`);

// 3) 캐시: 내용 지문이 이름에 든 _next/static 은 오래 두고, 이름이 같은 채 바뀌는 /home-media 는 매번 확인
const headers = readFileSync("public/_headers", "utf8");
assert.match(headers, /^\/_next\/static\/\*\n  Cache-Control: public,max-age=31536000,immutable$/m);
assert.match(headers, /^\/home-media\/\*\n  Cache-Control: public,max-age=0,must-revalidate$/m);

// 4) 검색: 로그인 뒤 화면·관리자·결제·개발용 주소는 로봇에서 빼고, 개발용 API·화면은 운영에서 닫힌다
const robots = readFileSync("app/robots.ts", "utf8");
for (const path of ["/api/", "/plan", "/account", "/admin", "/payment", "/dev"]) assert.ok(robots.includes(`"${path}"`), `robots.txt 가 ${path} 를 막는다`);
const prod = { NODE_ENV: "production" };
assert.equal(closedForLaunch("/api/dev/synthetic-login", prod), "api");
assert.equal(closedForLaunch("/api/dev/synthetic-generate", prod), "api");
assert.equal(closedForLaunch("/dev/bw", prod), "page");
assert.equal(closedForLaunch("/launch/some-shop", prod), null, "공개 홈페이지는 열려 있다");
const sitemap = readFileSync("app/sitemap.ts", "utf8");
for (const hidden of ["/plan", "/account", "/admin", "/dev", "/payment"]) assert.ok(!sitemap.includes(`path: "${hidden}`), `사이트맵에 ${hidden} 없음`);

// 5) 공개 홈페이지 대표 주소(canonical)·공유 주소 — www 는 oneulstart.com 으로, 내 도메인은 그 도메인 그대로
const coach: CoachState = {
  version: COACH_VERSION, revision: 1, stage: "startup", depth: "quick", ready: true, messages: [], suggestions: [],
  business: { name: "새벽커피", description: "", role: "", industry: "카페 · 음식점", region: "", stage: "사업 기획" },
  fields: [{ key: "offer", value: "핸드드립 커피", basis: "user", quote: "핸드드립 커피", messageId: "a" }],
};
const draft = landingDraftFromPlan({ planTitle: "새벽커피", business: {}, answers: { [COACH_KEY]: { state: coach } } });
const launch = landingShareMetadata(draft, "https://oneulstart.com", "/launch/saebyeok-coffee");
assert.equal(launch.alternates?.canonical, "https://oneulstart.com/launch/saebyeok-coffee");
assert.equal((launch.openGraph as { url?: string }).url, "https://oneulstart.com/launch/saebyeok-coffee");
assert.equal(landingCanonicalUrl("https://www.oneulstart.com", "/launch/a"), "https://oneulstart.com/launch/a");
const own = landingShareMetadata(draft, "https://saebyeok.kr");
assert.equal(own.alternates?.canonical, "https://saebyeok.kr/", "내 도메인은 그 도메인 첫 화면이 대표 주소");
assert.deepEqual(own.robots, { index: true, follow: true }, "공개 홈페이지는 그대로 검색에 올린다");

console.log("speed-seo r42-B: no render-blocking external CSS, unused font preloads off, hashed assets cached, robots/sitemap/dev routes closed, landing canonical passed");
